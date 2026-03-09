import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRootPolicy } from '../src/ralph/rootPolicy';
import { buildStatusReport, RalphStatusSnapshot } from '../src/ralph/statusReport';

const workspaceScan: RalphStatusSnapshot['workspaceScan'] = {
  workspaceName: 'workspace',
  workspaceRootPath: '/workspace',
  rootPath: '/workspace/ralph-codex-vscode-starter',
  rootSelection: {
    workspaceRootPath: '/workspace',
    selectedRootPath: '/workspace/ralph-codex-vscode-starter',
    strategy: 'scoredChild',
    summary: 'Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.',
    override: null,
    candidates: [
      {
        path: '/workspace',
        relativePath: '.',
        markerCount: 0,
        markers: []
      },
      {
        path: '/workspace/ralph-codex-vscode-starter',
        relativePath: 'ralph-codex-vscode-starter',
        markerCount: 4,
        markers: ['package.json', 'README.md', 'src', 'test']
      }
    ]
  },
  manifests: ['package.json'],
  projectMarkers: ['package.json', 'README.md', 'src', 'test'],
  packageManagers: ['npm'],
  packageManagerIndicators: ['package.json'],
  ciFiles: [],
  ciCommands: [],
  docs: ['README.md'],
  sourceRoots: ['src'],
  tests: ['test'],
  lifecycleCommands: ['npm run validate', 'npm run test'],
  validationCommands: ['npm run validate', 'npm run test'],
  testSignals: ['package.json defines a test script.', 'Detected test roots: test.'],
  notes: ['Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.'],
  evidence: {
    rootEntries: ['README.md', 'package.json', 'src', 'test'],
    manifests: {
      checked: ['package.json', '*.sln', '*.csproj'],
      matches: ['package.json'],
      emptyReason: null
    },
    sourceRoots: {
      checked: ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client'],
      matches: ['src'],
      emptyReason: null
    },
    tests: {
      checked: ['test', 'tests', '__tests__', 'spec', 'specs'],
      matches: ['test'],
      emptyReason: null
    },
    docs: {
      checked: ['README.md', 'README', 'docs', 'AGENTS.md'],
      matches: ['README.md'],
      emptyReason: null
    },
    ciFiles: {
      checked: ['.gitlab-ci.yml', 'azure-pipelines.yml', '.github/workflows/*.yml'],
      matches: [],
      emptyReason: 'No CI files matched among 3 shallow root checks.'
    },
    packageManagers: {
      indicators: ['package.json'],
      detected: ['npm'],
      packageJsonPackageManager: 'npm',
      emptyReason: null
    },
    validationCommands: {
      selected: ['npm run validate', 'npm run test'],
      packageJsonScripts: ['npm run validate', 'npm run test'],
      makeTargets: [],
      justTargets: [],
      ciCommands: [],
      manifestSignals: [],
      emptyReason: null
    },
    lifecycleCommands: {
      selected: ['npm run validate', 'npm run test'],
      packageJsonScripts: ['npm run validate', 'npm run test'],
      makeTargets: [],
      justTargets: [],
      ciCommands: [],
      manifestSignals: [],
      emptyReason: null
    }
  },
  packageJson: {
    name: 'nested-demo',
    packageManager: 'npm',
    hasWorkspaces: false,
    scriptNames: ['validate', 'test'],
    lifecycleCommands: ['npm run validate', 'npm run test'],
    validationCommands: ['npm run validate', 'npm run test'],
    testSignals: ['package.json defines a test script.']
  }
};

