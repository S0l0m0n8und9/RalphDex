import * as fs from 'fs/promises';
import {
  resolveDoctrineProposalCanonicalPaths,
  writeDoctrineProposalReviewArtifact,
  writeUpdatedDoctrineProposalArtifact
} from './artifactStore';
import { applyDoctrineProposal } from './doctrineProposalApply';
import type {
  DoctrineProposalArtifact,
  DoctrineProposalReviewArtifact,
  DoctrineReviewAction
} from './doctrineProposals';
import {
  isProtectedDoctrineTargetFile,
  normalizeDoctrineTargetFile
} from './doctrineProposals';

export interface DoctrineProposalReviewResult {
  review: DoctrineProposalReviewArtifact;
  updatedProposal: DoctrineProposalArtifact;
  reviewPath: string;
  reviewMarkdownPath: string;
}

function assertProposed(proposal: DoctrineProposalArtifact): void {
  if (proposal.status !== 'proposed') {
    throw new Error(`Doctrine proposal "${proposal.proposalId}" has already been ${proposal.status}.`);
  }
}

function readIndexes(proposal: DoctrineProposalArtifact, selectedUpdateIndexes?: number[]): number[] {
  const indexes = selectedUpdateIndexes ?? proposal.updates.map((_, index) => index);
  const unique = Array.from(new Set(indexes)).sort((left, right) => left - right);
  if (unique.length === 0) {
    throw new Error('Select at least one doctrine proposal update before applying.');
  }
  for (const index of unique) {
    if (!Number.isInteger(index) || index < 0 || index >= proposal.updates.length) {
      throw new Error(`Doctrine proposal update index ${index} is out of range.`);
    }
  }
  return unique;
}

function requireProtectedApproval(
  proposal: DoctrineProposalArtifact,
  selectedIndexes: number[],
  explicitProtectedApproval: boolean
): void {
  const selectedProtectedTargets = selectedIndexes
    .map((index) => proposal.updates[index])
    .flatMap((update) => {
      if (!update || typeof update.targetFile !== 'string') {
        return [];
      }
      const normalizedTarget = normalizeDoctrineTargetFile(update.targetFile);
      if (!normalizedTarget || !isProtectedDoctrineTargetFile(normalizedTarget)) {
        return [];
      }
      return [normalizedTarget];
    });

  if (selectedProtectedTargets.length > 0 && !explicitProtectedApproval) {
    throw new Error(
      `Doctrine proposal "${proposal.proposalId}" requires explicit protected approval before mutating ${Array.from(new Set(selectedProtectedTargets)).join(', ')}.`
    );
  }
}

function assertProposalArtifactShape(proposal: DoctrineProposalArtifact): void {
  if (!Array.isArray(proposal.updates) || proposal.updates.length === 0) {
    throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates must be a non-empty array.`);
  }

  proposal.updates.forEach((update, index) => {
    if (typeof update !== 'object' || update === null || Array.isArray(update)) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}] must be an object.`);
    }

    const normalizedTarget = typeof update.targetFile === 'string'
      ? normalizeDoctrineTargetFile(update.targetFile)
      : null;
    if (!normalizedTarget) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].targetFile is invalid.`);
    }

    if (!['append', 'replaceSection', 'addSectionItem'].includes(update.operation)) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].operation is invalid.`);
    }

    if (typeof update.proposedText !== 'string' || update.proposedText.trim().length === 0) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].proposedText is required.`);
    }

    if (typeof update.rationale !== 'string' || update.rationale.trim().length === 0) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].rationale is required.`);
    }

    if (!Array.isArray(update.evidence) || update.evidence.length === 0 || update.evidence.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].evidence is invalid.`);
    }

    if ((update.operation === 'replaceSection' || update.operation === 'addSectionItem')
      && (typeof update.section !== 'string' || update.section.trim().length === 0)) {
      throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].section is required for ${update.operation}.`);
    }
  });
}

async function readProposal(artifactRootDir: string, proposalId: string): Promise<DoctrineProposalArtifact> {
  const paths = resolveDoctrineProposalCanonicalPaths(artifactRootDir, proposalId);
  const raw = JSON.parse(await fs.readFile(paths.jsonPath, 'utf8')) as DoctrineProposalArtifact;
  if (raw.kind !== 'doctrineUpdateProposal' || raw.proposalId !== proposalId || !Array.isArray(raw.updates)) {
    throw new Error(`Doctrine proposal artifact "${proposalId}" is malformed.`);
  }
  assertProposalArtifactShape(raw);
  return raw;
}

