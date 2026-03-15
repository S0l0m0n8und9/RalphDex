import * as fs from 'fs/promises';
import { Logger } from '../services/logger';
import { CompletionReportArtifact, parseCompletionReport } from './completionReportParser';
import {
  autoCompleteSatisfiedAncestors,
  findTaskById,
  inspectClaimOwnership,
  parseTaskFile,
  withTaskFileLock,
  stringifyTaskFile
} from './taskFile';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphCompletionClassification,
  RalphIterationResult,
  RalphTask,
  RalphTaskFile
} from './types';
import type { PreparedIterationContext } from './iterationPreparation';

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
  preliminaryClassification: RalphCompletionClassification;
  lastMessage: string;
  taskFilePath: string;
  logger: Logger;
}

export async function reconcileCompletionReport(
  input: ReconcileCompletionReportInput
): Promise<CompletionReconciliationOutcome> {
  const parsed = parseCompletionReport(input.lastMessage);
  const artifactBase: CompletionReportArtifact = {
    schemaVersion: 1,
    kind: 'completionReport',
    status: parsed.status === 'parsed' ? 'rejected' : parsed.status,
    selectedTaskId: input.selectedTask?.id ?? null,
    report: parsed.report,
    rawBlock: parsed.rawBlock,
    parseError: parsed.parseError,
    warnings: []
  };

  if (!input.selectedTask || input.prepared.promptKind === 'replenish-backlog') {
    artifactBase.status = 'missing';
    return {
      artifact: artifactBase,
      selectedTask: input.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: false,
      warnings: []
    };
  }

  if (parsed.status !== 'parsed' || !parsed.report) {
    const warnings = parsed.status === 'invalid' && parsed.parseError
      ? [parsed.parseError]
      : parsed.status === 'missing'
        ? ['No completion report JSON block was found at the end of the Codex last message.']
        : [];
    artifactBase.warnings = warnings;
    return {
      artifact: {
        ...artifactBase,
        warnings
      },
      selectedTask: input.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: false,
      warnings
    };
  }

  const warnings: string[] = [];
  if (parsed.report.selectedTaskId !== input.selectedTask.id) {
    warnings.push(
      `Completion report selectedTaskId ${parsed.report.selectedTaskId} did not match the selected task ${input.selectedTask.id}.`
    );
    return {
      artifact: {
        ...artifactBase,
        warnings
      },
      selectedTask: input.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: false,
      warnings
    };
  }

  const requestedStatus = parsed.report.requestedStatus;
  if (requestedStatus === 'done') {
    if (input.verificationStatus !== 'passed') {
      warnings.push(`Completion report requested done, but verification status was ${input.verificationStatus}.`);
    }
    if (parsed.report.needsHumanReview) {
      warnings.push('Completion report requested done while also declaring needsHumanReview.');
    }
    if (warnings.length > 0) {
      return {
        artifact: {
          ...artifactBase,
          warnings
        },
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        claimContested: false,
        warnings
      };
    }
  }

  if (requestedStatus === 'blocked' && input.preliminaryClassification === 'complete') {
    warnings.push('Completion report requested blocked, but the preliminary outcome already classified the task as complete.');
    return {
      artifact: {
        ...artifactBase,
        warnings
      },
      selectedTask: input.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: false,
      warnings
    };
  }

  let taskFileChanged = false;
  let progressChanged = false;
  const claimOwnership = await inspectClaimOwnership(
    input.prepared.paths.claimFilePath,
    input.selectedTask.id,
    DEFAULT_RALPH_AGENT_ID,
    input.prepared.provenanceId
  );

  if (!claimOwnership.holdsActiveClaim) {
    const canonicalClaim = claimOwnership.canonicalClaim?.claim;
    const canonicalHolder = canonicalClaim
      ? `${canonicalClaim.agentId}/${canonicalClaim.provenanceId}/${canonicalClaim.status}`
      : 'none';
    warnings.push(
      `Completion report claim ownership check failed for ${input.selectedTask.id}; canonical holder was ${canonicalHolder}.`
    );
    return {
      artifact: {
        ...artifactBase,
        warnings
      },
      selectedTask: input.selectedTask,
      progressChanged: false,
      taskFileChanged: false,
      claimContested: true,
      warnings
    };
  }

  await updateTaskFile(input.taskFilePath, (taskFile) => {
    const selectedTaskUpdated: RalphTaskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) => {
        if (task.id !== input.selectedTask!.id) {
          return task;
        }

        const nextTask: RalphTask = {
          ...task,
          status: requestedStatus,
          notes: parsed.report!.progressNote ?? task.notes,
          blocker: requestedStatus === 'blocked'
            ? parsed.report!.blocker ?? task.blocker
            : task.blocker
        };

        if (requestedStatus !== 'blocked' && parsed.report!.blocker) {
          nextTask.blocker = parsed.report!.blocker;
        }

        taskFileChanged = nextTask.status !== task.status
          || nextTask.notes !== task.notes
          || nextTask.blocker !== task.blocker;

        return nextTask;
      })
    };

    if (requestedStatus !== 'done') {
      return selectedTaskUpdated;
    }

    const ancestorCompletion = autoCompleteSatisfiedAncestors(selectedTaskUpdated, input.selectedTask!.id);
    if (ancestorCompletion.completedAncestorIds.length > 0) {
      taskFileChanged = true;
    }

    return ancestorCompletion.taskFile;
  });

  if (parsed.report.progressNote) {
    await appendProgressBullet(input.prepared.paths.progressPath, parsed.report.progressNote);
    progressChanged = true;
  }

  const selectedTask = findTaskById(parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8')), input.selectedTask.id);

  if (warnings.length > 0) {
    input.logger.warn('Completion report reconciliation recorded warnings.', {
      selectedTaskId: input.selectedTask.id,
      warnings
    });
  }

  return {
    artifact: {
      ...artifactBase,
      status: 'applied',
      warnings
    },
    selectedTask,
    progressChanged,
    taskFileChanged,
    claimContested: false,
    warnings
  };
}

async function updateTaskFile(taskFilePath: string, transform: (taskFile: RalphTaskFile) => RalphTaskFile): Promise<void> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const nextTaskFile = transform(parseTaskFile(await fs.readFile(taskFilePath, 'utf8')));
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }
}

async function appendProgressBullet(progressPath: string, bullet: string): Promise<void> {
  const trimmed = bullet.trim();
  if (!trimmed) {
    return;
  }

  const current = await fs.readFile(progressPath, 'utf8');
  const nextText = `${current.trimEnd()}\n- ${trimmed}\n`;
  await fs.writeFile(progressPath, nextText, 'utf8');
}
