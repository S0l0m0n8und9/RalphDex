import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from '../services/logger';
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
  composeMutationPlan,
  runGatePipeline,
  type ReconciliationState,
  type RejectionReason,
  type TaskMutationPlan
} from './reconciliationGates';

function applyMutationPlanToTask(task: RalphTask, plan: TaskMutationPlan): RalphTask {
  const nextTask: RalphTask = {
    ...task,
    status: plan.nextStatus,
    notes: plan.progressNote ?? task.notes,
    blocker: plan.blocker ?? task.blocker
  };
  if (plan.validationToWrite && !nextTask.validation) {
    nextTask.validation = plan.validationToWrite;
  }
  if (plan.lastVerifierResult) {
    nextTask.lastVerifierResult = plan.lastVerifierResult;
  }
  if (plan.lastReconciliationWarning) {
    nextTask.lastReconciliationWarning = plan.lastReconciliationWarning;
  }
  return nextTask;
}

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
    appliedWatchdogActions: [],
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
        appliedWatchdogActions: [],
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
        appliedWatchdogActions: [],
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
  appliedWatchdogActions: RalphWatchdogAction[];
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

  const plan = composeMutationPlan(state, pipelineResult.outputs, warnings);
  const handoffScopeViolation = plan.needsHumanReview;

  const applied = await applyMutationUnderLock(input, state, plan);
  if (applied.verificationResult.claimContested) {
    warnings.push(
      `Completion report claim ownership check failed for ${state.selectedTask.id}; canonical holder was ${applied.verificationResult.canonicalHolder ?? 'none'}.`
    );
    return buildRejectedOutcome(state, artifactBase, 'claim_contested', warnings, false);
  }

  const post = await runPostWriteStages(input, state, plan, applied, warnings);

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
    selectedTask: post.selectedTask,
    progressChanged: post.progressChanged,
    taskFileChanged: post.taskFileChanged,
    claimContested: false,
    appliedWatchdogActions: post.appliedWatchdogActions,
    warnings
  };
}

interface AppliedMutation {
  verificationResult: Awaited<ReturnType<typeof updateTaskFileWithVerification>>;
  taskFileChanged: boolean;
}

async function applyMutationUnderLock(
  input: ReconcileCompletionReportInput,
  state: ReconciliationState,
  plan: TaskMutationPlan
): Promise<AppliedMutation> {
  let taskFileChanged = false;
  const verificationResult = await updateTaskFileWithVerification(
    input.taskFilePath,
    state.prepared.paths.claimFilePath,
    state.selectedTask.id,
    state.prepared.config.agentId,
    state.prepared.provenanceId,
    state.prepared.paths.progressPath,
    plan.progressNote,
    (taskFile) => {
      const selectedTaskUpdated: RalphTaskFile = {
        ...taskFile,
        tasks: taskFile.tasks.map((task) => {
          if (task.id !== state.selectedTask.id) {
            return task;
          }
          const nextTask = applyMutationPlanToTask(task, plan);
          taskFileChanged = nextTask.status !== task.status
            || nextTask.notes !== task.notes
            || nextTask.blocker !== task.blocker
            || nextTask.validation !== task.validation
            || nextTask.lastVerifierResult !== task.lastVerifierResult
            || nextTask.lastReconciliationWarning !== task.lastReconciliationWarning;
          return nextTask;
        })
      };

      if (!plan.attemptAncestorCompletion) {
        return selectedTaskUpdated;
      }

      const ancestorCompletion = autoCompleteSatisfiedAncestors(selectedTaskUpdated, state.selectedTask.id);
      if (ancestorCompletion.completedAncestorIds.length > 0) {
        taskFileChanged = true;
      }
      return ancestorCompletion.taskFile;
    }
  );
  return { verificationResult, taskFileChanged };
}

interface PostWriteResult {
  taskFileChanged: boolean;
  progressChanged: boolean;
  selectedTask: RalphTask | null;
  appliedWatchdogActions: RalphWatchdogAction[];
}

async function runPostWriteStages(
  input: ReconcileCompletionReportInput,
  state: ReconciliationState,
  plan: TaskMutationPlan,
  applied: AppliedMutation,
  warnings: string[]
): Promise<PostWriteResult> {
  let taskFileChanged = applied.taskFileChanged;
  let progressChanged = applied.verificationResult.progressChanged;
  const appliedWatchdogActions: RalphWatchdogAction[] = [];
  const report = state.report;

  if (state.prepared.config.agentRole === 'watchdog' && report.watchdog_actions?.length) {
    const watchdogOutcome = await processWatchdogActions(input, report.watchdog_actions);
    taskFileChanged = taskFileChanged || watchdogOutcome.taskFileChanged;
    progressChanged = progressChanged || watchdogOutcome.progressChanged;
    appliedWatchdogActions.push(...watchdogOutcome.appliedActions);
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
  if (plan.nextStatus === 'done' && state.selectedTask.parentId) {
    const graphPath = planGraphPath(state.prepared.paths.artifactDir, state.selectedTask.parentId);
    const graph = await readPlanGraph(graphPath);
    if (graph) {
      const fanIn = await validateFanIn(graphPath, graph, postReconciliationTaskFile.tasks);
      if (!fanIn.passed) {
        const parentTask = findTaskById(postReconciliationTaskFile, state.selectedTask.parentId);
        if (parentTask?.status === 'done') {
          const parentId = state.selectedTask.parentId;
          await withTaskFileLock(input.taskFilePath, undefined, async () => {
            const current = parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8'));
            const reverted = bumpMutationCount({
              ...current,
              tasks: current.tasks.map((t) =>
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

  if (plan.nextStatus === 'done' && selectedTask?.status !== 'done') {
    warnings.push(
      `Completion report requested done, but the selected task ended as ${selectedTask?.status ?? 'missing'} after reconciliation.`
    );
  }

  selectedTask = findTaskById(
    parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8')),
    state.selectedTask.id
  );

  return { taskFileChanged, progressChanged, selectedTask, appliedWatchdogActions };
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
): Promise<{ taskFileChanged: boolean; progressChanged: boolean; appliedActions: RalphWatchdogAction[]; warnings: string[] }> {
  let taskFileChanged = false;
  let progressChanged = false;
  const appliedActions: RalphWatchdogAction[] = [];
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
      } else {
        appliedActions.push(action);
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
      appliedActions.push(action);
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
    appliedActions.push(action);
  }

  return {
    taskFileChanged,
    progressChanged,
    appliedActions,
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
