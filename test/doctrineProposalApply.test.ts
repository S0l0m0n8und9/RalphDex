import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  applyDoctrineProposal,
  detectProtectedTargets
} from '../src/ralph/doctrineProposalApply';
import {
  createDoctrineProposalArtifact,
  parseDoctrineUpdatesFromCompletionReport
} from '../src/ralph/doctrineProposals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeDoctrineWorkspace(): Promise<{ rootPath: string; doctrineDir: string }> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-apply-test-'));
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  return { rootPath, doctrineDir };
}

async function writeDoctrineFile(doctrineDir: string, fileName: string, content: string): Promise<string> {
  const filePath = path.join(doctrineDir, fileName);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

function makeProposal(updates: Parameters<typeof parseDoctrineUpdatesFromCompletionReport>[0]) {
  const { updates: parsedUpdates } = parseDoctrineUpdatesFromCompletionReport(updates);
  return createDoctrineProposalArtifact({
    provenanceId: 'run-i001-cli-20260430T000000Z',
    iteration: 1,
    selectedTaskId: 'T001',
    selectedTaskTitle: 'Apply test',
    source: 'completionReport',
    updates: parsedUpdates
  });
}

const WORKFLOWS_INITIAL = [
  '# Doctrine Workflows',
  '',
  '## Purpose',
  '',
  'Compact workflow facts.',
  '',
  '## Build',
  '',
  '- Unknown / not yet captured.',
  '',
  '## Validate',
  '',
  '- Unknown / not yet captured.',
  '',
  '## Unknowns',
  '',
  '- Unknown / not yet captured.',
  ''
].join('\n');

const DECISIONS_INITIAL = [
  '# Doctrine Decisions',
  '',
  '## Purpose',
  '',
  'Accepted project decisions.',
  '',
  '## Decisions',
  '',
  '- None captured.',
  '',
  '## Superseded Decisions',
  '',
  '- None.',
  ''
].join('\n');

// ---------------------------------------------------------------------------
// append operation
// ---------------------------------------------------------------------------

test('applyDoctrineProposal append adds text to end of target doctrine file', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  const filePath = await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'append',
    section: null,
    proposedText: '## Observed Workflow\n\n- npm run validate is the canonical gate.',
    rationale: 'Observed during task execution.',
    evidence: ['package.json']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'applied');
  assert.deepEqual(result.appliedUpdateIndexes, [0]);
  assert.deepEqual(result.rejectedUpdateIndexes, []);
  assert.deepEqual(result.filesChanged, ['.ralph/doctrine/workflows.md']);
  assert.equal(result.errors.length, 0);

  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.includes('npm run validate is the canonical gate.'), 'appended text must appear in file');
  assert.ok(content.startsWith('# Doctrine Workflows'), 'original content must be preserved');
  assert.ok(content.endsWith('\n'), 'file must end with single newline');
});

test('applyDoctrineProposal append does not modify other doctrine files', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);
  await writeDoctrineFile(doctrineDir, 'decisions.md', DECISIONS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'append',
    section: null,
    proposedText: '- Appended workflow note.',
    rationale: 'Observed.',
    evidence: ['src/foo.ts']
  }]);

  await applyDoctrineProposal({ proposal, rootPath });

  const decisionsContent = await fs.readFile(path.join(doctrineDir, 'decisions.md'), 'utf8');
  assert.equal(decisionsContent, DECISIONS_INITIAL, 'decisions.md must be untouched');
});

// ---------------------------------------------------------------------------
// addSectionItem operation
// ---------------------------------------------------------------------------

test('applyDoctrineProposal addSectionItem inserts text under the named section', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  const filePath = await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'addSectionItem',
    section: 'Validate',
    proposedText: '- Validation gate: `npm run validate`.',
    rationale: 'Observed validation gate.',
    evidence: ['package.json']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'applied');
  assert.deepEqual(result.appliedUpdateIndexes, [0]);

  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.includes('Validation gate: `npm run validate`.'), 'added item must appear under section');
  assert.ok(content.includes('## Validate'), '## Validate heading must be preserved');
  assert.ok(content.includes('## Unknowns'), 'next heading must be preserved');
});

test('applyDoctrineProposal addSectionItem does not duplicate exact existing text', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  const initialContent = [
    '# Doctrine Decisions',
    '',
    '## Decisions',
    '',
    '- Existing decision.',
    ''
  ].join('\n');
  const filePath = await writeDoctrineFile(doctrineDir, 'decisions.md', initialContent);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/decisions.md',
    operation: 'addSectionItem',
    section: 'Decisions',
    proposedText: '- Existing decision.',
    rationale: 'Re-observing same decision.',
    evidence: ['src/foo.ts']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'rejected', 'duplicate text must be rejected (warning path)');
  assert.equal(result.appliedUpdateIndexes.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('already present'), 'warning must mention duplicate');

  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content.split('- Existing decision.').length - 1, 1, 'text must not be duplicated');
});

test('applyDoctrineProposal addSectionItem fails when section is missing', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'addSectionItem',
    section: 'NonExistentSection',
    proposedText: '- Some item.',
    rationale: 'Test.',
    evidence: ['src/foo.ts']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'rejected');
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('NonExistentSection'), 'error must name the missing section');
  assert.ok(result.errors[0].includes('not found'), 'error must say not found');

  const content = await fs.readFile(path.join(doctrineDir, 'workflows.md'), 'utf8');
  assert.equal(content, WORKFLOWS_INITIAL, 'file must be unchanged on failure');
});

// ---------------------------------------------------------------------------
// replaceSection operation
// ---------------------------------------------------------------------------

