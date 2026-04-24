import { Logger } from '../../services/logger';
import type { CompletionReportArtifact } from '../completionReportParser';
import type { PreparedIterationContext } from '../iterationPreparation';
import { createProvenanceBundle } from '../provenancePersistence';
import type { GitStatusSnapshot } from '../verifier';
import {
  resolveIterationArtifactPaths,
  type RalphIterationArtifactPaths,
  writeCliInvocationArtifact,
  writeIterationArtifacts,
  writeProvenanceBundle
} from '../artifactStore';
import type {
  PromptCacheStats,
  RalphCliInvocation,
  RalphDiffSummary,
  RalphIterationResult,
  RalphTaskRemediationArtifact,
  RalphVerificationResult
} from '../types';

function summarizeLastMessage(lastMessage: string, exitCode: number | null): string {
  return lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}

export interface PersistCliInvocationInput {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  invocation: RalphCliInvocation;
}

export interface PersistIterationArtifactsInput {
  prepared: PreparedIterationContext;
  artifactPaths: RalphIterationArtifactPaths;
  completionReport: CompletionReportArtifact;
  stdout: string;
  stderr: string;
  executionStatus: RalphIterationResult['executionStatus'];
  exitCode: number | null;
  executionMessage: string | null;
  stdinHash: string | null;
  transcriptPath: string | undefined;
  lastMessagePath: string | undefined;
  lastMessage: string;
  invocation: RalphCliInvocation | undefined;
  verifierResults: RalphVerificationResult[];
  diffSummary: RalphDiffSummary | null;
  result: RalphIterationResult;
  remediationArtifact: RalphTaskRemediationArtifact | null;
  afterGit: GitStatusSnapshot;
  promptCacheStats: PromptCacheStats | null;
  executionCostUsd: number | null;
}

export class ArtifactPersistenceService {
  public constructor(private readonly logger: Logger) {}

  public async persistCliInvocation(input: PersistCliInvocationInput): Promise<void> {
    await writeCliInvocationArtifact({
      paths: input.paths,
      artifactRootDir: input.artifactRootDir,
      invocation: input.invocation
    });
  }

  public async persistIterationArtifacts(input: PersistIterationArtifactsInput): Promise<void> {
    await writeIterationArtifacts({
      paths: input.artifactPaths,
      artifactRootDir: input.prepared.paths.artifactDir,
      prompt: input.prepared.prompt,
      promptEvidence: input.prepared.promptEvidence,
      completionReport: input.completionReport,
      stdout: input.stdout,
      stderr: input.stderr,
      executionSummary: {
        iteration: input.prepared.iteration,
        selectedTaskId: input.prepared.selectedTask?.id ?? null,
        promptKind: input.prepared.promptKind,
        promptTarget: input.prepared.executionPlan.promptTarget,
        rootPolicy: input.prepared.rootPolicy,
        templatePath: input.prepared.executionPlan.templatePath,
        taskValidationHint: input.prepared.taskValidationHint,
        effectiveValidationCommand: input.prepared.effectiveValidationCommand,
        normalizedValidationCommandFrom: input.prepared.normalizedValidationCommandFrom,
        executionPlanPath: input.prepared.executionPlanPath,
        executionPlanHash: input.prepared.executionPlanHash,
        promptArtifactPath: input.prepared.executionPlan.promptArtifactPath,
        promptHash: input.prepared.executionPlan.promptHash,
        executionPayloadHash: input.stdinHash,
        executionPayloadMatched: input.stdinHash === null ? null : input.stdinHash === input.prepared.executionPlan.promptHash,
        cliInvocationPath: input.invocation ? input.artifactPaths.cliInvocationPath : null,
        executionStatus: input.executionStatus,
        exitCode: input.exitCode,
        message: input.executionMessage,
        transcriptPath: input.transcriptPath,
        lastMessagePath: input.lastMessagePath,
        lastMessage: summarizeLastMessage(input.lastMessage, input.exitCode),
        completionReportStatus: input.completionReport.status
      },
      verifierSummary: input.verifierResults,
      diffSummary: input.diffSummary,
      result: input.result,
      remediationArtifact: input.remediationArtifact,
      gitStatusBefore: input.prepared.beforeGit.available ? input.prepared.beforeGit.raw : undefined,
      gitStatusAfter: input.afterGit.available ? input.afterGit.raw : undefined
    });

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: input.prepared.paths.artifactDir,
      paths: input.prepared.provenanceBundlePaths,
      bundle: createProvenanceBundle({
        prepared: input.prepared,
        status: 'executed',
        summary: input.result.summary,
        executionPayloadHash: input.stdinHash,
        executionPayloadMatched: input.result.executionIntegrity?.executionPayloadMatched ?? null,
        mismatchReason: input.result.executionIntegrity?.mismatchReason ?? null,
        cliInvocationPath: input.invocation ? input.prepared.provenanceBundlePaths.cliInvocationPath : null,
        iterationResultPath: input.prepared.provenanceBundlePaths.iterationResultPath,
        promptCacheStats: input.promptCacheStats,
        executionCostUsd: input.executionCostUsd
      }),
      preflightReport: input.prepared.persistedPreflightReport,
      preflightSummary: input.prepared.preflightSummaryText,
      prompt: input.prepared.prompt,
      promptEvidence: input.prepared.promptEvidence,
      executionPlan: input.prepared.executionPlan,
      cliInvocation: input.invocation,
      result: input.result,
      retentionCount: input.prepared.config.provenanceBundleRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after execution.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds,
        retentionCount: input.prepared.config.provenanceBundleRetentionCount
      });
    }
  }

  public resolvePaths(artifactRootDir: string, iteration: number): RalphIterationArtifactPaths {
    return resolveIterationArtifactPaths(artifactRootDir, iteration);
  }
}
