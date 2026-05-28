import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../services/logger';
import { CompletionReportArtifact, parseCompletionReport } from './completionReportParser';
import { writeWatchdogDiagnosticArtifact, planGraphPath } from './artifactStore';
import { readPlanGraph, validateFanIn } from './planGraph';
import { readTaskPlan } from './planningPass';
import { resolveHandoffDir } from './handoffManager';
import {
  autoCompleteSatisfiedAncestors,
  bumpMutationCount,
  findTaskById,
  inspectClaimOwnership,
  inspectTaskGraph,
  isDocumentationMode,
  parseTaskFile,
  resolveStaleClaimByTask,
  withTaskFileLock,
  stringifyTaskFile
} from './taskFile';
import { applySuggestedChildTasksToFile } from './taskCreation';
import {
  RalphCompletionClassification,
  RalphHandoff,
  RalphIterationResult,
  RalphTask,
  RalphTaskFile,
  RalphWatchdogAction
} from './types';
import { getEffectivePolicy } from './rolePolicy';
import type { PreparedIterationContext } from './iterationPreparation';
import {
  type ReconciliationState,
  type RejectionReason,
  runGatePipeline
} from './reconciliationGates';

function buildRejectedOutcome(
  state: ReconciliationState,
  artifactBase: CompletionReportArtifact,
  reason: RejectionReason,
  warnings: readonly string[],
  needsHumanReview: boolean
): CompletionReconciliationOutcome {
  const warningList = [...warnings];
  return {
    artifact: {
      ...artifactBase,
      status: 'rejected',
      rejectionReason: reason,
      warnings: warningList,
      ...(needsHumanReview ? { needsHumanReview: true } : {})
    },
    selectedTask: state.selectedTask,
    progressChanged: false,
    taskFileChanged: false,
    claimContested: reason === 'claim_contested',
    warnings: warningList
  };
}

type PreludeResult =
  | { kind: 'shortcircuit'; outcome: CompletionReconciliationOutcome }
  | { kind: 'state'; state: ReconciliationState; artifactBase: CompletionReportArtifact };

async function buildReconciliationPrelude(input: ReconcileCompletionReportInput): Promise<PreludeResult> {
  const parsed = parseCompletionReport(input.lastMessage);
  const artifactBase: CompletionReportArtifact = {
    schemaVersion: 1,
    kind: 'completionReport',
    status: parsed.status === 'parsed' ? 'rejected' : parsed.status,
    rejectionReason: null,
    selectedTaskId: input.selectedTask?.id ?? null,
    report: parsed.report,
    rawBlock: parsed.rawBlock,
    parseError: parsed.parseError,
    warnings: [...parsed.warnings]
  };

  if (!input.selectedTask || input.prepared.promptKind === 'replenish-backlog') {
    artifactBase.status = 'missing';
    return {
      kind: 'shortcircuit',
      outcome: {
        artifact: artifactBase,
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        claimContested: false,
        warnings: []
      }
    };
  }

  if (parsed.status !== 'parsed' || !parsed.report) {
    const warnings = parsed.status === 'invalid' && parsed.parseError
      ? [...parsed.warnings, parsed.parseError]
      : parsed.status === 'missing'
        ? [...parsed.warnings, 'No completion report JSON block was found at the end of the Codex last message.']
        : [...parsed.warnings];
    artifactBase.warnings = warnings;
    return {
      kind: 'shortcircuit',
      outcome: {
        artifact: { ...artifactBase, warnings },
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        claimContested: false,
        warnings
      }
    };
  }

  const acceptedHandoffs = await scanAcceptedHandoffs(resolveHandoffDir(input.prepared.paths.ralphDir));
  const taskPlan = await readTaskPlan(input.prepared.paths.artifactDir, input.selectedTask.id);
  const suggestedValidationFromPlan = taskPlan?.suggestedValidationCommand ?? null;
  const policy = getEffectivePolicy(input.prepared.config.agentRole ?? 'implementer');

  const state: ReconciliationState = {
    prepared: input.prepared,
    selectedTask: input.selectedTask,
    report: parsed.report,
    verificationStatus: input.verificationStatus,
    validationCommandStatus: input.validationCommandStatus,
    preliminaryClassification: input.preliminaryClassification,
    acceptedHandoffs,
    suggestedValidationFromPlan,
    policy
  };

  return { kind: 'state', state, artifactBase };
}

