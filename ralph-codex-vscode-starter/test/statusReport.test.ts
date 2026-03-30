import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRootPolicy } from '../src/ralph/rootPolicy';
import { buildStatusReport, RalphStatusSnapshot } from '../src/ralph/statusReport';
import { RalphTaskClaimGraphInspection } from '../src/ralph/taskFile';
import { RalphPromptEvidence } from '../src/ralph/types';

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
const latestPromptEvidence: RalphPromptEvidence = {
  schemaVersion: 1,
  iteration: 3,
  kind: 'fix-failure',
  target: 'cliExec',
  templatePath: '/workspace/prompt-templates/fix-failure.md',
  selectionReason: 'Prior verification failed.',
  selectedTaskId: 'T2',
  taskValidationHint: 'cd nested && npm run validate',
  effectiveValidationCommand: 'npm run validate',
  normalizedValidationCommandFrom: 'cd nested && npm run validate',
  validationCommand: 'npm run validate',
  promptByteLength: 2345,
  promptBudget: {
    policyName: 'fix-failure:cliExec',
    budgetMode: 'trimmed',
    targetTokens: 1800,
    minimumContextBias: 'failure signature, blocker, remediation, validation context',
    estimatedTokens: 1812,
    withinTarget: false,
    budgetDeltaTokens: 12,
    estimatedTokenRange: {
      min: 1595,
      max: 2029
    },
    requiredSections: [
      'strategyContext',
      'preflightContext',
      'objectiveContext',
      'taskContext',
      'operatingRules',
      'executionContract',
      'finalResponseContract'
    ],
    optionalSections: ['runtimeContext', 'repoContext', 'progressContext'],
    omissionOrder: ['runtimeContext', 'repoContext', 'progressContext'],
    selectedSections: [
      'strategyContext',
      'preflightContext',
      'objectiveContext',
      'taskContext',
      'operatingRules',
      'executionContract',
      'finalResponseContract'
    ],
    omittedSections: ['runtimeContext', 'repoContext', 'progressContext']
  },
  inputs: {
    rootPolicy: nestedRootPolicy,
    strategyContext: [],
    preflightContext: [],
    objectiveContext: '# Product / project brief',
    repoContext: [],
    repoContextSnapshot: workspaceScan,
    runtimeContext: [],
    taskContext: [],
    progressContext: [],
    priorIterationContext: [],
    operatingRules: [],
    executionContract: [],
    finalResponseContract: []
  }
};

