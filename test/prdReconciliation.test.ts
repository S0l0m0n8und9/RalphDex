import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  analyzePrdBacklogReconciliation,
  parsePrdTaskReferences,
  renderPrdReconciliationMarkdown,
  significantTitleTokens
} from '../src/ralph/prdReconciliation';
import { queryArtifacts, readArtifactRegistry } from '../src/ralph/artifactRegistry';
import { resolvePrdReconciliationPaths, writePrdReconciliationProposal } from '../src/ralph/artifactStore';
import type { RalphTaskFile } from '../src/ralph/types';

function taskFile(tasks: Array<{ id: string; title: string; status: string }>): RalphTaskFile {
  return { version: 2, tasks: tasks as RalphTaskFile['tasks'], mutationCount: 0 } as RalphTaskFile;
}

const AT = '2026-01-01T00:00:00.000Z';

test('parsePrdTaskReferences scopes live ids to the Current scope region', () => {
  const prd = [
    '# Brief',
    '## Current scope',
    'Live backlog: T224 and T226.',
    '## Delivered horizons (archive)',
    'Completed T58 and T100 long ago.'
  ].join('\n');
  const { allIds, liveScopeIds } = parsePrdTaskReferences(prd);
  assert.deepEqual([...allIds].sort(), ['T100', 'T224', 'T226', 'T58']);
  assert.deepEqual([...liveScopeIds].sort(), ['T224', 'T226']);
});

test('significantTitleTokens drops short tokens and stopwords', () => {
  assert.deepEqual(
    significantTitleTokens('Add the docs-validator guardrail for Ralph').sort(),
    ['docs', 'guardrail', 'validator']
  );
});

test('reports no findings for a workspace with no drift', () => {
  // T1 is active, cited by id in the PRD, unique, and present in the backlog.
  const prd = '## Current scope\nLive backlog: T1 (caching layer).';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T1', title: 'Implement caching layer', status: 'todo' }]),
    generatedAt: AT
  });
  assert.equal(proposal.findingCount, 0);
  assert.match(renderPrdReconciliationMarkdown(proposal), /No drift detected/);
});

test('does not flag a done task the PRD acknowledges as closed', () => {
  const prd = '## Current scope\nT225 is closed: the doctrine pack already exists.';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T225', title: 'Scaffold doctrine', status: 'done' }]),
    generatedAt: AT
  });
  assert.equal(proposal.findingCount, 0);
});

test('flags a stale PRD task reference', () => {
  const prd = '## Current scope\nWe still need T999 done.';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T1', title: 'Something', status: 'done' }]),
    generatedAt: AT
  });
  const f = proposal.findings.find((x) => x.type === 'stale_prd_task_reference');
  assert.ok(f, 'expected a stale_prd_task_reference finding');
  assert.deepEqual(f?.taskIds, ['T999']);
});

test('does not flag a stale reference cited only in the archived-horizon section', () => {
  // T58 is cited only in the archive; T999 is cited in live scope. Neither exists
  // in the backlog, but only the live-scope reference should be flagged stale.
  const prd = [
    '## Current scope',
    'Remaining: T999.',
    '## Delivered horizons (archive)',
    'Long ago we completed T58.'
  ].join('\n');
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T1', title: 'Something', status: 'done' }]),
    generatedAt: AT
  });
  const stale = proposal.findings.filter((x) => x.type === 'stale_prd_task_reference');
  assert.deepEqual(stale.flatMap((f) => f.taskIds ?? []), ['T999']);
});

test('flags an orphan active task not traceable to the PRD', () => {
  const prd = '## Current scope\nObjective: improve the caching layer.';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T7', title: 'Rewrite the telemetry exporter', status: 'todo' }]),
    generatedAt: AT
  });
  const f = proposal.findings.find((x) => x.type === 'orphan_active_task');
  assert.ok(f, 'expected an orphan_active_task finding');
  assert.deepEqual(f?.taskIds, ['T7']);
});

test('flags an active task referenced only by id in the archived PRD horizon', () => {
  const prd = [
    '## Current scope',
    'Objective: improve the caching layer.',
    '## Delivered horizons (archive)',
    'T58 was delivered in an earlier horizon.'
  ].join('\n');
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T58', title: 'Refresh build telemetry', status: 'todo' }]),
    generatedAt: AT
  });
  const f = proposal.findings.find((x) => x.type === 'orphan_active_task');
  assert.ok(f, 'expected archive-only PRD id references not to suppress orphan detection');
  assert.deepEqual(f?.taskIds, ['T58']);
});

test('does not flag an active task whose title token appears in the PRD', () => {
  const prd = '## Current scope\nObjective: improve the telemetry exporter.';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T7', title: 'Rewrite the telemetry exporter', status: 'todo' }]),
    generatedAt: AT
  });
  assert.equal(proposal.findings.filter((x) => x.type === 'orphan_active_task').length, 0);
});

test('flags an active task whose title tokens appear only in the archived PRD horizon', () => {
  const prd = [
    '## Current scope',
    'Objective: improve the caching layer.',
    '## Delivered horizons (archive)',
    'The telemetry exporter was completed in a previous horizon.'
  ].join('\n');
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([{ id: 'T7', title: 'Rewrite the telemetry exporter', status: 'todo' }]),
    generatedAt: AT
  });
  const f = proposal.findings.find((x) => x.type === 'orphan_active_task');
  assert.ok(f, 'expected archive-only title tokens not to suppress orphan detection');
  assert.deepEqual(f?.taskIds, ['T7']);
});

test('flags duplicate active tasks sharing a title', () => {
  const prd = '## Current scope\nT1 T2 caching layer';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([
      { id: 'T1', title: 'Improve caching layer', status: 'todo' },
      { id: 'T2', title: 'improve   caching LAYER', status: 'in_progress' }
    ]),
    generatedAt: AT
  });
  const f = proposal.findings.find((x) => x.type === 'duplicate_active_task');
  assert.ok(f);
  assert.deepEqual(f?.taskIds?.sort(), ['T1', 'T2']);
});

test('writePrdReconciliationProposal writes json and markdown at the artifacts root', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prd-recon-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const proposal = analyzePrdBacklogReconciliation({
    prdText: '## Current scope\nWe still need T999.',
    taskFile: taskFile([]),
    generatedAt: AT
  });
  const paths = await writePrdReconciliationProposal(dir, proposal);
  assert.deepEqual(paths, resolvePrdReconciliationPaths(dir));

  const persisted = JSON.parse(await fs.readFile(paths.jsonPath, 'utf8'));
  assert.equal(persisted.kind, 'prdReconciliation');
  assert.equal(persisted.findingCount, 1);
  assert.match(await fs.readFile(paths.markdownPath, 'utf8'), /stale_prd_task_reference/);

  const registry = await readArtifactRegistry(dir);
  const entries = queryArtifacts(registry, { type: 'prd-reconciliation' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.path, 'prd-reconciliation.json');
  assert.equal(entries[0]?.retentionClass, 'durable');
  assert.equal(queryArtifacts(registry, { type: 'prd-reconciliation-summary' })[0]?.path, 'prd-reconciliation.md');
});

test('renders findings as advisory markdown', () => {
  const prd = '## Current scope\nWe still need T999.';
  const proposal = analyzePrdBacklogReconciliation({
    prdText: prd,
    taskFile: taskFile([]),
    generatedAt: AT
  });
  const md = renderPrdReconciliationMarkdown(proposal);
  assert.match(md, /review-only proposal/);
  assert.match(md, /stale_prd_task_reference/);
});
