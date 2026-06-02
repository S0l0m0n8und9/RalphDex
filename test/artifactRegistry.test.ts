import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ARTIFACT_REGISTRY_SCHEMA_VERSION,
  artifactEntryId,
  buildArtifactEntry,
  createEmptyRegistry,
  queryArtifacts,
  reconcileArtifactRegistry,
  readArtifactRegistry,
  registerArtifacts,
  removeArtifactEntries,
  resolveArtifactRegistryPath,
  toRegistryRelativePath,
  upsertArtifactEntry,
  type ArtifactRegistryEntryInput
} from '../src/ralph/artifactRegistry';

async function tmpArtifactsDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-registry-'));
}

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}

// Fast-failing lock options so a wedged lock fails the test quickly instead of
// retrying for 30s.
const fastLock = { lockRetryCount: 4, lockRetryDelayMs: 5 };

function iterationEntry(over: Partial<ArtifactRegistryEntryInput> = {}): ArtifactRegistryEntryInput {
  return {
    type: 'iteration-result',
    path: 'iteration-001/iteration-result.json',
    runId: 'run-1',
    taskId: 'T1',
    agentId: 'agent-a',
    agentRole: 'implementer',
    provider: 'claude',
    iteration: 1,
    retentionClass: 'iteration',
    ...over
  };
}

test('resolveArtifactRegistryPath places index.json at the artifacts root', () => {
  assert.equal(
    resolveArtifactRegistryPath(path.join('/ws', '.ralph', 'artifacts')),
    path.join('/ws', '.ralph', 'artifacts', 'index.json')
  );
});

test('toRegistryRelativePath produces POSIX paths relative to the root', () => {
  const root = path.join('/ws', '.ralph', 'artifacts');
  assert.equal(
    toRegistryRelativePath(root, path.join(root, 'iteration-001', 'prompt.md')),
    'iteration-001/prompt.md'
  );
  // Already-relative input is normalised, not re-resolved.
  assert.equal(toRegistryRelativePath(root, path.join('runs', 'r1', 'summary.md')), 'runs/r1/summary.md');
});

test('buildArtifactEntry derives id from path and defaults pinned from retention class', () => {
  const root = path.join('/ws', '.ralph', 'artifacts');
  const entry = buildArtifactEntry(root, iterationEntry(), fixedClock());
  assert.equal(entry.id, artifactEntryId('iteration-001/iteration-result.json'));
  assert.equal(entry.path, 'iteration-001/iteration-result.json');
  assert.equal(entry.pinned, false);
  assert.equal(entry.createdAt, '2026-01-01T00:00:00.000Z');

  const pinned = buildArtifactEntry(root, iterationEntry({ retentionClass: 'pinned' }), fixedClock());
  assert.equal(pinned.pinned, true);

  const explicit = buildArtifactEntry(root, iterationEntry({ retentionClass: 'iteration', pinned: true }), fixedClock());
  assert.equal(explicit.pinned, true);
});

test('upsertArtifactEntry replaces an entry with the same path and keeps entries sorted', () => {
  const root = path.join('/ws', '.ralph', 'artifacts');
  let registry = createEmptyRegistry();
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-002/prompt.md', type: 'prompt' })));
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-001/prompt.md', type: 'prompt' })));
  assert.deepEqual(registry.entries.map((e) => e.path), ['iteration-001/prompt.md', 'iteration-002/prompt.md']);

  // Re-register the same path with new metadata -> upsert, not duplicate.
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-001/prompt.md', type: 'prompt', taskId: 'T9' })));
  assert.equal(registry.entries.length, 2);
  assert.equal(registry.entries.find((e) => e.path === 'iteration-001/prompt.md')?.taskId, 'T9');
});

test('queryArtifacts filters with AND semantics across fields', () => {
  const root = path.join('/ws', '.ralph', 'artifacts');
  let registry = createEmptyRegistry();
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-001/iteration-result.json', taskId: 'T1', provider: 'claude' })));
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-002/iteration-result.json', taskId: 'T2', provider: 'codex' })));
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'runs/r1/provenance-bundle.json', type: 'provenance-bundle', taskId: 'T1', provider: 'claude', retentionClass: 'durable' })));

  assert.equal(queryArtifacts(registry, { taskId: 'T1' }).length, 2);
  assert.equal(queryArtifacts(registry, { type: 'provenance-bundle' }).length, 1);
  assert.equal(queryArtifacts(registry, { taskId: 'T1', type: 'iteration-result' }).length, 1);
  assert.equal(queryArtifacts(registry, { provider: 'codex' }).length, 1);
  assert.equal(queryArtifacts(registry, {}).length, 3);
  assert.equal(queryArtifacts(registry, { taskId: 'missing' }).length, 0);
});

