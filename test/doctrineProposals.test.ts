import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDoctrineProposalArtifact,
  parseDoctrineUpdatesFromCompletionReport,
  renderDoctrineProposalMarkdown
} from '../src/ralph/doctrineProposals';

test('parseDoctrineUpdatesFromCompletionReport classifies protected and low-risk doctrine updates deterministically', () => {
  const parsed = parseDoctrineUpdatesFromCompletionReport([
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'addSectionItem',
      section: 'Validate',
      proposedText: '- Validation command observed: `npm run validate`.',
      rationale: 'The repository uses npm run validate as the canonical validation gate.',
      evidence: ['package.json scripts']
    },
    {
      targetFile: '.ralph/doctrine/invariants.md',
      operation: 'replaceSection',
      section: 'Invariants',
      proposedText: '- Tasks must remain normalized before persistence.',
      rationale: 'The selected task confirmed normalization is a durable invariant.',
      evidence: ['docs/invariants.md']
    }
  ]);

  assert.equal(parsed.updates.length, 2);
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.updates[0], {
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'addSectionItem',
    section: 'Validate',
    proposedText: '- Validation command observed: `npm run validate`.',
    rationale: 'The repository uses npm run validate as the canonical validation gate.',
    evidence: ['package.json scripts'],
    requiresApproval: false,
    protectedTarget: false,
    risk: 'low'
  });
  assert.deepEqual(parsed.updates[1], {
    targetFile: '.ralph/doctrine/invariants.md',
    operation: 'replaceSection',
    section: 'Invariants',
    proposedText: '- Tasks must remain normalized before persistence.',
    rationale: 'The selected task confirmed normalization is a durable invariant.',
    evidence: ['docs/invariants.md'],
    requiresApproval: true,
    protectedTarget: true,
    risk: 'high'
  });
});

test('parseDoctrineUpdatesFromCompletionReport rejects invalid doctrine updates without producing valid artifacts', () => {
  const parsed = parseDoctrineUpdatesFromCompletionReport([
    {
      targetFile: '.ralph/doctrine/unknown.md',
      operation: 'append',
      section: null,
      proposedText: 'Unknown file proposal.',
      rationale: 'Should be rejected.',
      evidence: ['artifact']
    },
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'replaceSection',
      section: '',
      proposedText: 'Missing section name.',
      rationale: 'Should also be rejected.',
      evidence: ['artifact']
    }
  ]);

  assert.equal(parsed.updates.length, 0);
  assert.equal(parsed.warnings.length, 2);
  assert.match(parsed.warnings[0] ?? '', /Ignored invalid doctrineUpdates\[0\]/);
  assert.match(parsed.warnings[1] ?? '', /Ignored invalid doctrineUpdates\[1\]/);
});

test('createDoctrineProposalArtifact aggregates risk, warnings, and provenance metadata', () => {
  const artifact = createDoctrineProposalArtifact({
    provenanceId: 'run-i001-cli-20260430T000000Z',
    iteration: 1,
    selectedTaskId: 'T178',
    selectedTaskTitle: 'Audit doctrine proposal persistence',
    source: 'completionReport',
    createdAt: '2026-04-30T00:00:00.000Z',
    updates: parseDoctrineUpdatesFromCompletionReport([
      {
        targetFile: '.ralph/doctrine/workflows.md',
        operation: 'append',
        section: null,
        proposedText: 'Observed workflow note.',
        rationale: 'Adds compact observed workflow evidence.',
        evidence: ['package.json']
      },
      {
        targetFile: '.ralph/doctrine/agents.md',
        operation: 'addSectionItem',
        section: 'Provider Boundaries',
        proposedText: '- Providers may propose doctrine updates but may not apply them directly.',
        rationale: 'This tranche adds reviewable doctrine proposals only.',
        evidence: ['docs/boundaries.md']
      }
    ]).updates,
    warnings: ['Second update targets protected doctrine.']
  });

  assert.equal(artifact.kind, 'doctrineUpdateProposal');
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.provenanceId, 'run-i001-cli-20260430T000000Z');
  assert.equal(artifact.iteration, 1);
  assert.equal(artifact.selectedTaskId, 'T178');
  assert.equal(artifact.selectedTaskTitle, 'Audit doctrine proposal persistence');
  assert.equal(artifact.source, 'completionReport');
  assert.equal(artifact.status, 'proposed');
  assert.equal(artifact.risk, 'high');
  assert.equal(artifact.updates.length, 2);
  assert.deepEqual(artifact.warnings, ['Second update targets protected doctrine.']);
  assert.match(artifact.proposalId, /^doctrine-proposal-run-i001-cli-20260430T000000Z$/);
  assert.match(artifact.summary, /2 proposed doctrine updates/i);
});

