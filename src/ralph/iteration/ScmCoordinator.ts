import * as fs from 'fs/promises';
import {
  commitOnDone,
  listGitConflictPaths,
  reconcileBranchPerTaskScm,
  type ScmConflictResolver
} from '../iterationScm';
import type { CompletionReconciliationOutcome } from '../reconciliation';
import type { PreparedIterationContext } from '../iterationPreparation';
import { parseTaskFile } from '../taskFile';
import type { RalphIterationResult, RalphVerificationStatus } from '../types';
import { Logger } from '../../services/logger';
import { toErrorMessage } from '../../util/error';

export interface ConflictResolverIterationResult {
  executionStatus: RalphIterationResult['executionStatus'];
  selectedTaskId: RalphIterationResult['selectedTaskId'];
  completionReportStatus: RalphIterationResult['completionReportStatus'];
}

export interface ReconcileBranchPerTaskInput {
  prepared: PreparedIterationContext;
  completionReconciliation: CompletionReconciliationOutcome;
  validationStatus: RalphVerificationStatus;
  runConflictResolverIteration?: (taskId: string) => Promise<ConflictResolverIterationResult>;
}

export interface ReconcileBranchPerTaskOutput {
  warnings: string[];
  autoReviewContext?: { parentTaskId: string; parentTaskTitle: string };
}

export interface CommitOnDoneInput {
  prepared: PreparedIterationContext;
  selectedTaskCompleted: boolean;
  validationStatus: RalphVerificationStatus;
}

export class ScmCoordinator {
  public constructor(private readonly logger: Logger) {}

  public async reconcileBranchPerTask(input: ReconcileBranchPerTaskInput): Promise<ReconcileBranchPerTaskOutput> {
    const warnings: string[] = [];
    let autoReviewContext: ReconcileBranchPerTaskOutput['autoReviewContext'];
    if (input.prepared.config.scmStrategy === 'branch-per-task'
      && input.completionReconciliation.selectedTask?.status === 'done'
      && input.prepared.selectedTask) {
      const taskFileAfterCompletion = parseTaskFile(await fs.readFile(input.prepared.paths.taskFilePath, 'utf8'));

      let conflictResolver: ScmConflictResolver | undefined;
      if (input.prepared.config.autoScmOnConflict && input.runConflictResolverIteration) {
        const retryLimit = input.prepared.config.scmConflictRetryLimit;
        conflictResolver = async (ctx) => {
          for (let attempt = 0; attempt < retryLimit; attempt++) {
            const scmRun = await input.runConflictResolverIteration!(ctx.taskId);
            if (scmRun.executionStatus === 'failed') {
              break;
            }
            const resolverHandledConflict = scmRun.selectedTaskId === ctx.taskId
              && scmRun.completionReportStatus === 'applied';
            if (!resolverHandledConflict) {
              continue;
            }
            const remaining = await listGitConflictPaths(ctx.rootPath);
            if (remaining.length === 0) {
              return { resolved: true };
            }
          }
          return { resolved: false };
        };
      }

      const branchScm = await reconcileBranchPerTaskScm({
        prepared: input.prepared,
        validationStatus: input.validationStatus,
        taskFileAfter: taskFileAfterCompletion,
        conflictResolver
      });
      warnings.push(...branchScm.warnings);
      if (branchScm.parentCompletedAndMerged && branchScm.parentTask) {
        autoReviewContext = {
          parentTaskId: branchScm.parentTask.id,
          parentTaskTitle: branchScm.parentTask.title
        };
      }
    }

    return {
      warnings,
      autoReviewContext
    };
  }

  public async commitOnDoneIfNeeded(input: CommitOnDoneInput): Promise<string[]> {
    const warnings: string[] = [];
    if (input.prepared.config.scmStrategy === 'commit-on-done'
      && input.selectedTaskCompleted
      && input.prepared.selectedTask) {
      try {
        warnings.push(await commitOnDone({
          rootPath: input.prepared.rootPath,
          taskId: input.prepared.selectedTask.id,
          taskTitle: input.prepared.selectedTask.title,
          agentId: input.prepared.config.agentId,
          iteration: input.prepared.iteration,
          validationStatus: input.validationStatus
        }));
      } catch (error) {
        warnings.push(`SCM commit-on-done failed for ${input.prepared.selectedTask.id}: ${toErrorMessage(error)}`);
        this.logger.warn('SCM commit-on-done failed.', {
          taskId: input.prepared.selectedTask.id,
          iteration: input.prepared.iteration,
          error: toErrorMessage(error)
        });
      }
    }
    return warnings;
  }
}