export interface CompletionReconciliationOutcome {
  artifact: CompletionReportArtifact;
  selectedTask: RalphTask | null;
  progressChanged: boolean;
  taskFileChanged: boolean;
  claimContested: boolean;
  warnings: string[];
}

export interface ReconcileCompletionReportInput {
  prepared: PreparedIterationContext;
  selectedTask: RalphTask | null;
  verificationStatus: RalphIterationResult['verificationStatus'];
  validationCommandStatus: RalphIterationResult['verificationStatus'];
  preliminaryClassification: RalphCompletionClassification;
  lastMessage: string;
  taskFilePath: string;
  logger: Logger;
}

export async function reconcileCompletionReport(
  input: ReconcileCompletionReportInput
): Promise<CompletionReconciliationOutcome> {
  const prelude = await buildReconciliationPrelude(input);
  if (prelude.kind === 'shortcircuit') {
    return prelude.outcome;
  }
  const { state, artifactBase } = prelude;
  const report = state.report;

  const warnings: string[] = [...artifactBase.warnings];
  const pipelineResult = runGatePipeline(state);
  if (pipelineResult.kind === 'rejected') {
    return buildRejectedOutcome(
      state,
      artifactBase,
      pipelineResult.reason,
      [...warnings, ...pipelineResult.warnings],
      pipelineResult.needsHumanReview
    );
  }
  warnings.push(...pipelineResult.warnings);


  let handoffScopeViolation = false;
  if (state.acceptedHandoffs.some((h) => h.taskId !== report.selectedTaskId)) {
    warnings.push(
      'Completion report task does not match accepted handoff scope; downgrading to review required'
    );
    handoffScopeViolation = true;
  }

  const requestedStatus = report.requestedStatus;
  if (requestedStatus === 'done') {
    // Allow reconciliation when the validation command passed, even if gitDiff
    // failed (no code changes needed — the task was already complete).  The
    // taskState verifier runs *after* reconciliation and will confirm the
    // status change in tasks.json, so the final verification still has a
    // meaningful gate.
    //
    // Documentation-mode tasks skip the validation gate entirely because their
    // deliverables (markdown, text) are not verifiable by code-centric commands.
    const validationGatePassed = state.validationCommandStatus === 'passed';
    const docMode = isDocumentationMode(state.selectedTask);
    const taskStateOnlyGate = state.prepared.config.verifierModes.includes('taskState')
      && !state.prepared.config.verifierModes.includes('validationCommand')
      && !state.prepared.config.verifierModes.includes('gitDiff')
      && state.prepared.config.gitCheckpointMode !== 'snapshotAndDiff';
    if (!validationGatePassed
      && state.verificationStatus !== 'passed'
      && !docMode
      && !taskStateOnlyGate) {
      warnings.push(`Completion report requested done, but verification status was ${state.verificationStatus}.`);
    }
    if (report.needsHumanReview) {
      warnings.push('Completion report requested done while also declaring needsHumanReview.');
    }
    if (warnings.length > 0) {
      return {
        artifact: {
          ...artifactBase,
          rejectionReason: report.needsHumanReview
            ? 'needs_human_review_with_done'
            : 'verification_failed',
          warnings
        },
        selectedTask: state.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        claimContested: false,
        warnings
      };
    }

    // Non-blocking observability: surface when an agent marks a task done without
    // reporting that it ran the configured validation command.  Ralph's own
    // verifierStatus already provides the hard enforcement gate; this warning
    // makes skipped validation self-reporting visible in parallel-run artefacts.
    if (state.prepared.validationCommand && !report.validationRan) {
      warnings.push(
        `Completed task without reporting validationRan; configured validation command was '${state.prepared.validationCommand}'.`
      );
    }
  }

  if (requestedStatus === 'blocked' && state.preliminaryClassification === 'complete') {
    warnings.push('Completion report requested blocked, but the preliminary outcome already classified the task as complete.');
    return {
      artifact: {
        ...artifactBase,
        rejectionReason: 'blocked_overrides_complete',
        warnings
      },
      selectedTask: state.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: false,
      warnings
    };
  }

  let taskFileChanged = false;
  let progressChanged = false;
  const suggestedValidationFromPlan = state.suggestedValidationFromPlan;

  // Advisory: if the planner proposed a validation command that is a strict
  // superset of the one Ralph is actually using, warn so operators can decide
  // whether to adopt the stronger command in the task definition.
  if (state.prepared.validationCommand && suggestedValidationFromPlan) {
    const normalBase = state.prepared.validationCommand.trim().replace(/\s+/g, ' ');
    const normalSuggested = suggestedValidationFromPlan.trim().replace(/\s+/g, ' ');
    if (normalSuggested !== normalBase
      && (normalSuggested.startsWith(normalBase + ' ')
        || normalSuggested.startsWith(normalBase + '&')
        || normalSuggested.startsWith(normalBase + '|'))) {
      warnings.push(
        `planner_suggested_stronger_validation_not_used: planner suggested "${suggestedValidationFromPlan}" but Ralph used "${state.prepared.validationCommand}". Consider adopting the stronger command in the task's validation field.`
      );
    }
  }

  // Claim ownership re-check, task-file write, and progress.md append all happen inside a
  // single task-file lock to eliminate the TOCTOU window and the unprotected progress.md
  // read-modify-write that existed when these operations ran sequentially outside any lock.
  const verificationResult = await updateTaskFileWithVerification(
    input.taskFilePath,
    state.prepared.paths.claimFilePath,
    state.selectedTask.id,
    state.prepared.config.agentId,
    state.prepared.provenanceId,
    state.prepared.paths.progressPath,
    report.progressNote ?? null,
    (taskFile) => {
      const selectedTaskUpdated: RalphTaskFile = {
        ...taskFile,
        tasks: taskFile.tasks.map((task) => {
          if (task.id !== state.selectedTask.id) {
            return task;
          }

          const nextTask: RalphTask = {
            ...task,
            status: requestedStatus,
            notes: report.progressNote ?? task.notes,
            blocker: requestedStatus === 'blocked'
              ? report.blocker ?? task.blocker
              : task.blocker
          };

          if (requestedStatus !== 'blocked' && report.blocker) {
            nextTask.blocker = report.blocker;
          }

          // Populate validation from task-plan.json suggestedValidationCommand
          // only when the task's validation field was empty.
          if (!nextTask.validation && suggestedValidationFromPlan) {
            nextTask.validation = suggestedValidationFromPlan;
          }

          // Persist verifier result so fan-in gates can aggregate child outcomes.
          const verifierResult: RalphTask['lastVerifierResult'] =
            state.verificationStatus === 'passed' ? 'passed'
              : state.verificationStatus === 'skipped' ? 'skipped'
                : state.verificationStatus ? 'failed'
                  : undefined;
          if (verifierResult) {
            nextTask.lastVerifierResult = verifierResult;
          }

          // Capture conflict warnings so fan-in can detect unresolved merge conflicts.
          const conflictWarning = warnings.find(w => w.toLowerCase().includes('conflict'));
          if (conflictWarning) {
            nextTask.lastReconciliationWarning = conflictWarning;
          }

          taskFileChanged = nextTask.status !== task.status
            || nextTask.notes !== task.notes
            || nextTask.blocker !== task.blocker
            || nextTask.validation !== task.validation
            || nextTask.lastVerifierResult !== task.lastVerifierResult
            || nextTask.lastReconciliationWarning !== task.lastReconciliationWarning;

          return nextTask;
        })
      };

      if (requestedStatus !== 'done') {
        return selectedTaskUpdated;
      }

      const ancestorCompletion = autoCompleteSatisfiedAncestors(selectedTaskUpdated, state.selectedTask.id);
      if (ancestorCompletion.completedAncestorIds.length > 0) {
        taskFileChanged = true;
      }

      return ancestorCompletion.taskFile;
    }
  );

  if (verificationResult.claimContested) {
    warnings.push(
      `Completion report claim ownership check failed for ${state.selectedTask.id}; canonical holder was ${verificationResult.canonicalHolder ?? 'none'}.`
    );
    return {
      artifact: {
        ...artifactBase,
        rejectionReason: 'claim_contested',
        warnings
      },
      selectedTask: state.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: true,
      warnings
    };
  }

  progressChanged = verificationResult.progressChanged;

  if (state.prepared.config.agentRole === 'watchdog' && report.watchdog_actions?.length) {
    const watchdogOutcome = await processWatchdogActions(input, report.watchdog_actions);
    taskFileChanged = taskFileChanged || watchdogOutcome.taskFileChanged;
    progressChanged = progressChanged || watchdogOutcome.progressChanged;
    warnings.push(...watchdogOutcome.warnings);
  }

  // Gap 7: Detect completed_parent_with_incomplete_descendants drift immediately
  // after reconciliation instead of waiting for the next preflight cycle.
  // autoCompleteSatisfiedAncestors can produce this state when it marks an ancestor
  // done while a sibling child remains open; parallel runs make the window worse.
  const postReconciliationTaskFile = parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8'));
  let selectedTask = findTaskById(postReconciliationTaskFile, state.selectedTask.id);
  const driftDiagnostics = inspectTaskGraph(postReconciliationTaskFile)
    .filter((d) => d.severity === 'error' && d.code === 'completed_parent_with_incomplete_descendants');
  for (const diagnostic of driftDiagnostics) {
    warnings.push(`Ledger drift after reconciliation: ${diagnostic.message}`);
  }

  // Fan-in gate: when a child task completes and its parent has a plan-graph,
  // evaluate whether all children in the wave are done and conflict-free.
  // If fan-in fails, revert the parent's auto-completion so it stays in_progress.
  if (requestedStatus === 'done' && state.selectedTask.parentId) {
    const graphPath = planGraphPath(state.prepared.paths.artifactDir, state.selectedTask.parentId);
    const graph = await readPlanGraph(graphPath);
    if (graph) {
      const fanIn = await validateFanIn(graphPath, graph, postReconciliationTaskFile.tasks);
      if (!fanIn.passed) {
        // Revert parent auto-completion: acquire the lock and set parent back to in_progress.
        const parentTask = findTaskById(postReconciliationTaskFile, state.selectedTask.parentId);
        if (parentTask?.status === 'done') {
          const parentId = state.selectedTask.parentId;
          await withTaskFileLock(input.taskFilePath, undefined, async () => {
            const current = parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8'));
            const reverted = bumpMutationCount({
              ...current,
              tasks: current.tasks.map(t =>
                t.id === parentId && t.status === 'done'
                  ? { ...t, status: 'in_progress' as const }
                  : t
              )
            });
            await fs.writeFile(input.taskFilePath, stringifyTaskFile(reverted), 'utf8');
          });
          taskFileChanged = true;
        }
        for (const err of fanIn.errors) {
          warnings.push(`Fan-in gate failed for parent '${state.selectedTask.parentId}': ${err}`);
        }
      }
    }
  }

  if (requestedStatus === 'done' && selectedTask?.status !== 'done') {
    warnings.push(
      `Completion report requested done, but the selected task ended as ${selectedTask?.status ?? 'missing'} after reconciliation.`
    );
  }

  selectedTask = findTaskById(
    parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8')),
    state.selectedTask.id
  );

  if (warnings.length > 0) {
    input.logger.warn('Completion report reconciliation recorded warnings.', {
      selectedTaskId: state.selectedTask.id,
      warnings
    });
  }

  return {
    artifact: {
      ...artifactBase,
      status: 'applied',
      warnings,
      ...(handoffScopeViolation ? { needsHumanReview: true } : {})
    },
    selectedTask,
    progressChanged,
    taskFileChanged,
    claimContested: false,
    warnings
  };
}

