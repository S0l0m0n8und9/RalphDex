import type { PreparedIterationContext } from './iterationPreparation';
import type { RalphDiffSummary, RalphIterationResult } from './types';

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function applyReviewAgentFileChangePolicy(input: {
  agentRole: PreparedIterationContext['config']['agentRole'];
  fileChangeVerification: {
    diffSummary: RalphDiffSummary | null;
    result: RalphIterationResult['verification']['verifiers'][number];
  };
}): {
  fileChangeVerification: {
    diffSummary: RalphDiffSummary | null;
    result: RalphIterationResult['verification']['verifiers'][number];
  };
  relevantFileChangesForOutcome: string[];
} {
  const relevantChangedFiles = input.fileChangeVerification.diffSummary?.relevantChangedFiles ?? [];
  if (input.agentRole !== 'review' || relevantChangedFiles.length === 0) {
    return {
      fileChangeVerification: input.fileChangeVerification,
      relevantFileChangesForOutcome: relevantChangedFiles
    };
  }

  const anomaly = `Review-agent anomaly: detected source-file modifications during a review-only pass (${relevantChangedFiles.join(', ')}).`;
  return {
    fileChangeVerification: {
      ...input.fileChangeVerification,
      result: {
        ...input.fileChangeVerification.result,
        status: 'failed',
        summary: `Review-agent anomaly: detected ${relevantChangedFiles.length} relevant workspace change(s) during a review-only pass.`,
        warnings: uniqueSorted([
          ...input.fileChangeVerification.result.warnings,
          anomaly
        ]),
        errors: uniqueSorted([
          ...input.fileChangeVerification.result.errors,
          'Review agents must not modify source files during review-only execution.'
        ])
      }
    },
    relevantFileChangesForOutcome: []
  };
}
