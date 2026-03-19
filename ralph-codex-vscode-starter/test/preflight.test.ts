import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { buildPreflightReport, checkStaleState, inspectPreflightArtifactReadiness, renderPreflightReport } from '../src/ralph/preflight';
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
  assert.equal(
    report.activeClaimSummary,
    'agent-a: T1 - Contested task @ 2026-03-10T00:00:00.000Z (stale); agent-b: T1 - Contested task @ 2026-03-10T00:10:00.000Z (stale); agent-c: T2 - Stale task @ 2026-03-10T00:00:00.000Z (stale)'
  );
  assert.match(renderPreflightReport(report), /- Active claim state: agent-a: T1 - Contested task @ 2026-03-10T00:00:00.000Z \(stale\); agent-b: T1 - Contested task @ 2026-03-10T00:10:00.000Z \(stale\); agent-c: T2 - Stale task @ 2026-03-10T00:00:00.000Z \(stale\)/);
});

test('buildPreflightReport warns when the default agent identity collides with another active default claim', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-preflight-'));
  const claimFilePath = path.join(rootPath, '.ralph', 'claims.json');
  await createDirectories([path.dirname(claimFilePath)]);
  await writeUtf8Files([
    [claimFilePath, JSON.stringify({
      version: 1,
      claims: [
        {
          taskId: 'T1',
          agentId: 'default',
          provenanceId: 'run-001',
          claimedAt: '2026-03-10T00:00:00.000Z',
          status: 'active'
        }
      ]
    })]
  ]);
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Claimed elsewhere', status: 'todo' },
      { id: 'T2', title: 'Available task', status: 'todo' }
    ]
  }));
  const claimGraph = await inspectTaskClaimGraph(claimFilePath, {
    now: new Date('2026-03-10T00:05:00.000Z')
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

  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'default_agent_id_collision'));
  assert.match(
    report.diagnostics.find((diagnostic) => diagnostic.code === 'default_agent_id_collision')?.message ?? '',
    /Set ralphCodex\.agentId to a unique value/
  );
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

test('checkStaleState returns no diagnostics when lock files are absent and no claims', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(rootPath, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.deepEqual(diagnostics, []);
});

test('checkStaleState emits stale_state_lock warning when state.lock is older than threshold', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(rootPath, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  // Create a state.lock file with mtime in the past
  const stateLockPath = path.join(ralphDir, 'state.lock');
  await fs.writeFile(stateLockPath, '', 'utf8');
  const pastTime = new Date('2026-03-18T11:50:00.000Z'); // 10 min before 'now'
  await fs.utimes(stateLockPath, pastTime, pastTime);

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000, // 5 min threshold
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.ok(diagnostics.some((d) => d.code === 'stale_state_lock'));
  assert.ok(diagnostics.find((d) => d.code === 'stale_state_lock')?.message.includes('Remove it manually'));
});

test('checkStaleState does not emit stale_state_lock when state.lock is within threshold', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(rootPath, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  const stateLockPath = path.join(ralphDir, 'state.lock');
  await fs.writeFile(stateLockPath, '', 'utf8');
  const recentTime = new Date('2026-03-18T11:58:00.000Z'); // 2 min before 'now'
  await fs.utimes(stateLockPath, recentTime, recentTime);

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000, // 5 min threshold
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.ok(!diagnostics.some((d) => d.code === 'stale_state_lock'));
});

test('checkStaleState emits stale_tasks_lock warning when tasks.lock is older than threshold', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(ralphDir, 'tasks.json'); // tasks.lock will be in ralphDir
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  const tasksLockPath = path.join(ralphDir, 'tasks.lock');
  await fs.writeFile(tasksLockPath, '', 'utf8');
  const pastTime = new Date('2026-03-18T11:50:00.000Z');
  await fs.utimes(tasksLockPath, pastTime, pastTime);

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.ok(diagnostics.some((d) => d.code === 'stale_tasks_lock'));
});

test('checkStaleState emits stale_active_claim_no_result and stale_active_claim_agent_offline for stale active claim', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  // Active claim that is 2 days old (past the 24-hour TTL)
  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        agentId: 'agent-x',
        taskId: 'T5',
        claimedAt: '2026-03-16T12:00:00.000Z',
        provenanceId: 'run-old',
        status: 'active'
      }
    ]
  }), 'utf8');

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000, // 24 hours
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.ok(diagnostics.some((d) => d.code === 'stale_active_claim_no_result'));
  assert.ok(diagnostics.some((d) => d.code === 'stale_active_claim_agent_offline'));
  const noResultDiag = diagnostics.find((d) => d.code === 'stale_active_claim_no_result');
  assert.ok(noResultDiag?.message.includes('agent-x'));
  assert.ok(noResultDiag?.message.includes('T5'));
});

test('checkStaleState does not emit stale claim warnings when iteration result exists after claim time', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  const artifactDir = path.join(ralphDir, 'artifacts');
  const iterDir = path.join(artifactDir, 'iteration-001');
  await createDirectories([ralphDir, iterDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');

  const claimTime = new Date('2026-03-16T12:00:00.000Z');
  const resultTime = new Date('2026-03-16T13:00:00.000Z'); // after claim

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        agentId: 'agent-x',
        taskId: 'T5',
        claimedAt: claimTime.toISOString(),
        provenanceId: 'run-old',
        status: 'active'
      }
    ]
  }), 'utf8');

  const resultPath = path.join(iterDir, 'iteration-result.json');
  await fs.writeFile(resultPath, JSON.stringify({
    provenanceId: 'run-old',
    selectedTaskId: 'T5',
    finishedAt: resultTime.toISOString()
  }), 'utf8');
  await fs.utimes(resultPath, resultTime, resultTime);

  // lastRun after claim time too
  await fs.writeFile(stateFilePath, JSON.stringify({
    version: 2,
    lastRun: {
      agentId: 'agent-x',
      provenanceId: 'run-old',
      finishedAt: resultTime.toISOString()
    },
    iterationHistory: [
      {
        agentId: 'agent-x',
        provenanceId: 'run-old',
        selectedTaskId: 'T5',
        finishedAt: resultTime.toISOString()
      }
    ]
  }), 'utf8');

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  assert.ok(!diagnostics.some((d) => d.code === 'stale_active_claim_no_result'));
  assert.ok(!diagnostics.some((d) => d.code === 'stale_active_claim_agent_offline'));
});