// Acquires the task-file lock once and, inside that critical section, writes both
// tasks.json and the progress bullet.  Used by the watchdog escalate_to_human path so
// the progress.md append is never interleaved with concurrent task-file writes.
async function updateTaskFileWithProgress(
  taskFilePath: string,
  progressPath: string,
  progressNote: string,
  transform: (taskFile: RalphTaskFile) => RalphTaskFile
): Promise<void> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const nextTaskFile = bumpMutationCount(transform(parseTaskFile(await fs.readFile(taskFilePath, 'utf8'))));
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');

    const trimmed = progressNote.trim();
    if (trimmed) {
      const current = await fs.readFile(progressPath, 'utf8');
      await fs.writeFile(progressPath, `${current.trimEnd()}\n- ${trimmed}\n`, 'utf8');
    }
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }
}

// Acquires the task-file lock once and, inside that single critical section:
// 1. Re-verifies claim ownership (eliminates the TOCTOU window between the prior standalone
//    inspectClaimOwnership call and the subsequent updateTaskFile call).
// 2. Applies the task transform and persists tasks.json.
// 3. Appends the progress bullet to progress.md (eliminates the unprotected read-modify-write
//    that existed when appendProgressBullet ran outside any lock).
async function updateTaskFileWithVerification(
  taskFilePath: string,
  claimFilePath: string,
  taskId: string,
  agentId: string,
  provenanceId: string,
  progressPath: string,
  progressNote: string | null,
  transform: (taskFile: RalphTaskFile) => RalphTaskFile
): Promise<{ claimContested: boolean; canonicalHolder: string | null; progressChanged: boolean }> {
  let claimContested = false;
  let canonicalHolder: string | null = null;
  let progressChanged = false;

  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const claimOwnership = await inspectClaimOwnership(claimFilePath, taskId, agentId, provenanceId);
    if (!claimOwnership.holdsActiveClaim) {
      const canonicalClaim = claimOwnership.canonicalClaim?.claim;
      canonicalHolder = canonicalClaim
        ? `${canonicalClaim.agentId}/${canonicalClaim.provenanceId}/${canonicalClaim.status}`
        : 'none';
      claimContested = true;
      return;
    }

    const nextTaskFile = bumpMutationCount(transform(parseTaskFile(await fs.readFile(taskFilePath, 'utf8'))));
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');

    if (progressNote) {
      const trimmed = progressNote.trim();
      if (trimmed) {
        const current = await fs.readFile(progressPath, 'utf8');
        await fs.writeFile(progressPath, `${current.trimEnd()}\n- ${trimmed}\n`, 'utf8');
        progressChanged = true;
      }
    }
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }

  return { claimContested, canonicalHolder, progressChanged };
}

