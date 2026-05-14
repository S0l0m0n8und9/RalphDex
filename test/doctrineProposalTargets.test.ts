import assert from 'node:assert/strict';
import test from 'node:test';
import { createDoctrineProposalArtifact, parseDoctrineUpdatesFromCompletionReport } from '../src/ralph/doctrineProposals';
import { selectDoctrineProposalTargetFiles } from '../src/ralph/doctrineProposalTargets';

function makeProposal() {
  const { updates } = parseDoctrineUpdatesFromCompletionReport([
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'append',
      section: null,
      proposedText: '- A',
      rationale: 'A',
      evidence: ['a']
    },
    {
      targetFile: '.ralph/doctrine/invariants.md',
      operation: 'replaceSection',
      section: 'Core Invariants',
      proposedText: '- B',
      rationale: 'B',
      evidence: ['b']
    },
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'addSectionItem',
      section: 'Validate',
      proposedText: '- C',
      rationale: 'C',
      evidence: ['c']
    }
  ]);

  return createDoctrineProposalArtifact({
    provenanceId: 'prov-targets',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Target selection',
    source: 'completionReport',
    proposalId: 'proposal-targets',
    updates
  });
}

test('selectDoctrineProposalTargetFiles returns all unique targets when no selection is provided', () => {
  const proposal = makeProposal();
  assert.deepEqual(selectDoctrineProposalTargetFiles(proposal), [
    '.ralph/doctrine/workflows.md',
    '.ralph/doctrine/invariants.md'
  ]);
});

test('selectDoctrineProposalTargetFiles returns only selected targets when indexes are provided', () => {
  const proposal = makeProposal();
  assert.deepEqual(selectDoctrineProposalTargetFiles(proposal, [1]), [
    '.ralph/doctrine/invariants.md'
  ]);
});
