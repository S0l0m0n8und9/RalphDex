import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupGeneratedArtifacts,
  cleanupProvenanceBundles,
  previewGeneratedArtifactCleanup,
  previewProvenanceBundleCleanup
} from '../src/ralph/artifactStore';
import {
  renderCleanupManifestMarkdown,
  totalDeletedCount,
  type RalphCleanupManifest
} from '../src/ralph/cleanupManifest';

async function makeWorkspace(): Promise<{
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  handoffDir: string;
  stateFilePath: string;
  cleanup: () => Promise<void>;
}> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-cleanup-preview-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  const promptDir = path.join(rootPath, '.ralph', 'prompts');
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const handoffDir = path.join(rootPath, '.ralph', 'handoff');
  await Promise.all([
    fs.mkdir(artifactRootDir, { recursive: true }),
    fs.mkdir(promptDir, { recursive: true }),
    fs.mkdir(runDir, { recursive: true })
  ]);
  return {
    artifactRootDir,
    promptDir,
    runDir,
    handoffDir,
    stateFilePath: path.join(rootPath, '.ralph', 'state.json'),
    cleanup: () => fs.rm(rootPath, { recursive: true, force: true })
  };
}

async function seed(ws: { artifactRootDir: string; promptDir: string; runDir: string }, iterations: string[]): Promise<void> {
  for (const iteration of iterations) {
    const dir = path.join(ws.artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
    await fs.writeFile(path.join(ws.promptDir, `iteration-${iteration}.prompt.md`), `p ${iteration}\n`, 'utf8');
    await fs.writeFile(path.join(ws.runDir, `iteration-${iteration}.transcript.md`), `t ${iteration}\n`, 'utf8');
  }
}

const cleanupInput = (ws: { artifactRootDir: string; promptDir: string; runDir: string; stateFilePath: string }) => ({
  artifactRootDir: ws.artifactRootDir,
  promptDir: ws.promptDir,
  runDir: ws.runDir,
  stateFilePath: ws.stateFilePath,
  retentionCount: 1,
  protectionScope: 'currentAndLatest' as const
});

test('previewGeneratedArtifactCleanup matches what cleanup deletes and does not touch disk', async (t) => {
  const ws = await makeWorkspace();
  t.after(ws.cleanup);
  await seed(ws, ['001', '002', '003']);

  const preview = await previewGeneratedArtifactCleanup(cleanupInput(ws));

  // Preview is non-destructive: every seeded iteration directory still exists.
  for (const iteration of ['001', '002', '003']) {
    await fs.access(path.join(ws.artifactRootDir, `iteration-${iteration}`));
  }

  // retentionCount 1 keeps the newest (003) and slates the older two for deletion.
  assert.deepEqual(preview.deletedIterationDirectories.sort(), ['iteration-001', 'iteration-002']);

  const applied = await cleanupGeneratedArtifacts(cleanupInput(ws));
  assert.deepEqual(applied.deletedIterationDirectories.sort(), preview.deletedIterationDirectories.sort());
  assert.deepEqual(applied.deletedPromptFiles.sort(), preview.deletedPromptFiles.sort());
  assert.deepEqual(applied.deletedRunArtifactBaseNames.sort(), preview.deletedRunArtifactBaseNames.sort());

  // After applying, the slated directories are gone and the retained one remains.
  await assert.rejects(fs.access(path.join(ws.artifactRootDir, 'iteration-001')));
  await fs.access(path.join(ws.artifactRootDir, 'iteration-003'));
});

test('previewProvenanceBundleCleanup mirrors cleanupProvenanceBundles without deleting', async (t) => {
  const ws = await makeWorkspace();
  t.after(ws.cleanup);
  const runsDir = path.join(ws.artifactRootDir, 'runs');
  for (const id of ['run-001', 'run-002', 'run-003']) {
    await fs.mkdir(path.join(runsDir, id), { recursive: true });
    await fs.writeFile(path.join(runsDir, id, 'provenance-bundle.json'), '{}', 'utf8');
  }

  const preview = await previewProvenanceBundleCleanup({ artifactRootDir: ws.artifactRootDir, retentionCount: 1 });
  // Non-destructive.
  for (const id of ['run-001', 'run-002', 'run-003']) {
    await fs.access(path.join(runsDir, id));
  }
  assert.deepEqual(preview.deletedBundleIds.sort(), ['run-001', 'run-002']);

  const applied = await cleanupProvenanceBundles({ artifactRootDir: ws.artifactRootDir, retentionCount: 1 });
  assert.deepEqual(applied.deletedBundleIds.sort(), preview.deletedBundleIds.sort());
});

test('renderCleanupManifestMarkdown and totalDeletedCount summarise a manifest', () => {
  const manifest: RalphCleanupManifest = {
    schemaVersion: 1,
    kind: 'cleanupManifest',
    mode: 'applied',
    createdAt: '2026-01-01T00:00:00.000Z',
    retentionCount: 1,
    deleted: {
      iterationDirectories: ['iteration-001', 'iteration-002'],
      promptFiles: ['iteration-001.prompt.md'],
      runArtifactBaseNames: [],
      handoffFiles: [],
      watchdogFiles: []
    },
    retained: {
      iterationDirectories: ['iteration-003'],
      promptFiles: ['iteration-003.prompt.md'],
      runArtifactBaseNames: [],
      protectedIterationDirectories: ['iteration-003'],
      protectedPromptFiles: [],
      protectedRunArtifactBaseNames: []
    },
    provenanceBundles: { deletedBundleIds: ['run-001'], retainedBundleIds: ['run-003'], protectedBundleIds: [] },
    deletedLogFiles: ['extension.log'],
    pointerIntegrity: { repairedLatestArtifactPaths: ['latest-summary.md'], staleLatestArtifactPaths: [] },
    registryStatus: 'present',
    registryReconciledEntryCount: 2
  };

  assert.equal(totalDeletedCount(manifest), 2 + 1 + 0 + 0 + 0 + 1 + 1);
  const md = renderCleanupManifestMarkdown(manifest);
  assert.match(md, /cleanup manifest \(applied\)/);
  assert.match(md, /Deleted iteration directories \(2\)/);
  assert.match(md, /reconciled 2 stale entries/);
  assert.match(md, /Repaired pointers \(1\)/);
});