test('removeArtifactEntries drops entries by relative path', () => {
  const root = path.join('/ws', '.ralph', 'artifacts');
  let registry = createEmptyRegistry();
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-001/prompt.md' })));
  registry = upsertArtifactEntry(registry, buildArtifactEntry(root, iterationEntry({ path: 'iteration-002/prompt.md' })));
  registry = removeArtifactEntries(registry, ['iteration-001/prompt.md']);
  assert.deepEqual(registry.entries.map((e) => e.path), ['iteration-002/prompt.md']);
});

test('readArtifactRegistry returns an empty registry when none exists', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const registry = await readArtifactRegistry(dir);
  assert.equal(registry.schemaVersion, ARTIFACT_REGISTRY_SCHEMA_VERSION);
  assert.deepEqual(registry.entries, []);
});

test('registerArtifacts persists, upserts, and round-trips through disk', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await registerArtifacts(dir, [iterationEntry()], { lock: fastLock, now: fixedClock() });
  await registerArtifacts(
    dir,
    [iterationEntry({ path: 'runs/r1/provenance-bundle.json', type: 'provenance-bundle', retentionClass: 'durable' })],
    { lock: fastLock, now: fixedClock() }
  );

  const registry = await readArtifactRegistry(dir);
  assert.equal(registry.entries.length, 2);
  assert.deepEqual(registry.entries.map((e) => e.type).sort(), ['iteration-result', 'provenance-bundle']);

  // Re-register the iteration result with updated metadata -> upsert in place.
  await registerArtifacts(dir, [iterationEntry({ taskId: 'T42' })], { lock: fastLock, now: fixedClock() });
  const updated = await readArtifactRegistry(dir);
  assert.equal(updated.entries.length, 2);
  assert.equal(queryArtifacts(updated, { type: 'iteration-result' })[0].taskId, 'T42');
});

test('registerArtifacts with no inputs returns the current registry without writing', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const registry = await registerArtifacts(dir, [], { lock: fastLock });
  assert.deepEqual(registry.entries, []);
  // No file should have been created.
  await assert.rejects(fs.access(resolveArtifactRegistryPath(dir)));
});

test('reconcileArtifactRegistry drops entries whose files no longer exist', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  // Create one backing file; leave the other entry orphaned.
  await fs.mkdir(path.join(dir, 'iteration-001'), { recursive: true });
  await fs.writeFile(path.join(dir, 'iteration-001', 'prompt.md'), 'hi', 'utf8');

  await registerArtifacts(
    dir,
    [
      iterationEntry({ path: 'iteration-001/prompt.md', type: 'prompt' }),
      iterationEntry({ path: 'iteration-999/prompt.md', type: 'prompt' })
    ],
    { lock: fastLock, now: fixedClock() }
  );

  const { registry, removed } = await reconcileArtifactRegistry(dir, { lock: fastLock });
  assert.deepEqual(removed, ['iteration-999/prompt.md']);
  assert.deepEqual(registry.entries.map((e) => e.path), ['iteration-001/prompt.md']);

  // Persisted result matches the reconciled in-memory result.
  assert.deepEqual((await readArtifactRegistry(dir)).entries.map((e) => e.path), ['iteration-001/prompt.md']);
});

test('concurrent registerArtifacts calls do not lose entries', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await Promise.all(
    Array.from({ length: 8 }, (_unused, i) =>
      registerArtifacts(
        dir,
        [iterationEntry({ path: `iteration-${String(i).padStart(3, '0')}/prompt.md`, type: 'prompt' })],
        { lock: { lockRetryCount: 200, lockRetryDelayMs: 5 } }
      )
    )
  );

  const registry = await readArtifactRegistry(dir);
  assert.equal(registry.entries.length, 8);
});
