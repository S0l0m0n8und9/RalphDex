import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  applySelectedDoctrineProposalReview,
  rejectSelectedDoctrineProposalReview
} from '../src/ralph/doctrineProposalReview';
import {
  createDoctrineProposalArtifact,
  parseDoctrineUpdatesFromCompletionReport
} from '../src/ralph/doctrineProposals';
import { writeDoctrineProposalArtifact, resolveIterationArtifactPaths } from '../src/ralph/artifactStore';

async function makeWorkspace(): Promise<{ rootPath: string; artifactDir: string; doctrineDir: string }> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-review-test-'));
  const artifactDir = path.join(rootPath, '.ralph', 'artifacts');
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  await fs.writeFile(path.join(doctrineDir, 'workflows.md'), [
    '# Doctrine Workflows',
    '',
    '## Validate',
    '',
    '- Unknown.',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(doctrineDir, 'invariants.md'), [
    '# Doctrine Invariants',
    '',
    '## Core Invariants',
    '',
    '- Existing invariant.',
    ''
  ].join('\n'), 'utf8');
  return { rootPath, artifactDir, doctrineDir };
}

function makeProposal(proposalId = 'proposal-review-1') {
  const { updates } = parseDoctrineUpdatesFromCompletionReport([
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'addSectionItem',
      section: 'Validate',
      proposedText: '- Run npm run validate.',
      rationale: 'Validation workflow.',
      evidence: ['package.json']
    },
    {
      targetFile: '.ralph/doctrine/invariants.md',
      operation: 'replaceSection',
      section: 'Core Invariants',
      proposedText: '- Protected invariant replacement.',
      rationale: 'Protected rule.',
      evidence: ['src/invariants.ts']
    }
  ]);
  return createDoctrineProposalArtifact({
    provenanceId: 'prov-review',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Review proposal',
    source: 'completionReport',
    proposalId,
    updates
  });
}

test('applySelectedDoctrineProposalReview requires explicit approval before protected mutation', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  const proposal = makeProposal();
  await writeDoctrineProposalArtifact({
    paths: resolveIterationArtifactPaths(artifactDir, 1),
    artifactRootDir: artifactDir,
    proposal
  });

  await assert.rejects(
    () => applySelectedDoctrineProposalReview({
      artifactRootDir: artifactDir,
      rootPath,
      proposalId: proposal.proposalId,
      selectedUpdateIndexes: [1],
      explicitProtectedApproval: false
    }),
    /explicit protected approval/i
  );

  const invariants = await fs.readFile(path.join(doctrineDir, 'invariants.md'), 'utf8');
  assert.ok(invariants.includes('- Existing invariant.'), 'protected doctrine must not mutate without explicit approval');
});

test('applySelectedDoctrineProposalReview persists partial outcome for selected update indexes', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  const proposal = makeProposal('proposal-review-partial');
  await writeDoctrineProposalArtifact({
    paths: resolveIterationArtifactPaths(artifactDir, 1),
    artifactRootDir: artifactDir,
    proposal
  });

  const result = await applySelectedDoctrineProposalReview({
    artifactRootDir: artifactDir,
    rootPath,
    proposalId: proposal.proposalId,
    selectedUpdateIndexes: [0],
    explicitProtectedApproval: false
  });

  assert.equal(result.updatedProposal.status, 'partiallyApplied');
  assert.deepEqual(result.review.appliedUpdateIndexes, [0]);
  assert.deepEqual(result.review.rejectedUpdateIndexes, [1]);
  assert.ok(result.reviewPath.endsWith('.review.json'));

  const workflow = await fs.readFile(path.join(doctrineDir, 'workflows.md'), 'utf8');
  const invariants = await fs.readFile(path.join(doctrineDir, 'invariants.md'), 'utf8');
  assert.ok(workflow.includes('- Run npm run validate.'));
  assert.ok(invariants.includes('- Existing invariant.'));

  const persistedProposal = JSON.parse(await fs.readFile(path.join(artifactDir, 'doctrine-proposals', `${proposal.proposalId}.json`), 'utf8'));
  assert.equal(persistedProposal.status, 'partiallyApplied');
});

test('rejectSelectedDoctrineProposalReview persists rejection without mutating doctrine', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  const proposal = makeProposal('proposal-review-reject');
  await writeDoctrineProposalArtifact({
    paths: resolveIterationArtifactPaths(artifactDir, 1),
    artifactRootDir: artifactDir,
    proposal
  });

  const result = await rejectSelectedDoctrineProposalReview({
    artifactRootDir: artifactDir,
    proposalId: proposal.proposalId,
    reviewNotes: 'Not aligned.'
  });

  assert.equal(result.updatedProposal.status, 'rejected');
  assert.deepEqual(result.review.rejectedUpdateIndexes, [0, 1]);
  assert.equal(result.review.reviewNotes, 'Not aligned.');

  const workflow = await fs.readFile(path.join(doctrineDir, 'workflows.md'), 'utf8');
  assert.ok(!workflow.includes('- Run npm run validate.'));
  assert.ok(rootPath, 'root path fixture is intentionally unused by reject persistence');
});