test('applyDoctrineProposal replaceSection replaces only the named section body', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  const filePath = await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'replaceSection',
    section: 'Validate',
    proposedText: '- Run `npm run validate` before any commit.',
    rationale: 'Durable validation fact.',
    evidence: ['package.json']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'applied');

  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.includes('## Validate'), 'section heading must be preserved');
  assert.ok(content.includes('npm run validate'), 'replacement text must appear');
  assert.ok(!content.includes('Unknown / not yet captured.') || content.indexOf('## Validate') > content.indexOf('Unknown / not yet captured.'),
    'original Validate section body must be replaced');
  assert.ok(content.includes('## Unknowns'), 'subsequent section must be preserved');
});

test('applyDoctrineProposal replaceSection fails when section is missing without corrupting file', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);

  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'replaceSection',
    section: 'GhostSection',
    proposedText: '- Ghost content.',
    rationale: 'Test.',
    evidence: ['src/foo.ts']
  }]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'rejected');
  assert.equal(result.errors.length, 1);

  const content = await fs.readFile(path.join(doctrineDir, 'workflows.md'), 'utf8');
  assert.equal(content, WORKFLOWS_INITIAL, 'file must be unchanged on missing section');
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

test('applyDoctrineProposal rejects targetFile outside .ralph/doctrine/', async () => {
  const { rootPath } = await makeDoctrineWorkspace();

  const proposal = createDoctrineProposalArtifact({
    provenanceId: 'run-i001-cli-20260430T000000Z',
    iteration: 1,
    selectedTaskId: null,
    selectedTaskTitle: null,
    source: 'completionReport',
    updates: [{
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'append',
      section: null,
      proposedText: 'x',
      rationale: 'r',
      evidence: ['e'],
      requiresApproval: false,
      protectedTarget: false,
      risk: 'low'
    }]
  });

  const hackedProposal = {
    ...proposal,
    updates: [{
      ...proposal.updates[0],
      targetFile: '../../../etc/passwd'
    }]
  };

  const result = await applyDoctrineProposal({ proposal: hackedProposal, rootPath });

  assert.equal(result.action, 'rejected');
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('known doctrine file'), 'error must mention known doctrine file constraint');
});

test('applyDoctrineProposal rejects unknown doctrine file name', async () => {
  const { rootPath } = await makeDoctrineWorkspace();

  const proposal = createDoctrineProposalArtifact({
    provenanceId: 'run-i001-cli-20260430T000000Z',
    iteration: 1,
    selectedTaskId: null,
    selectedTaskTitle: null,
    source: 'completionReport',
    updates: [{
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'append',
      section: null,
      proposedText: 'x',
      rationale: 'r',
      evidence: ['e'],
      requiresApproval: false,
      protectedTarget: false,
      risk: 'low'
    }]
  });

  const hackedProposal = {
    ...proposal,
    updates: [{
      ...proposal.updates[0],
      targetFile: '.ralph/doctrine/secret.md'
    }]
  };

  const result = await applyDoctrineProposal({ proposal: hackedProposal, rootPath });

  assert.equal(result.action, 'rejected');
  assert.equal(result.errors.length, 1);
});

// ---------------------------------------------------------------------------
// Partial application
// ---------------------------------------------------------------------------

test('applyDoctrineProposal records partiallyApplied when only some updates succeed', async () => {
  const { rootPath, doctrineDir } = await makeDoctrineWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);
  await writeDoctrineFile(doctrineDir, 'decisions.md', DECISIONS_INITIAL);

  const proposal = makeProposal([
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'append',
      section: null,
      proposedText: '- Append succeeds.',
      rationale: 'First update.',
      evidence: ['src/a.ts']
    },
    {
      targetFile: '.ralph/doctrine/decisions.md',
      operation: 'addSectionItem',
      section: 'MissingSection',
      proposedText: '- This will fail.',
      rationale: 'Second update fails.',
      evidence: ['src/b.ts']
    }
  ]);

  const result = await applyDoctrineProposal({ proposal, rootPath });

  assert.equal(result.action, 'partiallyApplied');
  assert.deepEqual(result.appliedUpdateIndexes, [0]);
  assert.deepEqual(result.rejectedUpdateIndexes, [1]);
  assert.equal(result.errors.length, 1);
});

// ---------------------------------------------------------------------------
// Protected target detection
// ---------------------------------------------------------------------------

test('detectProtectedTargets identifies protected doctrine files', () => {
  const proposal = makeProposal([
    {
      targetFile: '.ralph/doctrine/workflows.md',
      operation: 'append',
      section: null,
      proposedText: 'x',
      rationale: 'r',
      evidence: ['e']
    },
    {
      targetFile: '.ralph/doctrine/invariants.md',
      operation: 'replaceSection',
      section: 'Invariants',
      proposedText: 'y',
      rationale: 'r',
      evidence: ['e']
    },
    {
      targetFile: '.ralph/doctrine/boundaries.md',
      operation: 'addSectionItem',
      section: 'Explicit Non-Goals',
      proposedText: 'z',
      rationale: 'r',
      evidence: ['e']
    }
  ]);

  const protected_ = detectProtectedTargets(proposal);
  assert.equal(protected_.length, 2);
  assert.ok(protected_.includes('.ralph/doctrine/invariants.md'));
  assert.ok(protected_.includes('.ralph/doctrine/boundaries.md'));
  assert.ok(!protected_.includes('.ralph/doctrine/workflows.md'));
});

test('detectProtectedTargets returns empty array for non-protected proposals', () => {
  const proposal = makeProposal([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'append',
    section: null,
    proposedText: 'x',
    rationale: 'r',
    evidence: ['e']
  }]);

  assert.deepEqual(detectProtectedTargets(proposal), []);
});