function snapshot(overrides: Partial<RalphStatusSnapshot> = {}): RalphStatusSnapshot {
  const claimGraph: RalphTaskClaimGraphInspection = {
    claimFile: {
      version: 1,
      claims: [
        {
          taskId: 'T2',
          agentId: 'default',
          provenanceId: 'run-i003-cli-20260307T000600Z',
          claimedAt: '2026-03-07T00:06:00.000Z',
          status: 'active'
        }
      ]
    },
    tasks: [
      {
        taskId: 'T2',
        canonicalClaim: {
          claim: {
            taskId: 'T2',
            agentId: 'default',
            provenanceId: 'run-i003-cli-20260307T000600Z',
            claimedAt: '2026-03-07T00:06:00.000Z',
            status: 'active'
          },
          stale: false
        },
        activeClaims: [
          {
            claim: {
              taskId: 'T2',
              agentId: 'default',
              provenanceId: 'run-i003-cli-20260307T000600Z',
              claimedAt: '2026-03-07T00:06:00.000Z',
              status: 'active'
            },
            stale: false
          }
        ],
        contested: false
      }
    ],
    latestResolvedClaim: null
  };

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
        reasoningEffort: 'medium',
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
      remediation: null,
      completionReportStatus: 'applied',
      reconciliationWarnings: [],
      stopReason: null
    },
    runHistory: [
      {
        iteration: 1,
        mode: 'singleExec',
        promptKind: 'iteration',
        startedAt: '2026-03-06T00:00:00.000Z',
        finishedAt: '2026-03-06T00:03:00.000Z',
        status: 'succeeded',
        exitCode: 0,
        promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
        transcriptPath: '/workspace/.ralph/runs/iteration-001.transcript.md',
        lastMessagePath: '/workspace/.ralph/runs/iteration-001.last-message.md',
        summary: 'Iteration 1 succeeded.'
      },
      {
        iteration: 2,
        mode: 'loop',
        promptKind: 'iteration',
        startedAt: '2026-03-07T00:00:00.000Z',
        finishedAt: '2026-03-07T00:05:00.000Z',
        status: 'succeeded',
        exitCode: 0,
        promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
        transcriptPath: '/workspace/.ralph/runs/iteration-002.transcript.md',
        lastMessagePath: '/workspace/.ralph/runs/iteration-002.last-message.md',
        summary: 'Iteration 2 succeeded.'
      }
    ],
    iterationHistory: [
      {
        ...{
          schemaVersion: 1,
          iteration: 1,
          selectedTaskId: 'T0',
          selectedTaskTitle: 'First task',
          promptKind: 'iteration',
          promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
          artifactDir: '/workspace/.ralph/artifacts/iteration-001',
          adapterUsed: 'cliExec',
          executionIntegrity: null,
          executionStatus: 'succeeded',
          verificationStatus: 'passed',
          completionClassification: 'partial_progress',
          followUpAction: 'continue_same_task',
          startedAt: '2026-03-06T00:00:00.000Z',
          finishedAt: '2026-03-06T00:03:00.000Z',
          phaseTimestamps: {
            inspectStartedAt: '2026-03-06T00:00:00.000Z',
            inspectFinishedAt: '2026-03-06T00:00:10.000Z',
            taskSelectedAt: '2026-03-06T00:00:15.000Z',
            promptGeneratedAt: '2026-03-06T00:00:20.000Z',
            resultCollectedAt: '2026-03-06T00:02:30.000Z',
            verificationFinishedAt: '2026-03-06T00:02:45.000Z',
            classifiedAt: '2026-03-06T00:02:50.000Z'
          },
          summary: 'Selected T0: First task | Execution: succeeded | Verification: passed | Outcome: partial_progress | Backlog remaining: 3',
          warnings: [],
          errors: [],
          execution: {
            exitCode: 0,
            message: 'ok'
          },
          verification: {
            taskValidationHint: null,
            effectiveValidationCommand: null,
            normalizedValidationCommandFrom: null,
            primaryCommand: null,
            validationFailureSignature: null,
            verifiers: []
          },
          backlog: {
            remainingTaskCount: 3,
            actionableTaskAvailable: true
          },
          diffSummary: null,
          noProgressSignals: [],
          remediation: null,
          completionReportStatus: 'applied',
          reconciliationWarnings: [],
          stopReason: null
        }
      },
      {
        schemaVersion: 1,
        iteration: 2,
        selectedTaskId: 'T1',
        selectedTaskTitle: 'Previous task',
        promptKind: 'iteration',
        promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
        artifactDir: '/workspace/.ralph/artifacts/iteration-002',
        adapterUsed: 'cliExec',
        executionIntegrity: null,
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
          message: 'ok'
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
        remediation: null,
        completionReportStatus: 'applied',
        reconciliationWarnings: [],
        stopReason: null
      }
    ],
    latestSummaryPath: '/workspace/.ralph/artifacts/latest-summary.md',
    latestResultPath: '/workspace/.ralph/artifacts/latest-result.json',
    latestPreflightReportPath: '/workspace/.ralph/artifacts/latest-preflight-report.json',
    latestPreflightSummaryPath: '/workspace/.ralph/artifacts/latest-preflight-summary.md',
    latestPromptPath: '/workspace/.ralph/artifacts/latest-prompt.md',
    latestPromptEvidencePath: '/workspace/.ralph/artifacts/latest-prompt-evidence.json',
    latestExecutionPlanPath: '/workspace/.ralph/artifacts/latest-execution-plan.json',
    latestCliInvocationPath: '/workspace/.ralph/artifacts/latest-cli-invocation.json',
    latestRemediationPath: null,
    latestProvenanceBundlePath: '/workspace/.ralph/artifacts/latest-provenance-bundle.json',
    latestProvenanceSummaryPath: '/workspace/.ralph/artifacts/latest-provenance-summary.md',
    latestProvenanceFailurePath: '/workspace/.ralph/artifacts/latest-provenance-failure.json',
    artifactDir: '/workspace/.ralph/artifacts',
    stateFilePath: '/workspace/.ralph/state.json',
    progressPath: '/workspace/.ralph/progress.md',
    taskFilePath: '/workspace/.ralph/tasks.json',
    promptPath: '/workspace/.ralph/prompts/iteration-002.prompt.md',
    latestPromptEvidence,
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
      reasoningEffort: 'medium',
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
    latestRemediation: null,
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
    latestArtifactRepair: {
      repairedLatestArtifactPaths: ['/workspace/.ralph/artifacts/latest-summary.md'],
      staleLatestArtifactPaths: ['/workspace/.ralph/artifacts/latest-provenance-summary.md']
    },
    generatedArtifactRetention: {
      deletedIterationDirectories: [],
      retainedIterationDirectories: ['iteration-003', 'iteration-002', 'iteration-001'],
      protectedRetainedIterationDirectories: ['iteration-001'],
      deletedPromptFiles: [],
      retainedPromptFiles: ['fix-failure-003.prompt.md', 'iteration-002.prompt.md', 'iteration-001.prompt.md'],
      protectedRetainedPromptFiles: ['iteration-001.prompt.md'],
      deletedRunArtifactBaseNames: [],
      retainedRunArtifactBaseNames: ['iteration-003', 'iteration-002', 'iteration-001'],
      protectedRetainedRunArtifactBaseNames: ['iteration-001']
    },
    provenanceBundleRetention: {
      deletedBundleIds: [],
      retainedBundleIds: ['run-i003-ide-20260307T000600Z', 'run-i001-cli-20260306T000000Z'],
      protectedBundleIds: ['run-i001-cli-20260306T000000Z']
    },
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25,
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    gitCheckpointMode: 'off',
    validationCommandOverride: null,
    agentCount: 1,
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
    claimGraph,
    currentProvenanceId: 'run-i003-cli-20260307T000600Z',
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
  assert.match(report, /- Current prompt bytes: 2345/);
  assert.match(report, /- Current prompt budget: fix-failure:cliExec \| trimmed \| target 1800 \| est 1812 \(1595-2029\) \| over target \(\+12\)/);
  assert.match(report, /- Current prompt minimum-context bias: failure signature, blocker, remediation, validation context/);
  assert.match(report, /- Current prompt required sections: strategyContext, preflightContext, objectiveContext, taskContext, operatingRules, executionContract \(\+1 more\)/);
  assert.match(report, /- Current prompt optional sections: runtimeContext, repoContext, progressContext/);
  assert.match(report, /- Current prompt omission order: runtimeContext, repoContext, progressContext/);
  assert.match(report, /- Current prompt selected sections: strategyContext, preflightContext, objectiveContext, taskContext, operatingRules, executionContract \(\+1 more\)/);
  assert.match(report, /- Current prompt omitted sections: runtimeContext, repoContext, progressContext/);
  assert.match(report, /- Current reasoning effort: medium/);
  assert.match(report, /### Agent Health\r?\n- ok/);
  assert.match(report, /- Last prompt: iteration \(cliExec\)/);
  assert.match(report, /- Last execution root: ralph-codex-vscode-starter/);
  assert.match(report, /- Last prompt bytes: 1234/);
  assert.match(report, /- Last reasoning effort: medium/);
  assert.match(report, /- Payload matched rendered artifact: yes/);
  assert.match(report, /- Remediation: none/);
  assert.match(report, /- Remediation action: none/);
  assert.match(report, /- Remediation attempts: none/);
  assert.match(report, /- Remediation human review: none/);
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
  assert.match(report, /- Generated artifacts currently retained: iterations 3, prompts 3, runs 3/);
  assert.match(report, /iteration-001 \(protected\)/);
  assert.match(report, /- Bundle retention on write: keep newest 25 bundles first; then add older protected references without evicting them/);
  assert.match(report, /run-i001-cli-20260306T000000Z \(protected\)/);
  assert.match(report, /## Recent History/);
  assert.match(report, /- Iteration history entries: 2/);
  assert.match(report, /- #2: T1 - Previous task \| succeeded \/ failed \/ complete/);
  assert.match(report, /- Run history entries: 2/);
  assert.match(report, /- #2: loop iteration \| succeeded \| exit 0/);
  assert.match(report, /- Latest artifact repairs this status run: \.ralph\/artifacts\/latest-summary\.md/);
  assert.match(report, /- Latest artifact paths still stale: \.ralph\/artifacts\/latest-provenance-summary\.md/);
  assert.match(report, /Ralph Codex: Reveal Latest Provenance Bundle Directory/);
});

test('buildStatusReport surfaces repeated-task remediation guidance', () => {
  const report = buildStatusReport(snapshot({
    latestRemediationPath: '/workspace/.ralph/artifacts/latest-remediation.json',
    latestRemediation: {
      trigger: 'repeated_no_progress',
      attemptCount: 2,
      action: 'decompose_task',
      humanReviewRecommended: false,
      summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into a smaller deterministic unit before rerunning it.',
      evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes'],
      suggestedChildTasks: [
        {
          id: 'T1.1',
          title: 'Implement prompt evidence',
          parentId: 'T1',
          dependsOn: [],
          validation: 'npm run validate',
          rationale: 'Narrow the first step.'
        },
        {
          id: 'T1.2',
          title: 'Implement verifier reporting',
          parentId: 'T1',
          dependsOn: [{ taskId: 'T1.1', reason: 'blocks_sequence' }],
          validation: 'npm run validate',
          rationale: 'Keep the second step sequenced after T1.1.'
        }
      ]
    },
    lastIteration: {
      ...snapshot().lastIteration!,
      stopReason: 'repeated_no_progress',
      remediation: {
        trigger: 'repeated_no_progress',
        taskId: 'T1',
        attemptCount: 2,
        action: 'decompose_task',
        humanReviewRecommended: false,
        summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into a smaller deterministic unit before rerunning it.',
        evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes']
      }
    }
  }));

  assert.match(report, /- Remediation: Task T1 made no durable progress across 2 consecutive attempts/);
  assert.match(report, /- Remediation action: decompose_task/);
  assert.match(report, /- Remediation attempts: 2/);
  assert.match(report, /- Remediation human review: no/);
  assert.match(report, /- Remediation artifact: \.ralph\/artifacts\/latest-remediation\.json/);
  assert.match(report, /- Remediation proposed child tasks: 2/);
  assert.match(report, /- Proposed child T1\.1: Implement prompt evidence \| depends on none/);
  assert.match(report, /- Proposed child T1\.2: Implement verifier reporting \| depends on T1\.1/);
});

test('buildStatusReport falls back to the latest remediation artifact when last iteration state has none', () => {
  const report = buildStatusReport(snapshot({
    latestRemediationPath: '/workspace/.ralph/artifacts/latest-remediation.json',
    latestRemediation: {
      trigger: 'repeated_identical_failure',
      attemptCount: 3,
      action: 'request_human_review',
      humanReviewRecommended: true,
      summary: 'Task T4 failed in the same way 3 times; request a human review before another retry.',
      evidence: ['same_validation_failure_signature']
    },
    lastIteration: {
      ...snapshot().lastIteration!,
      remediation: null
    }
  }));

  assert.match(report, /- Remediation: Task T4 failed in the same way 3 times/);
  assert.match(report, /- Remediation action: request_human_review/);
  assert.match(report, /- Remediation attempts: 3/);
  assert.match(report, /- Remediation human review: yes/);
});

test('buildStatusReport renders blocked-task remediation guidance from the latest artifact', () => {
  const report = buildStatusReport(snapshot({
    latestRemediationPath: '/workspace/.ralph/artifacts/latest-remediation.json',
    latestRemediation: {
      trigger: 'repeated_identical_failure',
      attemptCount: 2,
      action: 'mark_blocked',
      humanReviewRecommended: true,
      summary: 'Task T6 remained blocked for 2 consecutive iterations; mark it blocked and capture the dependency before retrying.',
      evidence: ['same_task_blocked_repeatedly'],
      suggestedChildTasks: [
        {
          id: 'T6.1',
          title: 'Capture the missing unblocker for T6',
          parentId: 'T6',
          dependsOn: [],
          validation: null,
          rationale: 'Document the external dependency or precondition before retrying T6.'
        }
      ]
    },
    lastIteration: {
      ...snapshot().lastIteration!,
      remediation: null
    }
  }));

  assert.match(report, /- Remediation: Task T6 remained blocked for 2 consecutive iterations/);
  assert.match(report, /- Remediation action: mark_blocked/);
  assert.match(report, /- Remediation attempts: 2/);
  assert.match(report, /- Remediation human review: yes/);
  assert.match(report, /- Remediation artifact: \.ralph\/artifacts\/latest-remediation\.json/);
  assert.match(report, /- Remediation proposed child tasks: 1/);
  assert.match(report, /- Proposed child T6\.1: Capture the missing unblocker for T6 \| depends on none/);
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

test('buildStatusReport shows tracker drift when a done parent still has unfinished descendants', () => {
  const report = buildStatusReport(snapshot({
    taskFileError: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (in_progress), T1.1.1 (blocked).',
    selectedTask: null,
    preflightReport: {
      ready: false,
      summary: 'Preflight blocked.',
      diagnostics: [
        {
          category: 'taskGraph',
          severity: 'error',
          code: 'completed_parent_with_incomplete_descendants',
          message: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (in_progress), T1.1.1 (blocked).'
        }
      ]
    }
  }));

  assert.match(report, /completed_parent_with_incomplete_descendants/);
  assert.match(report, /- Task-ledger drift: Task T1 is marked done but descendant tasks are still unfinished/);
  assert.match(report, /Task T1 is marked done but descendant tasks are still unfinished/);
});

test('buildStatusReport surfaces claim-state diagnostics and current holder summary', () => {
  const report = buildStatusReport(snapshot({
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      activeClaimSummary: 'agent-b: T2 - Next task @ 2026-03-07T00:07:00.000Z (fresh); default: T2 - Next task @ 2026-03-07T00:06:00.000Z (fresh)',
      diagnostics: [
        {
          category: 'claimGraph',
          severity: 'warning',
          code: 'task_claim_contested',
          message: 'Task T2 has contested active claims: default/run-i003-cli-20260307T000600Z, agent-b/run-i999-cli-20260307T000700Z.'
        }
      ]
    },
    claimGraph: {
      claimFile: {
        version: 1,
        claims: [
          {
            taskId: 'T2',
            agentId: 'default',
            provenanceId: 'run-i003-cli-20260307T000600Z',
            claimedAt: '2026-03-07T00:06:00.000Z',
            status: 'active'
          },
          {
            taskId: 'T2',
            agentId: 'agent-b',
            provenanceId: 'run-i999-cli-20260307T000700Z',
            claimedAt: '2026-03-07T00:07:00.000Z',
            status: 'active'
          }
        ]
      },
      tasks: [
        {
          taskId: 'T2',
          canonicalClaim: {
            claim: {
              taskId: 'T2',
              agentId: 'agent-b',
              provenanceId: 'run-i999-cli-20260307T000700Z',
              claimedAt: '2026-03-07T00:07:00.000Z',
              status: 'active'
            },
            stale: false
          },
          activeClaims: [
            {
              claim: {
                taskId: 'T2',
                agentId: 'default',
                provenanceId: 'run-i003-cli-20260307T000600Z',
                claimedAt: '2026-03-07T00:06:00.000Z',
                status: 'active'
              },
              stale: false
            },
            {
              claim: {
                taskId: 'T2',
                agentId: 'agent-b',
                provenanceId: 'run-i999-cli-20260307T000700Z',
                claimedAt: '2026-03-07T00:07:00.000Z',
                status: 'active'
              },
              stale: false
            }
          ],
          contested: true
        }
      ],
      latestResolvedClaim: null
    }
  }));

  assert.match(report, /- Claim holder for current task: agent-b\/run-i999-cli-20260307T000700Z \(contested, different provenance\)/);
  assert.match(report, /- Claim lifecycle: CLI iterations acquire and release durable active claims for the selected task; Prepare Prompt and Open Codex IDE do not create blocking claims\./);
  assert.match(report, /- Claim recovery: Use Ralph Codex: Resolve Stale Task Claim when Show Status reports a stale canonical holder and no codex exec process is active\./);
  assert.match(report, /- Claim state: agent-b: T2 - Next task @ 2026-03-07T00:07:00.000Z \(fresh\); default: T2 - Next task @ 2026-03-07T00:06:00.000Z \(fresh\)/);
  assert.match(report, /- Active claim state: agent-b: T2 - Next task @ 2026-03-07T00:07:00.000Z \(fresh\); default: T2 - Next task @ 2026-03-07T00:06:00.000Z \(fresh\)/);
  assert.match(report, /### Claim Graph/);
  assert.match(report, /task_claim_contested/);
});

test('buildStatusReport groups active claims by agent and shows stale state for multiple agents', () => {
  const report = buildStatusReport(snapshot({
    selectedTask: { id: 'T2', title: 'Next task', status: 'todo' },
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      activeClaimSummary: 'agent-a: T1 - First task @ 2026-03-07T00:01:00.000Z (fresh); agent-b: T2 - Next task @ 2026-03-07T00:02:00.000Z (stale)',
      diagnostics: []
    },
    claimGraph: {
      claimFile: {
        version: 1,
        claims: [
          {
            taskId: 'T1',
            agentId: 'agent-a',
            provenanceId: 'run-i001-cli-20260307T000100Z',
            claimedAt: '2026-03-07T00:01:00.000Z',
            status: 'active'
          },
          {
            taskId: 'T2',
            agentId: 'agent-b',
            provenanceId: 'run-i002-cli-20260307T000200Z',
            claimedAt: '2026-03-07T00:02:00.000Z',
            status: 'active'
          }
        ]
      },
      tasks: [
        {
          taskId: 'T1',
          canonicalClaim: {
            claim: {
              taskId: 'T1',
              agentId: 'agent-a',
              provenanceId: 'run-i001-cli-20260307T000100Z',
              claimedAt: '2026-03-07T00:01:00.000Z',
              status: 'active'
            },
            stale: false
          },
          activeClaims: [
            {
              claim: {
                taskId: 'T1',
                agentId: 'agent-a',
                provenanceId: 'run-i001-cli-20260307T000100Z',
                claimedAt: '2026-03-07T00:01:00.000Z',
                status: 'active'
              },
              stale: false
            }
          ],
          contested: false
        },
        {
          taskId: 'T2',
          canonicalClaim: {
            claim: {
              taskId: 'T2',
              agentId: 'agent-b',
              provenanceId: 'run-i002-cli-20260307T000200Z',
              claimedAt: '2026-03-07T00:02:00.000Z',
              status: 'active'
            },
            stale: true
          },
          activeClaims: [
            {
              claim: {
                taskId: 'T2',
                agentId: 'agent-b',
                provenanceId: 'run-i002-cli-20260307T000200Z',
                claimedAt: '2026-03-07T00:02:00.000Z',
                status: 'active'
              },
              stale: true
            }
          ],
          contested: false
        }
      ],
      latestResolvedClaim: null
    }
  }));

  assert.match(report, /- Claim state: agent-a: T1 - First task @ 2026-03-07T00:01:00.000Z \(fresh\); agent-b: T2 - Next task @ 2026-03-07T00:02:00.000Z \(stale\)/);
  assert.match(report, /- Active claim state: agent-a: T1 - First task @ 2026-03-07T00:01:00.000Z \(fresh\); agent-b: T2 - Next task @ 2026-03-07T00:02:00.000Z \(stale\)/);
});

test('buildStatusReport renders a dedicated Agent Health section from preflight diagnostics', () => {
  const report = buildStatusReport(snapshot({
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: [
        {
          category: 'agentHealth',
          severity: 'warning',
          code: 'stale_state_lock',
          message: 'state.lock is 600s old (threshold 300s). Remove it manually if no iteration is in progress.'
        },
        {
          category: 'agentHealth',
          severity: 'warning',
          code: 'stale_active_claim_agent_offline',
          message: 'Active claim by agent-x on task T5 is 172800s old with no matching state.json run after claim time; agent may be offline.'
        }
      ]
    }
  }));

  assert.match(report, /### Agent Health/);
  assert.match(report, /warning \[stale_state_lock\]/);
  assert.match(report, /warning \[stale_active_claim_agent_offline\]/);
  assert.match(report, /agent may be offline/);
});

test('buildStatusReport surfaces the latest stale-claim resolution details', () => {
  const report = buildStatusReport(snapshot({
    claimGraph: {
      claimFile: {
        version: 1,
        claims: [
          {
            taskId: 'T2',
            agentId: 'default',
            provenanceId: 'run-i003-cli-20260307T000600Z',
            claimedAt: '2026-03-07T00:06:00.000Z',
            status: 'stale',
            resolvedAt: '2026-03-09T00:00:00.000Z',
            resolvedBy: 'operator',
            resolutionReason: 'eligible for operator recovery because the canonical claim was stale from 2026-03-07T00:06:00.000Z and no running codex exec process was detected'
          }
        ]
      },
      tasks: [],
      latestResolvedClaim: {
        claim: {
          taskId: 'T2',
          agentId: 'default',
          provenanceId: 'run-i003-cli-20260307T000600Z',
          claimedAt: '2026-03-07T00:06:00.000Z',
          status: 'stale',
          resolvedAt: '2026-03-09T00:00:00.000Z',
          resolvedBy: 'operator',
          resolutionReason: 'eligible for operator recovery because the canonical claim was stale from 2026-03-07T00:06:00.000Z and no running codex exec process was detected'
        },
        stale: false
      }
    },
    preflightReport: {
      ready: true,
      summary: 'Ready.',
      diagnostics: [
        {
          category: 'claimGraph',
          severity: 'info',
          code: 'stale_claim_resolved',
          message: 'Task T2 claim default/run-i003-cli-20260307T000600Z was marked stale at 2026-03-09T00:00:00.000Z because eligible for operator recovery because the canonical claim was stale from 2026-03-07T00:06:00.000Z and no running codex exec process was detected.'
        }
      ]
    }
  }));

  assert.match(report, /Latest claim resolution: T2 default\/run-i003-cli-20260307T000600Z -> stale at 2026-03-09T00:00:00.000Z because eligible for operator recovery/);
  assert.match(report, /stale_claim_resolved/);
});

test('buildStatusReport keeps replenish-backlog drift exhaustion explicit in loop and latest-iteration sections', () => {
  const report = buildStatusReport(snapshot({
    taskCounts: { todo: 0, in_progress: 0, blocked: 1, done: 1 },
    taskFileError: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (blocked).',
    selectedTask: null,
    lastIteration: {
      ...snapshot().lastIteration!,
      selectedTaskId: null,
      selectedTaskTitle: null,
      promptKind: 'replenish-backlog',
      completionClassification: 'complete',
      followUpAction: 'stop',
      summary: 'Replenishing exhausted Ralph backlog. | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 1',
      backlog: {
        remainingTaskCount: 1,
        actionableTaskAvailable: false
      },
      stopReason: 'no_actionable_task'
    },
    latestPromptEvidence: {
      ...latestPromptEvidence,
      kind: 'replenish-backlog',
      selectionReason: 'The durable Ralph backlog appears exhausted, but task-ledger drift blocks safe task selection first.'
    },
    latestExecutionPlan: {
      ...snapshot().latestExecutionPlan!,
      selectedTaskId: null,
      selectedTaskTitle: null,
      promptKind: 'replenish-backlog',
      selectionReason: 'The durable Ralph backlog appears exhausted, but task-ledger drift blocks safe task selection first.'
    },
    preflightReport: {
      ready: false,
      summary: 'No task selected because task-ledger drift blocks safe selection: Task T1 is marked done but descendant tasks are still unfinished: T1.1 (blocked).',
      diagnostics: [
        {
          category: 'taskGraph',
          severity: 'error',
          code: 'completed_parent_with_incomplete_descendants',
          message: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (blocked).'
        }
      ]
    }
  }));

  assert.match(report, /- Current prompt kind: replenish-backlog/);
  assert.match(report, /- Summary: No task selected because task-ledger drift blocks safe selection/);
  assert.match(report, /- Last task: none/);
  assert.match(report, /- Next actionable task available: no/);
  assert.match(report, /- Stop reason: no_actionable_task/);
  assert.match(report, /- Task-ledger drift: Task T1 is marked done but descendant tasks are still unfinished: T1\.1 \(blocked\)\./);
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
