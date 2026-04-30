import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { vscodeTestHarness } from './support/vscodeTestHarness';
import {
  createDoctrineProposalArtifact,
  parseDoctrineUpdatesFromCompletionReport
} from '../src/ralph/doctrineProposals';
import { stableJson } from '../src/ralph/integrity';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

class MemoryMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();
  keys(): readonly string[] { return Array.from(this.values.keys()); }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) { this.values.delete(key); return; }
    this.values.set(key, value);
  }
}

class MemorySecretStorage {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | undefined> { return this.values.get(key); }
  async store(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

function createExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: new MemoryMemento(),
    secrets: new MemorySecretStorage(),
    extensionUri: vscode.Uri.file(__dirname)
  } as unknown as vscode.ExtensionContext;
}

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

async function makeWorkspace(): Promise<{ rootPath: string; artifactDir: string; doctrineDir: string }> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-doctrine-cmd-'));
  const artifactDir = path.join(rootPath, '.ralph', 'artifacts');
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await Promise.all([
    fs.mkdir(artifactDir, { recursive: true }),
    fs.mkdir(doctrineDir, { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# PRD\n\nKeep safe.\n', 'utf8'),
    fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Ready.\n', 'utf8'),
    fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
      version: 2,
      tasks: [{ id: 'T1', title: 'Test task', status: 'todo' }]
    }, null, 2), 'utf8')
  ]);
  return { rootPath, artifactDir, doctrineDir };
}

async function writeDoctrineFile(doctrineDir: string, fileName: string, content: string): Promise<void> {
  await fs.writeFile(path.join(doctrineDir, fileName), content, 'utf8');
}

function makeProposal(overrides: Partial<Parameters<typeof createDoctrineProposalArtifact>[0]> = {}) {
  const { updates } = parseDoctrineUpdatesFromCompletionReport([{
    targetFile: '.ralph/doctrine/workflows.md',
    operation: 'append',
    section: null,
    proposedText: '- Observed: npm run validate.',
    rationale: 'Test.',
    evidence: ['package.json']
  }]);
  return createDoctrineProposalArtifact({
    provenanceId: 'run-i001-cli-20260430T000000Z',
    iteration: 1,
    selectedTaskId: 'T001',
    selectedTaskTitle: 'Test task',
    source: 'completionReport',
    updates,
    ...overrides
  });
}

async function writeLatestProposal(artifactDir: string, proposal: ReturnType<typeof makeProposal>): Promise<void> {
  const doctrineProposalsDir = path.join(artifactDir, 'doctrine-proposals');
  await fs.mkdir(doctrineProposalsDir, { recursive: true });
  const jsonPath = path.join(artifactDir, 'latest-doctrine-proposal.json');
  await fs.writeFile(jsonPath, stableJson(proposal), 'utf8');
}

const WORKFLOWS_INITIAL = [
  '# Doctrine Workflows',
  '',
  '## Validate',
  '',
  '- Unknown / not yet captured.',
  ''
].join('\n');

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

test.beforeEach(() => {
  vscodeTestHarness().reset();
});

// ---------------------------------------------------------------------------
// apply: no proposal exists
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal shows info message when no proposal exists', async () => {
  const { rootPath } = await makeWorkspace();

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  const allInfo = harness.state.infoMessages.map((m) => m.message).join('\n');
  assert.match(allInfo, /No doctrine proposal exists/i);
});

// ---------------------------------------------------------------------------
// apply: proposal already applied
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal shows warning when proposal is already applied', async () => {
  const { rootPath, artifactDir } = await makeWorkspace();
  const proposal = { ...makeProposal(), status: 'applied' as const };
  await writeLatestProposal(artifactDir, proposal);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  const allWarnings = harness.state.warningMessages.map((m) => m.message).join('\n');
  assert.match(allWarnings, /already been applied/i);
});

// ---------------------------------------------------------------------------
// apply: proposal already rejected
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal shows warning when proposal is already rejected', async () => {
  const { rootPath, artifactDir } = await makeWorkspace();
  const proposal = { ...makeProposal(), status: 'rejected' as const };
  await writeLatestProposal(artifactDir, proposal);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  const allWarnings = harness.state.warningMessages.map((m) => m.message).join('\n');
  assert.match(allWarnings, /already been rejected/i);
});

// ---------------------------------------------------------------------------
// apply: confirmation refused
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal does not apply when user cancels confirmation', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);
  await writeLatestProposal(artifactDir, makeProposal());

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  // Do NOT set messageChoice — default returns undefined (cancel)

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  // No info message about applying (no success notification)
  const allInfo = harness.state.infoMessages.map((m) => m.message).join('\n');
  assert.doesNotMatch(allInfo, /Applied/i);

  // Review artifacts must NOT have been written
  const reviewFiles = await fs.readdir(path.join(artifactDir, 'doctrine-proposals')).catch(() => []);
  const reviewJsonFiles = reviewFiles.filter((f) => f.endsWith('.review.json'));
  assert.equal(reviewJsonFiles.length, 0, 'review artifact must not be written when user cancels');
});

