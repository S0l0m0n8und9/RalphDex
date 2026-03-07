import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStatusReport, RalphStatusSnapshot } from '../src/ralph/statusReport';

function snapshot(overrides: Partial<RalphStatusSnapshot> = {}): RalphStatusSnapshot {
  return {
    workspaceName: 'workspace',
    rootPath: '/workspace',
    workspaceTrusted: true,
    nextIteration: 3,
    taskCounts: { todo: 2, in_progress: 0, blocked: 0, done: 1 },
    taskFileError: null,
    selectedTask: { id: 'T2', title: 'Next task', status: 'todo' },
    lastIteration: {
      schemaVersion: 1,
      iteration: 2,
      selectedTaskId: 'T1',
      selectedTaskTitle: 'Previous task',
      promptKind: 'iteration',
      promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
      artifactDir: '/workspace/.ralph/artifacts/iteration-002',
      adapterUsed: 'cliExec',
      executionIntegrity: {
        promptTarget: 'cliExec',
        templatePath: '/workspace/prompt-templates/iteration.md',
        executionPlanPath: '/workspace/.ralph/artifacts/iteration-002/execution-plan.json',
        promptArtifactPath: '/workspace/.ralph/artifacts/iteration-002/prompt.md',
        promptHash: 'sha256:abc123',
        promptByteLength: 1234,
        executionPayloadHash: 'sha256:abc123',
        executionPayloadMatched: true,
        mismatchReason: null,
        cliInvocationPath: '/workspace/.ralph/artifacts/iteration-002/cli-invocation.json'
      },
      executionStatus: 'succeeded',
      verificationStatus: 'failed',
      completionClassification: 'complete',
      followUpAction: 'continue_next_task',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      phaseTimestamps: {
        inspectStartedAt: '2026-03-07T00:00:00.000Z',
        inspectFinishedAt: '2026-03-07T00:00:10.000Z',
        taskSelectedAt: '2026-03-07T00:00:15.000Z',
        promptGeneratedAt: '2026-03-07T00:00:20.000Z',
        resultCollectedAt: '2026-03-07T00:04:30.000Z',
        verificationFinishedAt: '2026-03-07T00:04:45.000Z',
        classifiedAt: '2026-03-07T00:04:50.000Z'
      },
      summary: 'Selected T1: Previous task | Execution: succeeded | Verification: failed | Outcome: complete | Backlog remaining: 2',
      warnings: [],
      errors: [],
      execution: { exitCode: 0 },
      verification: {
        primaryCommand: 'pytest',
        validationFailureSignature: 'pytest::exit:127::not found',
        verifiers: []
      },
      backlog: {
        remainingTaskCount: 2,
        actionableTaskAvailable: true
      },
      diffSummary: null,
      noProgressSignals: [],
      stopReason: null
    },
    latestSummaryPath: '/workspace/.ralph/artifacts/latest-summary.md',
    latestResultPath: '/workspace/.ralph/artifacts/latest-result.json',
    latestPreflightReportPath: '/workspace/.ralph/artifacts/latest-preflight-report.json',
    latestPreflightSummaryPath: '/workspace/.ralph/artifacts/latest-preflight-summary.md',
    latestPromptPath: '/workspace/.ralph/artifacts/latest-prompt.md',
    latestPromptEvidencePath: '/workspace/.ralph/artifacts/latest-prompt-evidence.json',
    latestExecutionPlanPath: '/workspace/.ralph/artifacts/latest-execution-plan.json',
    latestCliInvocationPath: '/workspace/.ralph/artifacts/latest-cli-invocation.json',
    artifactDir: '/workspace/.ralph/artifacts',
    stateFilePath: '/workspace/.ralph/state.json',
    progressPath: '/workspace/.ralph/progress.md',
    taskFilePath: '/workspace/.ralph/tasks.json',
    promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
    latestExecutionPlan: {
      schemaVersion: 1,
      kind: 'executionPlan',
      iteration: 3,
      selectedTaskId: 'T2',
      selectedTaskTitle: 'Next task',
      promptKind: 'fix-failure',
      promptTarget: 'cliExec',
      selectionReason: 'Prior verification failed.',
      templatePath: '/workspace/prompt-templates/fix-failure.md',
      promptPath: '/workspace/.ralph/prompts/fix-failure-003.prompt.md',
      promptArtifactPath: '/workspace/.ralph/artifacts/iteration-003/prompt.md',
      promptEvidencePath: '/workspace/.ralph/artifacts/iteration-003/prompt-evidence.json',
      promptHash: 'sha256:def456',
      promptByteLength: 2345,
      artifactDir: '/workspace/.ralph/artifacts/iteration-003',
      createdAt: '2026-03-07T00:06:00.000Z'
    },
    latestCliInvocation: {
      schemaVersion: 1,
      kind: 'cliInvocation',
      iteration: 2,
      commandPath: 'codex',
      args: ['exec', '-'],
      workspaceRoot: '/workspace',
      promptArtifactPath: '/workspace/.ralph/artifacts/iteration-002/prompt.md',
      promptHash: 'sha256:abc123',
      promptByteLength: 1234,
      stdinHash: 'sha256:abc123',
      transcriptPath: '/workspace/.ralph/runs/iteration-002.transcript.md',
      lastMessagePath: '/workspace/.ralph/runs/iteration-002.last-message.md',
      createdAt: '2026-03-07T00:05:00.000Z'
    },
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    gitCheckpointMode: 'off',
    validationCommandOverride: null,
    gitStatus: {
      available: false,
      raw: '',
      entries: []
    },
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    ...overrides
  };
}

test('buildStatusReport distinguishes task completion from remaining backlog', () => {
  const report = buildStatusReport(snapshot());

  assert.match(report, /- Outcome: complete \(selected task\)/);
  assert.match(report, /- Backlog remaining: 2/);
  assert.match(report, /- Next actionable task available: yes/);
  assert.match(report, /- Current prompt kind: fix-failure/);
  assert.match(report, /- Last prompt: iteration \(cliExec\)/);
  assert.match(report, /- Payload matched rendered artifact: yes/);
});

test('buildStatusReport shows preflight task-graph diagnostics from schema drift', () => {
  const report = buildStatusReport(snapshot({
    taskFileError: 'Task entry 1 uses unsupported field "dependencies". Use "dependsOn" instead.',
    selectedTask: null,
    preflightReport: {
      ready: false,
      summary: 'Preflight blocked.',
      diagnostics: [
        {
          category: 'taskGraph',
          severity: 'error',
          code: 'unsupported_task_field',
          message: 'Task entry 1 uses unsupported field "dependencies". Use "dependsOn" instead.'
        }
      ]
    }
  }));

  assert.match(report, /unsupported_task_field/);
  assert.match(report, /Use "dependsOn" instead/);
});