async function processWatchdogActions(
  input: ReconcileCompletionReportInput,
  watchdogActions: RalphWatchdogAction[]
): Promise<{ taskFileChanged: boolean; progressChanged: boolean; warnings: string[] }> {
  let taskFileChanged = false;
  let progressChanged = false;
  const warnings: string[] = [];

  await writeWatchdogDiagnosticArtifact({
    artifactRootDir: input.prepared.paths.artifactDir,
    agentId: input.prepared.config.agentId,
    provenanceId: input.prepared.provenanceId,
    iteration: input.prepared.iteration,
    actions: watchdogActions
  }).catch((err: unknown) => {
    warnings.push(`Failed to write watchdog diagnostic artifact: ${err instanceof Error ? err.message : String(err)}`);
  });

  for (const action of watchdogActions) {
    if (action.action === 'resolve_stale_claim') {
      const resolved = await resolveStaleClaimByTask(
        input.prepared.paths.claimFilePath,
        action.taskId,
        action.agentId,
        {
          resolutionReason: buildWatchdogResolutionReason(action),
          resolvedBy: input.prepared.config.agentId,
          status: 'stale'
        }
      );

      if (resolved.lookupMiss) {
        warnings.push(
          `Watchdog action resolve_stale_claim could not find a canonical active claim for ${action.taskId} held by ${action.agentId}.`
        );
      } else if (resolved.outcome !== 'resolved') {
        warnings.push(
          `Watchdog action resolve_stale_claim was not eligible for ${action.taskId} held by ${action.agentId}.`
        );
      }
      continue;
    }

    if (action.action === 'decompose_task') {
      if (!action.suggestedChildTasks || action.suggestedChildTasks.length === 0) {
        warnings.push(`Watchdog action decompose_task for ${action.taskId} did not include suggestedChildTasks.`);
        continue;
      }
      if (!(await taskExists(input.taskFilePath, action.taskId))) {
        warnings.push(`Watchdog action decompose_task could not find task ${action.taskId}.`);
        continue;
      }

      await applySuggestedChildTasksToFile(input.taskFilePath, action.taskId, action.suggestedChildTasks);
      taskFileChanged = true;
      continue;
    }

    if (!(await taskExists(input.taskFilePath, action.taskId))) {
      warnings.push(`Watchdog action escalate_to_human could not find task ${action.taskId}.`);
      continue;
    }

    await updateTaskFileWithProgress(
      input.taskFilePath,
      input.prepared.paths.progressPath,
      buildWatchdogEscalationEntry(action),
      (taskFile) => ({
        ...taskFile,
        tasks: taskFile.tasks.map((task) => {
          if (task.id !== action.taskId) {
            return task;
          }

          return {
            ...task,
            blocker: buildWatchdogBlocker(action)
          };
        })
      })
    );
    progressChanged = true;
    taskFileChanged = true;
  }

  return {
    taskFileChanged,
    progressChanged,
    warnings
  };
}