test('checkStaleState keeps claim checks isolated so one active claim does not mask another', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  const artifactDir = path.join(ralphDir, 'artifacts');
  const staleIterDir = path.join(artifactDir, 'iteration-001');
  const freshIterDir = path.join(artifactDir, 'iteration-002');
  await createDirectories([ralphDir, staleIterDir, freshIterDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');

  const staleClaimTime = new Date('2026-03-16T12:00:00.000Z');
  const freshClaimTime = new Date('2026-03-17T12:00:00.000Z');
  const freshResultTime = new Date('2026-03-17T13:00:00.000Z');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        agentId: 'agent-stale',
        taskId: 'T5',
        claimedAt: staleClaimTime.toISOString(),
        provenanceId: 'run-stale',
        status: 'active'
      },
      {
        agentId: 'agent-fresh',
        taskId: 'T6',
        claimedAt: freshClaimTime.toISOString(),
        provenanceId: 'run-fresh',
        status: 'active'
      }
    ]
  }), 'utf8');

  await fs.writeFile(path.join(freshIterDir, 'iteration-result.json'), JSON.stringify({
    provenanceId: 'run-fresh',
    selectedTaskId: 'T6',
    finishedAt: freshResultTime.toISOString()
  }), 'utf8');
  await fs.utimes(path.join(freshIterDir, 'iteration-result.json'), freshResultTime, freshResultTime);

  await fs.writeFile(stateFilePath, JSON.stringify({
    version: 2,
    lastRun: {
      agentId: 'agent-fresh',
      provenanceId: 'run-fresh',
      finishedAt: freshResultTime.toISOString()
    },
    runHistory: [
      {
        agentId: 'agent-fresh',
        provenanceId: 'run-fresh',
        finishedAt: freshResultTime.toISOString()
      }
    ],
    iterationHistory: [
      {
        agentId: 'agent-fresh',
        provenanceId: 'run-fresh',
        selectedTaskId: 'T6',
        finishedAt: freshResultTime.toISOString()
      }
    ]
  }), 'utf8');

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000,
    now: new Date('2026-03-18T12:00:00.000Z')
  });

  const staleTaskWarnings = diagnostics.filter((d) => d.message.includes('task T5'));
  const freshTaskWarnings = diagnostics.filter((d) => d.message.includes('task T6'));
  assert.ok(staleTaskWarnings.some((d) => d.code === 'stale_active_claim_no_result'));
  assert.ok(staleTaskWarnings.some((d) => d.code === 'stale_active_claim_agent_offline'));
  assert.equal(freshTaskWarnings.length, 0);
});

test('buildPreflightReport routes agentHealthDiagnostics into the agentHealth category and summary', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Task one', status: 'todo' }]
  }, null, 2));

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    selectedTask: null,
    claimGraph: null,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: { status: 'missing', command: null, executable: null },
    fileStatus,
    agentHealthDiagnostics: [
      { severity: 'warning', code: 'stale_state_lock', message: 'state.lock is 600s old.' },
      { severity: 'warning', code: 'stale_active_claim_agent_offline', message: 'Agent may be offline.' }
    ]
  });

  const agentHealthDiags = report.diagnostics.filter((d) => d.category === 'agentHealth');
  assert.equal(agentHealthDiags.length, 2);
  assert.ok(agentHealthDiags.some((d) => d.code === 'stale_state_lock'));
  assert.ok(agentHealthDiags.some((d) => d.code === 'stale_active_claim_agent_offline'));
  assert.match(report.summary, /Agent Health: 2 warnings/);
});

test('checkStaleState ignores released and non-stale active claims', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-stale-'));
  const ralphDir = path.join(rootPath, '.ralph');
  await createDirectories([ralphDir]);
  const stateFilePath = path.join(ralphDir, 'state.json');
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const artifactDir = path.join(ralphDir, 'artifacts');

  const now = new Date('2026-03-18T12:00:00.000Z');
  const recentClaimTime = new Date(now.getTime() - 60_000).toISOString(); // 1 min ago — within 24h TTL

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        agentId: 'agent-a',
        taskId: 'T1',
        claimedAt: '2026-03-16T00:00:00.000Z',
        provenanceId: 'run-old',
        status: 'released'  // released — should be ignored
      },
      {
        agentId: 'agent-b',
        taskId: 'T2',
        claimedAt: recentClaimTime,
        provenanceId: 'run-new',
        status: 'active'  // active but within TTL
      }
    ]
  }), 'utf8');

  const diagnostics = await checkStaleState({
    stateFilePath,
    taskFilePath,
    claimFilePath,
    artifactDir,
    staleLockThresholdMs: 300_000,
    staleClaimTtlMs: 86_400_000,
    now
  });

  assert.ok(!diagnostics.some((d) => d.code === 'stale_active_claim_no_result'));
  assert.ok(!diagnostics.some((d) => d.code === 'stale_active_claim_agent_offline'));
});