function deriveAction(input: {
  proposal: DoctrineProposalArtifact;
  selectedIndexes: number[];
  appliedUpdateIndexes: number[];
  rejectedSelectedIndexes: number[];
}): { action: DoctrineReviewAction; rejectedUpdateIndexes: number[] } {
  const selected = new Set(input.selectedIndexes);
  const unselectedIndexes = input.proposal.updates
    .map((_, index) => index)
    .filter((index) => !selected.has(index));
  const rejectedUpdateIndexes = Array.from(new Set([
    ...input.rejectedSelectedIndexes,
    ...unselectedIndexes
  ])).sort((left, right) => left - right);

  if (input.appliedUpdateIndexes.length === 0) {
    return { action: 'rejected', rejectedUpdateIndexes };
  }
  if (rejectedUpdateIndexes.length > 0) {
    return { action: 'partiallyApplied', rejectedUpdateIndexes };
  }
  return { action: 'applied', rejectedUpdateIndexes: [] };
}

async function persistReview(input: {
  artifactRootDir: string;
  proposal: DoctrineProposalArtifact;
  action: DoctrineReviewAction;
  appliedUpdateIndexes: number[];
  rejectedUpdateIndexes: number[];
  filesChanged: string[];
  warnings: string[];
  errors: string[];
  reviewNotes: string | null;
}): Promise<DoctrineProposalReviewResult> {
  const reviewedAt = new Date().toISOString();
  const review: DoctrineProposalReviewArtifact = {
    schemaVersion: 1,
    kind: 'doctrineProposalReview',
    proposalId: input.proposal.proposalId,
    action: input.action,
    reviewedAt,
    reviewedBy: 'operator',
    risk: input.proposal.risk,
    selectedTaskId: input.proposal.selectedTaskId,
    provenanceId: input.proposal.provenanceId,
    appliedUpdateIndexes: input.appliedUpdateIndexes,
    rejectedUpdateIndexes: input.rejectedUpdateIndexes,
    filesChanged: input.filesChanged,
    warnings: input.warnings,
    errors: input.errors,
    reviewNotes: input.reviewNotes
  };

  const updatedProposal: DoctrineProposalArtifact = {
    ...input.proposal,
    status: input.action,
    reviewedAt,
    reviewedBy: 'operator',
    reviewAction: input.action,
    appliedUpdateIndexes: input.appliedUpdateIndexes,
    rejectedUpdateIndexes: input.rejectedUpdateIndexes,
    reviewNotes: input.reviewNotes,
    applicationWarnings: input.warnings
  };

  const [reviewPaths] = await Promise.all([
    writeDoctrineProposalReviewArtifact({ artifactRootDir: input.artifactRootDir, review }),
    writeUpdatedDoctrineProposalArtifact({ artifactRootDir: input.artifactRootDir, proposal: updatedProposal })
  ]);

  return {
    review,
    updatedProposal,
    reviewPath: reviewPaths.reviewJsonPath,
    reviewMarkdownPath: reviewPaths.reviewMdPath
  };
}

export async function applySelectedDoctrineProposalReview(input: {
  artifactRootDir: string;
  rootPath: string;
  proposalId: string;
  selectedUpdateIndexes?: number[];
  explicitProtectedApproval: boolean;
  reviewNotes?: string | null;
}): Promise<DoctrineProposalReviewResult> {
  const proposal = await readProposal(input.artifactRootDir, input.proposalId);
  assertProposed(proposal);
  const selectedIndexes = readIndexes(proposal, input.selectedUpdateIndexes);
  requireProtectedApproval(proposal, selectedIndexes, input.explicitProtectedApproval);

  const application = await applyDoctrineProposal({
    proposal,
    rootPath: input.rootPath,
    selectedUpdateIndexes: selectedIndexes
  });
  const derived = deriveAction({
    proposal,
    selectedIndexes,
    appliedUpdateIndexes: application.appliedUpdateIndexes,
    rejectedSelectedIndexes: application.rejectedUpdateIndexes
  });

  return persistReview({
    artifactRootDir: input.artifactRootDir,
    proposal,
    action: derived.action,
    appliedUpdateIndexes: application.appliedUpdateIndexes,
    rejectedUpdateIndexes: derived.rejectedUpdateIndexes,
    filesChanged: application.filesChanged,
    warnings: application.warnings,
    errors: application.errors,
    reviewNotes: input.reviewNotes ?? null
  });
}

export async function rejectSelectedDoctrineProposalReview(input: {
  artifactRootDir: string;
  proposalId: string;
  reviewNotes?: string | null;
}): Promise<DoctrineProposalReviewResult> {
  const proposal = await readProposal(input.artifactRootDir, input.proposalId);
  assertProposed(proposal);

  return persistReview({
    artifactRootDir: input.artifactRootDir,
    proposal,
    action: 'rejected',
    appliedUpdateIndexes: [],
    rejectedUpdateIndexes: proposal.updates.map((_, index) => index),
    filesChanged: [],
    warnings: [],
    errors: [],
    reviewNotes: input.reviewNotes ?? null
  });
}