function buildWatchdogResolutionReason(action: RalphWatchdogAction): string {
  return `${action.severity} watchdog recovery: ${action.reason} Evidence: ${action.evidence}`;
}

function buildWatchdogEscalationEntry(action: RalphWatchdogAction): string {
  return `[watchdog][${action.severity}][${action.action}] task=${action.taskId} agent=${action.agentId} reason=${action.reason} evidence=${action.evidence} trailingNoProgress=${action.trailingNoProgressCount} trailingRepeatedFailure=${action.trailingRepeatedFailureCount}`;
}

function buildWatchdogBlocker(action: RalphWatchdogAction): string {
  return `Watchdog escalation (${action.severity}) for ${action.agentId}: ${action.reason}`;
}

async function taskExists(taskFilePath: string, taskId: string): Promise<boolean> {
  return findTaskById(parseTaskFile(await fs.readFile(taskFilePath, 'utf8')), taskId) !== null;
}

async function scanAcceptedHandoffs(handoffsDir: string): Promise<RalphHandoff[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(handoffsDir);
  } catch {
    return [];
  }

  const results: RalphHandoff[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(handoffsDir, entry), 'utf8');
      const parsed = JSON.parse(raw) as RalphHandoff;
      if (parsed.status === 'accepted') {
        results.push(parsed);
      }
    } catch {
      // Skip malformed or unreadable files without crashing the loop.
    }
  }
  return results;
}
