import { applyReviewAgentFileChangePolicy } from '../reviewPolicy';
import type { CompletionReconciliationOutcome } from '../reconciliation';
import {
  captureCoreState,
  captureGitStatus,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier,
  type GitStatusSnapshot,
  type RalphCoreStateSnapshot
} from '../verifier';
import { classifyIterationOutcome, classifyVerificationStatus, type RalphOutcomeDecision } from '../loopLogic';
import { countTaskStatuses, isDocumentationMode, remainingSubtasks } from '../taskFile';
import type { PreparedIterationContext } from '../iterationPreparation';
import type { RalphDiffSummary, RalphVerificationResult, RalphVerificationStatus } from '../types';
import type { ArtifactPersistenceService } from './ArtifactPersistenceService';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

export type ValidationVerification = Awaited<ReturnType<typeof runValidationCommandVerifier>>;
export interface FileChangeVerification {
  diffSummary: RalphDiffSummary | null;
  result: RalphVerificationResult;
}
export type TaskStateVerification = Awaited<ReturnType<typeof runTaskStateVerifier>>;

export interface PreliminaryVerificationResult {
  afterCoreStateBeforeReconciliation: RalphCoreStateSnapshot;
  afterGit: GitStatusSnapshot;
  validationVerification: ValidationVerification;
  fileChangeVerification: FileChangeVerification;
  effectiveFileChangeVerification: FileChangeVerification;
  relevantFileChangesForOutcome: string[];
  preliminaryVerificationStatus: RalphVerificationStatus;
  preliminaryOutcome: RalphOutcomeDecision;
}

export interface RunPreliminaryVerificationInput {
  prepared: PreparedIterationContext;
  artifactPaths: ReturnType<ArtifactPersistenceService['resolvePaths']>;
  executionStatus: 'succeeded' | 'failed' | 'skipped';
}

export interface RunTaskStateVerificationInput {
  prepared: PreparedIterationContext;
  artifactPaths: ReturnType<ArtifactPersistenceService['resolvePaths']>;
  completionReconciliation: CompletionReconciliationOutcome;
  afterCoreState: RalphCoreStateSnapshot;
}

export class VerificationRunner {
  public async runPreliminaryVerification(input: RunPreliminaryVerificationInput): Promise<PreliminaryVerificationResult> {
    const afterCoreStateBeforeReconciliation = await captureCoreState(input.prepared.paths);
    const shouldCaptureGit = input.prepared.config.verifierModes.includes('gitDiff') || input.prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(input.prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;

    const skipValidationForDocMode = isDocumentationMode(input.prepared.selectedTask);
    const validationVerification = input.prepared.config.verifierModes.includes('validationCommand')
      && input.executionStatus === 'succeeded'
      && !skipValidationForDocMode
      ? await runValidationCommandVerifier({
        command: input.prepared.validationCommand,
        taskValidationHint: input.prepared.taskValidationHint,
        normalizedValidationCommandFrom: input.prepared.normalizedValidationCommandFrom,
        rootPath: input.prepared.rootPolicy.verificationRootPath,
        artifactDir: input.artifactPaths.directory
      })
      : {
        command: input.prepared.validationCommand,
        stdout: '',
        stderr: '',
        exitCode: null,
        result: {
          verifier: 'validationCommand' as const,
          status: 'skipped' as const,
          summary: skipValidationForDocMode
            ? 'Validation-command verifier skipped for documentation-mode task.'
            : input.executionStatus === 'succeeded'
              ? 'Validation-command verifier disabled for this iteration.'
              : 'Validation-command verifier skipped because Codex execution did not succeed.',
          warnings: [],
          errors: [],
          command: input.prepared.validationCommand ?? undefined
        }
      };

    const shouldRunFileChangeVerifier = input.prepared.selectedTask !== null
      && (input.prepared.config.verifierModes.includes('gitDiff')
        || input.prepared.config.gitCheckpointMode === 'snapshotAndDiff');
    const fileChangeVerification: FileChangeVerification = shouldRunFileChangeVerifier
      ? await runFileChangeVerifier({
        rootPath: input.prepared.rootPolicy.verificationRootPath,
        artifactDir: input.artifactPaths.directory,
        beforeGit: input.prepared.beforeGit,
        afterGit,
        before: input.prepared.beforeCoreState,
        after: afterCoreStateBeforeReconciliation
      })
      : {
        diffSummary: null as RalphDiffSummary | null,
        result: {
          verifier: 'gitDiff' as const,
          status: 'skipped' as const,
          summary: input.prepared.selectedTask
            ? 'Git-diff/file-change verifier disabled for this iteration.'
            : 'Git-diff/file-change verifier skipped because no Ralph task was selected.',
          warnings: [],
          errors: []
        }
      };
    const roleAdjustedFileChange = applyReviewAgentFileChangePolicy({
      agentRole: input.prepared.config.agentRole,
      fileChangeVerification
    });
    const effectiveFileChangeVerification = roleAdjustedFileChange.fileChangeVerification;
    const relevantFileChangesForOutcome = roleAdjustedFileChange.relevantFileChangesForOutcome;

    const preliminaryVerificationStatus = classifyVerificationStatus([
      validationVerification.result.status,
      effectiveFileChangeVerification.result.status
    ]);
    const preliminaryOutcome = classifyIterationOutcome({
      selectedTaskId: input.prepared.selectedTask?.id ?? null,
      selectedTaskCompleted: false,
      selectedTaskBlocked: false,
      humanReviewNeeded: false,
      remainingSubtaskCount: remainingSubtasks(afterCoreStateBeforeReconciliation.taskFile, input.prepared.selectedTask?.id ?? null).length,
      remainingTaskCount: countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).todo
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).in_progress
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).blocked,
      executionStatus: input.executionStatus,
      verificationStatus: preliminaryVerificationStatus,
      validationFailureSignature: validationVerification.result.failureSignature ?? null,
      relevantFileChanges: relevantFileChangesForOutcome,
      progressChanged: input.prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
      taskFileChanged: input.prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
      previousIterations: input.prepared.state.iterationHistory,
      taskMode: input.prepared.selectedTask?.mode
    });

    return {
      afterCoreStateBeforeReconciliation,
      afterGit,
      validationVerification,
      fileChangeVerification,
      effectiveFileChangeVerification,
      relevantFileChangesForOutcome,
      preliminaryVerificationStatus,
      preliminaryOutcome
    };
  }

  public async runTaskStateVerification(input: RunTaskStateVerificationInput): Promise<TaskStateVerification> {
    return input.prepared.config.verifierModes.includes('taskState')
      ? await runTaskStateVerifier({
        selectedTaskId: input.prepared.selectedTask?.id ?? null,
        before: input.prepared.beforeCoreState,
        after: input.afterCoreState,
        artifactDir: input.artifactPaths.directory
      })
      : {
        selectedTaskAfter: input.completionReconciliation.selectedTask ?? input.prepared.selectedTask,
        selectedTaskCompleted: false,
        selectedTaskBlocked: false,
        humanReviewNeeded: false,
        progressChanged: input.completionReconciliation.progressChanged,
        taskFileChanged: input.completionReconciliation.taskFileChanged,
        result: {
          verifier: 'taskState' as const,
          status: 'skipped' as const,
          summary: 'Task-state verifier disabled for this iteration.',
          warnings: [],
          errors: []
        }
      };
  }
}