test('renderDoctrineProposalMarkdown includes all required fields', () => {
  const artifact = createDoctrineProposalArtifact({
    provenanceId: 'run-i002-cli-20260430T000200Z',
    iteration: 2,
    selectedTaskId: 'T178',
    selectedTaskTitle: 'Verify Markdown renderer',
    source: 'completionReport',
    createdAt: '2026-04-30T00:02:00.000Z',
    updates: parseDoctrineUpdatesFromCompletionReport([
      {
        targetFile: '.ralph/doctrine/invariants.md',
        operation: 'replaceSection',
        section: 'Core Invariants',
        proposedText: '- Tasks must be normalized.',
        rationale: 'Core normalization invariant observed in practice.',
        evidence: ['src/ralph/taskNormalization.ts', 'test/taskNormalization.test.ts']
      }
    ]).updates,
    warnings: ['Update targets protected doctrine file.']
  });

  const md = renderDoctrineProposalMarkdown(artifact);

  assert.ok(md.includes('# Doctrine Update Proposal'), 'must have top-level heading');
  assert.ok(md.includes(artifact.proposalId), 'must include proposal id');
  assert.ok(md.includes('2026-04-30T00:02:00.000Z'), 'must include createdAt');
  assert.ok(md.includes('**Risk**: high'), 'must include risk');
  assert.ok(md.includes('**Source**: completionReport'), 'must include source');
  assert.ok(md.includes('**Status**: proposed'), 'must include status');
  assert.ok(md.includes('run-i002-cli-20260430T000200Z'), 'must include provenance id');
  assert.ok(md.includes('**Iteration**: 2'), 'must include iteration');
  assert.ok(md.includes('T178'), 'must include selected task id');
  assert.ok(md.includes('**Updates**: 1'), 'must include update count');
  assert.ok(md.includes('## Warnings'), 'must include warnings section');
  assert.ok(md.includes('Update targets protected doctrine file.'), 'must include warning text');
  assert.ok(md.includes('.ralph/doctrine/invariants.md'), 'must include target file');
  assert.ok(md.includes('**Operation**: replaceSection'), 'must include operation');
  assert.ok(md.includes('**Section**: Core Invariants'), 'must include section');
  assert.ok(md.includes('**Protected target**: yes'), 'must flag protected target');
  assert.ok(md.includes('**Approval required**: yes'), 'must flag approval required');
  assert.ok(md.includes('- Tasks must be normalized.'), 'must include proposed text');
  assert.ok(md.includes('Core normalization invariant observed in practice.'), 'must include rationale');
  assert.ok(md.includes('src/ralph/taskNormalization.ts'), 'must include first evidence item');
  assert.ok(md.includes('test/taskNormalization.test.ts'), 'must include second evidence item');
});

test('parseDoctrineUpdatesFromCompletionReport with absent doctrineUpdates produces no updates and no warnings', () => {
  const parsed = parseDoctrineUpdatesFromCompletionReport(undefined);

  assert.equal(parsed.updates.length, 0);
  assert.equal(parsed.warnings.length, 0);
});