const nestedRootPolicy = deriveRootPolicy(workspaceScan);

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
        rootPolicy: nestedRootPolicy,
        templatePath: '/workspace/prompt-templates/iteration.md',
        taskValidationHint: 'cd nested && npm run validate',
        effectiveValidationCommand: 'npm run validate',
        normalizedValidationCommandFrom: 'cd nested && npm run validate',
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
      execution: {
        exitCode: 0,
        message: 'codex exec completed successfully.'
      },
      verification: {
        taskValidationHint: 'cd nested && npm run validate',
        effectiveValidationCommand: 'pytest',
        normalizedValidationCommandFrom: null,
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
      completionReportStatus: 'applied',
      reconciliationWarnings: [],
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
    latestProvenanceBundlePath: '/workspace/.ralph/artifacts/latest-provenance-bundle.json',
    latestProvenanceSummaryPath: '/workspace/.ralph/artifacts/latest-provenance-summary.md',
    latestProvenanceFailurePath: '/workspace/.ralph/artifacts/latest-provenance-failure.json',
    artifactDir: '/workspace/.ralph/artifacts',
    stateFilePath: '/workspace/.ralph/state.json',
    progressPath: '/workspace/.ralph/progress.md',
    taskFilePath: '/workspace/.ralph/tasks.json',
    promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
    latestExecutionPlan: {
      schemaVersion: 1,
      kind: 'executionPlan',
      provenanceId: 'run-i003-cli-20260307T000600Z',
      iteration: 3,
      selectedTaskId: 'T2',
      selectedTaskTitle: 'Next task',
      taskValidationHint: 'cd nested && npm run validate',
      effectiveValidationCommand: 'npm run validate',
      normalizedValidationCommandFrom: 'cd nested && npm run validate',
      promptKind: 'fix-failure',
      promptTarget: 'cliExec',
      selectionReason: 'Prior verification failed.',
      rootPolicy: nestedRootPolicy,
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
      provenanceId: 'run-i002-cli-20260307T000000Z',
      iteration: 2,
      commandPath: 'codex',
      args: ['exec', '-'],
      workspaceRoot: '/workspace',
      rootPolicy: nestedRootPolicy,
      promptArtifactPath: '/workspace/.ralph/artifacts/iteration-002/prompt.md',
      promptHash: 'sha256:abc123',
      promptByteLength: 1234,
      stdinHash: 'sha256:abc123',
      transcriptPath: '/workspace/.ralph/runs/iteration-002.transcript.md',
      lastMessagePath: '/workspace/.ralph/runs/iteration-002.last-message.md',
      createdAt: '2026-03-07T00:05:00.000Z'
    },
    latestProvenanceBundle: {
      schemaVersion: 1,
      kind: 'provenanceBundle',
      provenanceId: 'run-i003-ide-20260307T000600Z',
      iteration: 3,
      promptKind: 'fix-failure',
      promptTarget: 'ideHandoff',
      trustLevel: 'preparedPromptOnly',
      status: 'prepared',
      summary: 'Prepared prompt provenance bundle for IDE handoff.',
      rootPolicy: nestedRootPolicy,
      selectedTaskId: 'T2',
      selectedTaskTitle: 'Next task',
      artifactDir: '/workspace/.ralph/artifacts/iteration-003',
      bundleDir: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z',
      preflightReportPath: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z/preflight-report.json',
      preflightSummaryPath: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z/preflight-summary.md',
      promptArtifactPath: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z/prompt.md',
      promptEvidencePath: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z/prompt-evidence.json',
      executionPlanPath: '/workspace/.ralph/artifacts/runs/run-i003-ide-20260307T000600Z/execution-plan.json',
      executionPlanHash: 'sha256:plan123',
      cliInvocationPath: null,
      iterationResultPath: null,
      provenanceFailurePath: null,
      provenanceFailureSummaryPath: null,
      promptHash: 'sha256:def456',
      promptByteLength: 2345,
      executionPayloadHash: null,
      executionPayloadMatched: null,
      mismatchReason: null,
      createdAt: '2026-03-07T00:06:00.000Z',
      updatedAt: '2026-03-07T00:06:00.000Z'
    },
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25,
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    gitCheckpointMode: 'off',
    validationCommandOverride: null,
    workspaceScan,
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
  assert.match(report, /- Execution message: codex exec completed successfully\./);
  assert.match(report, /- Current prompt kind: fix-failure/);
  assert.match(report, /- Last prompt: iteration \(cliExec\)/);
  assert.match(report, /- Last execution root: ralph-codex-vscode-starter/);
  assert.match(report, /- Payload matched rendered artifact: yes/);
  assert.match(report, /## Repo Context/);
  assert.match(report, /- Workspace root: \./);
  assert.match(report, /- Inspected root: ralph-codex-vscode-starter/);
  assert.match(report, /- Execution root: ralph-codex-vscode-starter/);
  assert.match(report, /- Verifier root: ralph-codex-vscode-starter/);
  assert.match(report, /- Test roots: test/);
  assert.match(report, /- Package manager indicators: package\.json/);
  assert.match(report, /- Trust level: prepared prompt only/);
  assert.match(report, /Prepared prompt provenance only; later IDE execution may differ/);
  assert.match(report, /- Generated artifact retention on write: keep newest 25 prompts, runs, and iterations first; then add older protected references without evicting them/);
  assert.match(report, /- Bundle retention on write: keep newest 25 bundles first; then add older protected references without evicting them/);
  assert.match(report, /Ralph Codex: Reveal Latest Provenance Bundle Directory/);
});

test('buildStatusReport shows disabled retention settings explicitly', () => {
  const report = buildStatusReport(snapshot({
    generatedArtifactRetentionCount: 0,
    provenanceBundleRetentionCount: 0
  }));

  assert.match(report, /- Generated artifact retention on write: disabled/);
  assert.match(report, /- Bundle retention on write: disabled/);
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

test('buildStatusReport distinguishes verified CLI execution provenance from prepared-only handoff', () => {
  const report = buildStatusReport(snapshot({
    latestProvenanceBundle: {
      ...snapshot().latestProvenanceBundle!,
      promptTarget: 'cliExec',
      trustLevel: 'verifiedCliExecution',
      status: 'executed',
      summary: 'CLI run completed with verified provenance.'
    }
  }));

  assert.match(report, /- Trust level: verified CLI execution/);
  assert.match(report, /CLI run with plan, prompt artifact, and stdin payload provenance verification/);
});

test('buildStatusReport surfaces inspection-root override state', () => {
  const report = buildStatusReport(snapshot({
    workspaceScan: {
      ...workspaceScan,
      rootSelection: {
        ...workspaceScan.rootSelection,
        strategy: 'manualOverride',
        summary: 'Using manual inspection-root override sibling-repo instead of shallow root scoring.',
        override: {
          requestedPath: 'sibling-repo',
          resolvedPath: '/workspace/sibling-repo',
          status: 'applied',
          summary: 'Using manual inspection-root override sibling-repo instead of shallow root scoring.'
        }
      }
    }
  }));

  assert.match(report, /- Inspection override: sibling-repo \(applied: sibling-repo\)/);
  assert.match(report, /- Root selection: Using manual inspection-root override sibling-repo instead of shallow root scoring\./);
});