// ---------------------------------------------------------------------------
// apply: normal proposal — writes review artifacts and opens review Markdown
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal writes review artifacts and opens review Markdown on confirmation', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);
  const proposal = makeProposal();
  await writeLatestProposal(artifactDir, proposal);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Apply Proposal');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  // Review JSON must exist
  const reviewJsonPath = path.join(artifactDir, 'doctrine-proposals', `${proposal.proposalId}.review.json`);
  const reviewJsonExists = await fs.access(reviewJsonPath).then(() => true, () => false);
  assert.ok(reviewJsonExists, 'review.json must be written after apply');

  // Review Markdown must exist
  const reviewMdPath = path.join(artifactDir, 'doctrine-proposals', `${proposal.proposalId}.review.md`);
  const reviewMdExists = await fs.access(reviewMdPath).then(() => true, () => false);
  assert.ok(reviewMdExists, 'review.md must be written after apply');

  // Review Markdown must be opened
  assert.ok(
    harness.state.shownDocuments.some((d) => d?.endsWith('.review.md')),
    'review Markdown must be shown after apply'
  );

  // Success info message
  const allInfo = harness.state.infoMessages.map((m) => m.message).join('\n');
  assert.match(allInfo, /Applied|update/i);
});

// ---------------------------------------------------------------------------
// apply: protected doctrine — requires extra confirmation label
// ---------------------------------------------------------------------------

test('applyLatestDoctrineProposal uses protected confirmation label for protected targets', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  await writeDoctrineFile(doctrineDir, 'invariants.md', '# Invariants\n\n## Core Invariants\n\n- Keep tasks clean.\n');
  const { updates } = parseDoctrineUpdatesFromCompletionReport([{
    targetFile: '.ralph/doctrine/invariants.md',
    operation: 'addSectionItem',
    section: 'Core Invariants',
    proposedText: '- Tasks must be normalized.',
    rationale: 'Core invariant.',
    evidence: ['src/tasks.ts']
  }]);
  const proposal = createDoctrineProposalArtifact({
    provenanceId: 'run-i002-cli-20260430T000200Z',
    iteration: 2,
    selectedTaskId: 'T002',
    selectedTaskTitle: 'Protected test',
    source: 'completionReport',
    updates
  });
  await writeLatestProposal(artifactDir, proposal);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Apply Protected Doctrine Proposal');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestDoctrineProposal');

  // The warning must mention protected target
  const allWarnings = harness.state.warningMessages.map((m) => m.message).join('\n');
  assert.match(allWarnings, /protected doctrine/i);

  // Must still write review artifacts after confirmed protected apply
  const reviewJsonPath = path.join(artifactDir, 'doctrine-proposals', `${proposal.proposalId}.review.json`);
  const reviewJsonExists = await fs.access(reviewJsonPath).then(() => true, () => false);
  assert.ok(reviewJsonExists, 'review.json must be written after protected apply');
});

// ---------------------------------------------------------------------------
// reject: no proposal exists
// ---------------------------------------------------------------------------

test('rejectLatestDoctrineProposal shows info message when no proposal exists', async () => {
  const { rootPath } = await makeWorkspace();

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.rejectLatestDoctrineProposal');

  const allInfo = harness.state.infoMessages.map((m) => m.message).join('\n');
  assert.match(allInfo, /No doctrine proposal exists/i);
});

// ---------------------------------------------------------------------------
// reject: writes artifacts, does not touch doctrine files
// ---------------------------------------------------------------------------

test('rejectLatestDoctrineProposal writes review artifacts and does not modify doctrine files', async () => {
  const { rootPath, artifactDir, doctrineDir } = await makeWorkspace();
  await writeDoctrineFile(doctrineDir, 'workflows.md', WORKFLOWS_INITIAL);
  const proposal = makeProposal();
  await writeLatestProposal(artifactDir, proposal);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Reject Proposal');
  harness.setInputBoxValue('Contradicts agreed invariants.');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.rejectLatestDoctrineProposal');

  // Review JSON must exist
  const reviewJsonPath = path.join(artifactDir, 'doctrine-proposals', `${proposal.proposalId}.review.json`);
  const reviewJson = JSON.parse(await fs.readFile(reviewJsonPath, 'utf8'));
  assert.equal(reviewJson.action, 'rejected', 'review action must be rejected');
  assert.equal(reviewJson.reviewNotes, 'Contradicts agreed invariants.', 'review notes must be preserved');
  assert.deepEqual(reviewJson.filesChanged, [], 'no files must be changed on rejection');

  // Doctrine file must be untouched
  const workflowsContent = await fs.readFile(path.join(doctrineDir, 'workflows.md'), 'utf8');
  assert.equal(workflowsContent, WORKFLOWS_INITIAL, 'doctrine file must not be modified on rejection');

  // Review Markdown opened
  assert.ok(
    harness.state.shownDocuments.some((d) => d?.endsWith('.review.md')),
    'review Markdown must be shown after rejection'
  );

  // Info message
  const allInfo = harness.state.infoMessages.map((m) => m.message).join('\n');
  assert.match(allInfo, /rejected/i);
});

// ---------------------------------------------------------------------------
// manifest contributions: commands registered
// ---------------------------------------------------------------------------

test('activate registers applyLatestDoctrineProposal and rejectLatestDoctrineProposal commands', async () => {
  const { rootPath } = await makeWorkspace();

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  const commands = await vscode.commands.getCommands(true);

  assert.ok(commands.includes('ralphCodex.applyLatestDoctrineProposal'), 'apply command must be registered');
  assert.ok(commands.includes('ralphCodex.rejectLatestDoctrineProposal'), 'reject command must be registered');
});
