import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDoctrineProposalArtifact } from '../src/commands/statusSnapshot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validUpdate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'append',
    section: null,
    proposedText: '- Observed: npm run validate.',
    rationale: 'Good reason.',
    evidence: ['src/foo.ts'],
    requiresApproval: false,
    protectedTarget: false,
    risk: 'low',
    ...overrides
  };
}

function validCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'doctrineUpdateProposal',
    proposalId: 'prop-abc-001',
    status: 'proposed',
    risk: 'low',
    updates: [validUpdate()],
    warnings: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Sanity: a fully-valid candidate is accepted
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact accepts a valid candidate', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate());
  assert.ok(result !== null, 'valid candidate must be accepted');
});

// ---------------------------------------------------------------------------
// Proposal-level: status must be a known value, not silently defaulted
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects invalid status', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ status: 'bogus' }));
  assert.equal(result, null, 'invalid status must be rejected');
});

test('normalizeDoctrineProposalArtifact rejects absent status', () => {
  const candidate = validCandidate();
  delete candidate.status;
  const result = normalizeDoctrineProposalArtifact(candidate);
  assert.equal(result, null, 'absent status must be rejected');
});

// ---------------------------------------------------------------------------
// Proposal-level: risk must be a known value, not silently defaulted
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects invalid risk', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ risk: 'critical' }));
  assert.equal(result, null, 'invalid risk must be rejected');
});

test('normalizeDoctrineProposalArtifact rejects absent risk', () => {
  const candidate = validCandidate();
  delete candidate.risk;
  const result = normalizeDoctrineProposalArtifact(candidate);
  assert.equal(result, null, 'absent risk must be rejected');
});

// ---------------------------------------------------------------------------
// Proposal-level: proposalId must be a non-empty trimmed string
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects whitespace-only proposalId', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ proposalId: '   ' }));
  assert.equal(result, null, 'whitespace-only proposalId must be rejected');
});

// ---------------------------------------------------------------------------
// Proposal-level: updates must be a non-empty array
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects empty updates array', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [] }));
  assert.equal(result, null, 'empty updates array must be rejected');
});

// ---------------------------------------------------------------------------
// Proposal-level: warnings must be an array of strings only
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects warnings array containing non-string item', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ warnings: ['ok', 42] }));
  assert.equal(result, null, 'non-string warning item must cause rejection');
});

// ---------------------------------------------------------------------------
// Update-level: targetFile must be non-empty
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects update with empty targetFile', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [validUpdate({ targetFile: '' })] }));
  assert.equal(result, null, 'empty targetFile must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: proposedText must be non-empty
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects update with empty proposedText', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [validUpdate({ proposedText: '' })] }));
  assert.equal(result, null, 'empty proposedText must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: rationale must be non-empty
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects update with empty rationale', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [validUpdate({ rationale: '' })] }));
  assert.equal(result, null, 'empty rationale must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: evidence must be a non-empty array of non-empty strings
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects update with empty evidence array', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [validUpdate({ evidence: [] })] }));
  assert.equal(result, null, 'empty evidence array must be rejected');
});

test('normalizeDoctrineProposalArtifact rejects update with non-string evidence item', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({ updates: [validUpdate({ evidence: [123] })] }));
  assert.equal(result, null, 'non-string evidence item must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: addSectionItem requires a non-empty section
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects addSectionItem update with null section', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({
    updates: [validUpdate({ operation: 'addSectionItem', section: null })]
  }));
  assert.equal(result, null, 'addSectionItem with null section must be rejected');
});

test('normalizeDoctrineProposalArtifact rejects addSectionItem update with empty string section', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({
    updates: [validUpdate({ operation: 'addSectionItem', section: '' })]
  }));
  assert.equal(result, null, 'addSectionItem with empty section must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: replaceSection requires a non-empty section
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact rejects replaceSection update with null section', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({
    updates: [validUpdate({ operation: 'replaceSection', section: null })]
  }));
  assert.equal(result, null, 'replaceSection with null section must be rejected');
});

test('normalizeDoctrineProposalArtifact rejects replaceSection update with empty string section', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({
    updates: [validUpdate({ operation: 'replaceSection', section: '' })]
  }));
  assert.equal(result, null, 'replaceSection with empty section must be rejected');
});

// ---------------------------------------------------------------------------
// Update-level: append may have null section (normalizes to null)
// ---------------------------------------------------------------------------

test('normalizeDoctrineProposalArtifact accepts append update with null section', () => {
  const result = normalizeDoctrineProposalArtifact(validCandidate({
    updates: [validUpdate({ operation: 'append', section: null })]
  }));
  assert.ok(result !== null, 'append with null section must be accepted');
  assert.equal(result!.updates[0].section, null);
});
