import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { buildPreflightReport, inspectPreflightArtifactReadiness } from '../src/ralph/preflight';
import { inspectTaskClaimGraph, inspectTaskFileText, selectNextTask } from '../src/ralph/taskFile';

const fileStatus = {
  prdPath: true,
  progressPath: true,
  taskFilePath: true,
  stateFilePath: true,
  promptDir: true,
  runDir: true,
  logDir: true,
  artifactDir: true
};

async function createDirectories(paths: string[]): Promise<void> {
  await Promise.all(paths.map((targetPath) => fs.mkdir(targetPath, { recursive: true })));
}

async function writeUtf8Files(entries: Array<readonly [string, string]>): Promise<void> {
  await Promise.all(entries.map(([targetPath, contents]) => fs.writeFile(targetPath, contents, 'utf8')));
}

test('buildPreflightReport surfaces likely schema drift as a task-graph error', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broken alias', status: 'todo', dependencies: ['T0'] }
    ]
  }, null, 2));

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: null,
    selectedTask: null,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: {
      command: null,
      status: 'missing',
      executable: null
    },
    fileStatus
  });

  assert.equal(report.ready, false);
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported_task_field'));
  assert.match(report.summary, /Task graph: 1 error/);
});

test('buildPreflightReport blocks tracker drift when a done parent still has unfinished descendants', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Completed parent', status: 'done' },
      { id: 'T1.1', title: 'Active child', status: 'in_progress', parentId: 'T1' },
      { id: 'T1.1.1', title: 'Blocked grandchild', status: 'blocked', parentId: 'T1.1' }
    ]
  }, null, 2));

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: null,
    selectedTask: null,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: {
      command: null,
      status: 'missing',
      executable: null
    },
    fileStatus
  });

  assert.equal(report.ready, false);
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'completed_parent_with_incomplete_descendants'));
  assert.match(report.summary, /No task selected because task-ledger drift blocks safe selection/);
  assert.match(report.summary, /Task T1 .*is marked done but descendant tasks are still unfinished/);
  assert.match(report.summary, /Task graph: 1 error/);
});

test('buildPreflightReport distinguishes selected validation commands from confirmed executables', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Run checks', status: 'todo' }
    ]
  }));
  const selectedTask = taskInspection.taskFile ? selectNextTask(taskInspection.taskFile) : null;

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    selectedTask,
    taskValidationHint: 'pytest',
    validationCommand: 'pytest',
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: {
      command: 'pytest',
      status: 'executableNotConfirmed',
      executable: 'pytest'
    },
    fileStatus
  });

  assert.equal(report.ready, true);
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'validation_command_executable_not_confirmed'));
  assert.match(report.summary, /Validation pytest\. Executable not confirmed\./);
});

test('buildPreflightReport surfaces contested, stale, and mismatched claims in claim-graph diagnostics', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-preflight-'));
  const claimFilePath = path.join(rootPath, '.ralph', 'claims.json');
  await createDirectories([path.dirname(claimFilePath)]);
  await writeUtf8Files([
    [claimFilePath, JSON.stringify({
      version: 1,
      claims: [
        {
          taskId: 'T1',
          agentId: 'agent-a',
          provenanceId: 'run-001',
          claimedAt: '2026-03-10T00:00:00.000Z',
          status: 'active'
        },
        {
          taskId: 'T1',
          agentId: 'agent-b',
          provenanceId: 'run-002',
          claimedAt: '2026-03-10T00:10:00.000Z',
          status: 'active'
        },
        {
          taskId: 'T2',
          agentId: 'agent-c',
          provenanceId: 'run-003',
          claimedAt: '2026-03-10T00:00:00.000Z',
          status: 'active'
        }
      ]
    })]
  ]);
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Contested task', status: 'todo' },
      { id: 'T2', title: 'Stale task', status: 'todo' }
    ]
  }));
  const claimGraph = await inspectTaskClaimGraph(claimFilePath, {
    now: new Date('2026-03-16T00:00:00.000Z')
  });
  const report = buildPreflightReport({
    rootPath,
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: { todo: 2, in_progress: 0, blocked: 0, done: 0 },
    selectedTask: taskInspection.taskFile ? selectNextTask(taskInspection.taskFile) : null,
    currentProvenanceId: 'run-current',
    claimGraph,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: {
      command: null,
      status: 'missing',
      executable: null
    },
    fileStatus
  });

  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'task_claim_contested'));
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'task_claim_stale'));
  assert.equal(
    report.diagnostics.filter((diagnostic) => diagnostic.code === 'task_claim_provenance_mismatch').length,
    2
  );
  assert.match(report.summary, /Claim graph:/);
});

test('inspectPreflightArtifactReadiness reports stale latest surfaces and missing latest-pointer targets', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-preflight-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  const promptDir = path.join(rootPath, '.ralph', 'prompts');
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const stateFilePath = path.join(rootPath, '.ralph', 'state.json');
  await createDirectories([
    path.dirname(stateFilePath),
    artifactRootDir,
    promptDir,
    runDir
  ]);
  await writeUtf8Files([
    [stateFilePath, JSON.stringify({ version: 2, runHistory: [], iterationHistory: [] })],
    [path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-005'),
      promptPath: path.join(promptDir, 'iteration-005.prompt.md')
    })],
    [path.join(artifactRootDir, 'latest-execution-plan.json'), JSON.stringify({
      promptPath: path.join(promptDir, 'iteration-004.prompt.md')
    })],
    [path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      reportPath: path.join(artifactRootDir, 'iteration-005', 'preflight-report.json')
    })],
    [path.join(artifactRootDir, 'latest-provenance-bundle.json'), JSON.stringify({
      preflightReportPath: path.join(artifactRootDir, 'iteration-005', 'preflight-report.json')
    })]
  ]);

  const diagnostics = await inspectPreflightArtifactReadiness({
    rootPath,
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25
  });
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Run checks', status: 'todo' }
    ]
  }));
  const selectedTask = taskInspection.taskFile ? selectNextTask(taskInspection.taskFile) : null;
  const report = buildPreflightReport({
    rootPath,
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    selectedTask,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: {
      command: null,
      status: 'missing',
      executable: null
    },
    fileStatus,
    artifactReadinessDiagnostics: diagnostics
  });

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'latest_artifact_surfaces_stale'));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'latest_artifact_pointer_targets_missing'));
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'latest_artifact_surfaces_stale'));
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'latest_artifact_pointer_targets_missing'));
});

test('inspectPreflightArtifactReadiness warns when retention cleanup is disabled or roots overlap', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-preflight-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const stateFilePath = path.join(rootPath, '.ralph', 'state.json');
  await createDirectories([
    path.dirname(stateFilePath),
    artifactRootDir,
    runDir,
    path.join(artifactRootDir, 'iteration-001'),
    path.join(artifactRootDir, 'runs', 'run-i001-cli-20260310T000000Z')
  ]);
  await writeUtf8Files([
    [stateFilePath, JSON.stringify({ version: 2, runHistory: [], iterationHistory: [] })],
    [path.join(artifactRootDir, 'iteration-001.prompt.md'), 'prompt\n'],
    [path.join(runDir, 'iteration-001.transcript.md'), 'transcript\n']
  ]);

  const diagnostics = await inspectPreflightArtifactReadiness({
    rootPath,
    artifactRootDir,
    promptDir: artifactRootDir,
    runDir,
    stateFilePath,
    generatedArtifactRetentionCount: 0,
    provenanceBundleRetentionCount: 0
  });

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'artifact_cleanup_root_overlap'));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'generated_artifact_retention_disabled'));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'provenance_bundle_retention_disabled'));
});
