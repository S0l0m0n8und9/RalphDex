import type { DoctrineProposalArtifact } from './doctrineProposals';

export function selectDoctrineProposalTargetFiles(
  proposal: DoctrineProposalArtifact,
  selectedUpdateIndexes?: number[]
): string[] {
  const indexes = Array.isArray(selectedUpdateIndexes) && selectedUpdateIndexes.length > 0
    ? selectedUpdateIndexes
    : proposal.updates.map((_, index) => index);

  return Array.from(
    new Set(
      indexes
        .map((index) => proposal.updates[index]?.targetFile)
        .filter((target): target is string => typeof target === 'string' && target.length > 0)
    )
  );
}
