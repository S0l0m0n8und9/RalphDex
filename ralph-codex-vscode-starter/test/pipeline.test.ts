import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  buildPipelineChildTasks,
  buildPipelineRootTask,
  buildPipelineRunId,
  parsePrdSections,
  scaffoldPipelineRun,
  writePipelineArtifact
} from '../src/ralph/pipeline';

test('buildPipelineRunId returns a string matching the expected prefix', () => {
  const runId = buildPipelineRunId(new Date('2026-03-31T12:00:00.000Z'));
  assert.ok(runId.startsWith('pipeline-20260331T120000Z-'), `unexpected runId: ${runId}`);
  assert.match(runId, /^pipeline-\d{8}T\d{6}Z-[0-9a-f]{4}$/);
});

test('parsePrdSections returns h2 headings', () => {
  const prd = '# Title\n\n## Phase 1\n\nSome text.\n\n## Phase 2\n\nMore text.\n';
  const sections = parsePrdSections(prd);
  assert.deepEqual(sections, ['Phase 1', 'Phase 2']);
});

test('parsePrdSections falls back to h1 headings when no h2', () => {
  const prd = '# Only Top Level\n\nSome text.\n';
  const sections = parsePrdSections(prd);
  assert.deepEqual(sections, ['Only Top Level']);
});

test('parsePrdSections falls back to placeholder when no headings', () => {
  const prd = 'No headings here.';
  const sections = parsePrdSections(prd);
  assert.deepEqual(sections, ['Implement PRD objective']);
});

test('parsePrdSections returns at most 3 sections', () => {
  const prd = '## A\n## B\n## C\n## D\n## E\n';
  const sections = parsePrdSections(prd);
  assert.equal(sections.length, 3);
});

test('buildPipelineRootTask creates a todo task with the correct id', () => {
  const task = buildPipelineRootTask('Tpipe-001', 'pipeline-001');
  assert.equal(task.id, 'Tpipe-001');
  assert.equal(task.status, 'todo');
  assert.ok(task.title.includes('pipeline-001'));
});

test('buildPipelineChildTasks creates sequential child tasks', () => {
  const children = buildPipelineChildTasks('pipeline-001', 'Tpipe-001', ['Phase 1', 'Phase 2']);
  assert.equal(children.length, 2);
  assert.equal(children[0].id, 'Tpipe-001.01');
  assert.equal(children[0].parentId, 'Tpipe-001');
  assert.equal(children[0].dependsOn.length, 0);
  assert.equal(children[1].id, 'Tpipe-001.02');
  assert.equal(children[1].dependsOn[0].taskId, 'Tpipe-001.01');
  assert.equal(children[1].dependsOn[0].reason, 'blocks_sequence');
});

test('writePipelineArtifact writes a valid JSON artifact', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-pipeline-test-'));
  try {
    const artifact = {
      schemaVersion: 1 as const,
      kind: 'pipelineRun' as const,
      runId: 'pipeline-test-001',
      prdHash: 'sha256:abc',
      prdPath: '/some/path/prd.md',
      rootTaskId: 'Tpipe-test-001',
      decomposedTaskIds: ['Tpipe-test-001.01'],
      loopStartTime: new Date().toISOString(),
      status: 'running' as const
    };

    const artifactPath = await writePipelineArtifact(tmpDir, artifact);
    const raw = await fs.readFile(artifactPath, 'utf8');
    const parsed = JSON.parse(raw);

    assert.equal(parsed.kind, 'pipelineRun');
    assert.equal(parsed.runId, 'pipeline-test-001');
    assert.equal(parsed.status, 'running');
    assert.deepEqual(parsed.decomposedTaskIds, ['Tpipe-test-001.01']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scaffoldPipelineRun creates root + child tasks and writes artifact', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-scaffold-test-'));
  try {
    const prdPath = path.join(tmpDir, 'prd.md');
    const taskFilePath = path.join(tmpDir, 'tasks.json');
    const artifactDir = path.join(tmpDir, 'artifacts');

    await fs.writeFile(prdPath, '# My PRD\n\n## Step 1\n\n## Step 2\n', 'utf8');
    await fs.writeFile(taskFilePath, JSON.stringify({ version: 2, tasks: [] }, null, 2) + '\n', 'utf8');

    const result = await scaffoldPipelineRun({ prdPath, taskFilePath, artifactDir });

    assert.ok(result.artifact.runId, 'runId should be set');
    assert.equal(result.childTaskIds.length, 2);
    assert.ok(result.artifactPath.includes('pipelines'));

    const taskFileText = await fs.readFile(taskFilePath, 'utf8');
    const taskFile = JSON.parse(taskFileText);
    const taskIds = taskFile.tasks.map((t: { id: string }) => t.id);

    assert.ok(taskIds.includes(result.rootTaskId), 'root task must be in tasks.json');
    for (const childId of result.childTaskIds) {
      assert.ok(taskIds.includes(childId), `child task ${childId} must be in tasks.json`);
    }

    const artifactRaw = await fs.readFile(result.artifactPath, 'utf8');
    const artifact = JSON.parse(artifactRaw);
    assert.equal(artifact.status, 'running');
    assert.ok(artifact.prdHash.startsWith('sha256:'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
