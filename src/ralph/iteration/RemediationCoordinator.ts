import { Logger } from '../../services/logger';
import { toErrorMessage } from '../../util/error';
import { buildTaskRemediation } from '../loopLogic';
import {
  autoApplyDecomposeTaskRemediation,
  autoApplyMarkBlockedRemediation,
  buildRemediationArtifact,
  normalizeRemediationForTask
} from '../taskDecomposition';
import type { RalphIterationResult, RalphTaskFile, RalphTaskRemediationArtifact } from '../types';
import type { ArtifactPersistenceService } from './ArtifactPersistenceService';

export interface AttachStopRemediationInput {
  result: RalphIterationResult;
  stopReason: RalphIterationResult['stopReason'];
  previousIterations: RalphIterationResult[];
  taskFile: RalphTaskFile;
}

export interface BuildAndAutoApplyRemediationInput {
  result: RalphIterationResult;
  taskFile: RalphTaskFile;
  previousIterations: RalphIterationResult[];
  artifactPaths: ReturnType<ArtifactPersistenceService['resolvePaths']>;
  taskFilePath: string;
  autoApplyRemediation: string[];
  createdAt: string;
}

export interface BuildAndAutoApplyRemediationOutput {
  result: RalphIterationResult;
  effectiveTaskFile: RalphTaskFile;
  remediationArtifact: RalphTaskRemediationArtifact | null;
}

export class RemediationCoordinator {
  public constructor(private readonly logger: Logger) {}

  public attachStopRemediation(input: AttachStopRemediationInput): RalphIterationResult {
    const result: RalphIterationResult = {
      ...input.result,
      warnings: [...input.result.warnings]
    };
    result.remediation = buildTaskRemediation({
      currentResult: result,
      stopReason: input.stopReason,
      previousIterations: input.previousIterations
    });
    result.remediation = normalizeRemediationForTask(input.taskFile, result);
    return result;
  }

  public async buildAndAutoApply(input: BuildAndAutoApplyRemediationInput): Promise<BuildAndAutoApplyRemediationOutput> {
    const result: RalphIterationResult = {
      ...input.result,
      warnings: [...input.result.warnings]
    };
    let effectiveTaskFile = input.taskFile;
    const remediationArtifact = buildRemediationArtifact({
      result,
      taskFile: input.taskFile,
      previousIterations: input.previousIterations,
      artifactDir: input.artifactPaths.directory,
      iterationResultPath: input.artifactPaths.iterationResultPath,
      createdAt: input.createdAt
    });

    if (result.stopReason === 'repeated_identical_failure'
      && result.remediation?.action === 'mark_blocked'
      && result.selectedTaskId
      && input.autoApplyRemediation.includes('mark_blocked')) {
      try {
        effectiveTaskFile = await autoApplyMarkBlockedRemediation({
          taskFilePath: input.taskFilePath,
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary
        });
        result.warnings.push(`Remediation auto-applied: mark_blocked on task ${result.selectedTaskId}`);
        this.logger.info('Auto-applied remediation: mark_blocked.', {
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary
        });
      } catch (error) {
        result.warnings.push(
          `Failed to auto-apply remediation mark_blocked on task ${result.selectedTaskId}: ${toErrorMessage(error)}`
        );
        this.logger.warn('Failed to auto-apply remediation: mark_blocked.', {
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary,
          error: toErrorMessage(error)
        });
      }
    }

    if (result.remediation?.action === 'decompose_task'
      && result.selectedTaskId
      && input.autoApplyRemediation.includes('decompose_task')) {
      const suggestedChildTasks = remediationArtifact?.suggestedChildTasks ?? [];
      if (suggestedChildTasks.length === 0) {
        result.warnings.push(
          `Skipped remediation auto-apply for decompose_task on task ${result.selectedTaskId}: no suggested child tasks were available.`
        );
      } else {
        try {
          effectiveTaskFile = await autoApplyDecomposeTaskRemediation({
            taskFilePath: input.taskFilePath,
            remediationArtifact: remediationArtifact as NonNullable<RalphTaskRemediationArtifact>
          });
          result.warnings.push(
            `Remediation auto-applied: decompose_task on task ${result.selectedTaskId}, added ${suggestedChildTasks.length} child tasks`
          );
          this.logger.info('Auto-applied remediation: decompose_task.', {
            taskId: result.selectedTaskId,
            childTaskIds: suggestedChildTasks.map((task) => task.id)
          });
        } catch (error) {
          result.warnings.push(
            `Failed to auto-apply remediation decompose_task on task ${result.selectedTaskId}: ${toErrorMessage(error)}`
          );
          this.logger.warn('Failed to auto-apply remediation: decompose_task.', {
            taskId: result.selectedTaskId,
            childTaskIds: suggestedChildTasks.map((task) => task.id),
            error: toErrorMessage(error)
          });
        }
      }
    }

    return {
      result,
      effectiveTaskFile,
      remediationArtifact
    };
  }
}
