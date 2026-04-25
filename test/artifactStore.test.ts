import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  cleanupGeneratedArtifacts,
  PROTECTED_GENERATED_LATEST_POINTER_FILES,
  PROTECTED_GENERATED_LATEST_POINTER_REFERENCES,
  PROTECTED_GENERATED_STATE_ROOT_REFERENCES,
  resolveIterationArtifactPaths,
  resolveProvenanceBundlePaths,
  writeProvenanceBundle,
  writeWatchdogDiagnosticArtifact
} from '../src/ralph/artifactStore';
import { deriveRootPolicy } from '../src/ralph/rootPolicy';
import {
  RalphIntegrityFailure,
  RalphPersistedPreflightReport,
  RalphProvenanceBundle
} from '../src/ralph/types';

async function makeArtifactRoot(): Promise<string> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-artifact-store-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  await fs.mkdir(artifactRootDir, { recursive: true });
  return artifactRootDir;
}

async function makeGeneratedArtifactDirs(): Promise<{
  rootPath: string;
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  handoffDir: string;
  stateFilePath: string;
}> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-generated-artifacts-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  const promptDir = path.join(rootPath, '.ralph', 'prompts');
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const handoffDir = path.join(rootPath, '.ralph', 'handoff');
  const stateFilePath = path.join(rootPath, '.ralph', 'state.json');
  await Promise.all([
    fs.mkdir(artifactRootDir, { recursive: true }),
    fs.mkdir(promptDir, { recursive: true }),
    fs.mkdir(runDir, { recursive: true }),
    fs.mkdir(handoffDir, { recursive: true })
  ]);

  return { rootPath, artifactRootDir, promptDir, runDir, handoffDir, stateFilePath };
}

async function seedGeneratedArtifacts(input: {
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  iterations: string[];
}): Promise<void> {
  for (const iteration of input.iterations) {
    const iterationDir = path.join(input.artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'prompt.md'), `prompt ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'prompt-evidence.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8')
    ]);
  }

  await Promise.all(input.iterations.flatMap((iteration) => [
    fs.writeFile(path.join(input.promptDir, `iteration-${iteration}.prompt.md`), `iteration ${iteration}\n`, 'utf8'),
    fs.writeFile(path.join(input.runDir, `iteration-${iteration}.transcript.md`), `transcript ${iteration}\n`, 'utf8'),
    fs.writeFile(path.join(input.runDir, `iteration-${iteration}.last-message.md`), `message ${iteration}\n`, 'utf8')
  ]));
}

function rootPolicy(rootPath: string) {
  return deriveRootPolicy({
    workspaceName: path.basename(rootPath),
    workspaceRootPath: rootPath,
    rootPath,
    rootSelection: {
      workspaceRootPath: rootPath,
      selectedRootPath: rootPath,
      strategy: 'workspaceRoot',
      summary: 'Using the workspace root because it already exposes shallow repo markers.',
      override: null,
      candidates: [
        {
          path: rootPath,
          relativePath: '.',
          markerCount: 1,
          markers: ['package.json']
        }
      ]
    },
    manifests: ['package.json'],
    projectMarkers: ['package.json'],
    packageManagers: ['npm'],
    packageManagerIndicators: ['package.json'],
    ciFiles: [],
    ciCommands: [],
    docs: [],
    sourceRoots: ['src'],
    tests: ['test'],
    lifecycleCommands: ['npm test'],
    validationCommands: ['npm test'],
    testSignals: [],
    notes: [],
    evidence: {
      rootEntries: ['package.json'],
      manifests: { checked: ['package.json'], matches: ['package.json'], emptyReason: null },
      sourceRoots: { checked: ['src'], matches: ['src'], emptyReason: null },
      tests: { checked: ['test'], matches: ['test'], emptyReason: null },
      docs: { checked: ['README.md'], matches: [], emptyReason: 'No docs matched among 1 shallow root checks.' },
      ciFiles: { checked: ['.github/workflows/*.yml'], matches: [], emptyReason: 'No CI files matched among 1 shallow root checks.' },
      packageManagers: { indicators: ['package.json'], detected: ['npm'], packageJsonPackageManager: 'npm', emptyReason: null },
      validationCommands: {
        selected: ['npm test'],
        packageJsonScripts: ['npm test'],
        makeTargets: [],
        justTargets: [],
        ciCommands: [],
        manifestSignals: [],
        emptyReason: null
      },
      lifecycleCommands: {
        selected: ['npm test'],
        packageJsonScripts: ['npm test'],
        makeTargets: [],
        justTargets: [],
        ciCommands: [],
        manifestSignals: [],
        emptyReason: null
      }
    },
    packageJson: {
      name: 'artifact-demo',
      packageManager: 'npm',
      hasWorkspaces: false,
      scriptNames: ['test'],
      lifecycleCommands: ['npm test'],
      validationCommands: ['npm test'],
      testSignals: []
    }
  });
}

function preflightReport(input: {
  provenanceId: string;
  iteration: number;
}): RalphPersistedPreflightReport {
  return {
    schemaVersion: 1,
    kind: 'preflight',
    agentId: 'builder-1',
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    ready: true,
    summary: `Preflight ready for ${input.provenanceId}.`,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task',
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    artifactDir: `/tmp/iteration-${input.iteration}`,
    reportPath: `/tmp/iteration-${input.iteration}/preflight-report.json`,
    summaryPath: `/tmp/iteration-${input.iteration}/preflight-summary.md`,
    blocked: false,
    createdAt: `2026-03-07T00:00:0${input.iteration}.000Z`,
    diagnostics: []
  };
}

function bundle(input: {
  artifactRootDir: string;
  provenanceId: string;
  iteration: number;
  status: RalphProvenanceBundle['status'];
  failure?: RalphIntegrityFailure;
  diagnosticCost?: number | null;
}): Omit<
  RalphProvenanceBundle,
  'executionSummaryPath'
  | 'verifierSummaryPath'
  | 'completionReportStatus'
  | 'reconciliationWarnings'
  | 'completionReportPath'
  | 'epistemicGap'
> {
  const paths = resolveProvenanceBundlePaths(input.artifactRootDir, input.provenanceId);

  return {
    schemaVersion: 1,
    kind: 'provenanceBundle',
    agentId: 'builder-1',
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: input.status,
    summary: `Bundle ${input.provenanceId}`,
    rootPolicy: rootPolicy(path.join(input.artifactRootDir, '..', '..')),
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task',
    artifactDir: `/tmp/iteration-${input.iteration}`,
    bundleDir: paths.directory,
    preflightReportPath: paths.preflightReportPath,
    preflightSummaryPath: paths.preflightSummaryPath,
    promptArtifactPath: paths.promptPath,
    promptEvidencePath: paths.promptEvidencePath,
    executionPlanPath: paths.executionPlanPath,
    executionPlanHash: `sha256:plan-${input.iteration}`,
    cliInvocationPath: input.status === 'executed' ? paths.cliInvocationPath : null,
    iterationResultPath: input.status === 'executed' ? paths.iterationResultPath : null,
    provenanceFailurePath: input.failure ? paths.provenanceFailurePath : null,
    provenanceFailureSummaryPath: input.failure ? paths.provenanceFailureSummaryPath : null,
    promptHash: `sha256:prompt-${input.iteration}`,
    promptByteLength: 100 + input.iteration,
    executionPayloadHash: input.status === 'executed' ? `sha256:payload-${input.iteration}` : null,
    executionPayloadMatched: input.status === 'executed' ? true : null,
    mismatchReason: input.failure?.message ?? null,
    diagnosticCost: input.diagnosticCost ?? null,
    createdAt: `2026-03-07T00:00:0${input.iteration}.000Z`,
    updatedAt: `2026-03-07T00:00:0${input.iteration}.000Z`
  };
}

function failure(input: {
  artifactRootDir: string;
  provenanceId: string;
  iteration: number;
}): RalphIntegrityFailure {
  const paths = resolveProvenanceBundlePaths(input.artifactRootDir, input.provenanceId);

  return {
    schemaVersion: 1,
    kind: 'integrityFailure',
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    stage: 'executionPlanHash',
    blocked: true,
    summary: 'Blocked before launch because executionPlanHash verification failed.',
    message: 'Execution plan hash mismatch.',
    artifactDir: `/tmp/iteration-${input.iteration}`,
    executionPlanPath: paths.executionPlanPath,
    promptArtifactPath: paths.promptPath,
    cliInvocationPath: null,
    expectedExecutionPlanHash: 'sha256:expected',
    actualExecutionPlanHash: 'sha256:actual',
    expectedPromptHash: null,
    actualPromptHash: null,
    expectedPayloadHash: null,
    actualPayloadHash: null,
    createdAt: `2026-03-07T00:00:0${input.iteration}.000Z`
  };
}

test('writeProvenanceBundle keeps protected bundles when automatic retention cleanup runs', async () => {
  const artifactRootDir = await makeArtifactRoot();
  const firstFailure = failure({
    artifactRootDir,
    provenanceId: 'run-i001-cli-20260307T000001Z',
    iteration: 1
  });

  for (const entry of [
    {
      provenanceId: 'run-i001-cli-20260307T000001Z',
      iteration: 1,
      status: 'blocked' as const,
      failure: firstFailure
    },
    {
      provenanceId: 'run-i002-cli-20260307T000002Z',
      iteration: 2,
      status: 'executed' as const
    },
    {
      provenanceId: 'run-i003-cli-20260307T000003Z',
      iteration: 3,
      status: 'executed' as const
    }
  ]) {
    const paths = resolveProvenanceBundlePaths(artifactRootDir, entry.provenanceId);
    await writeProvenanceBundle({
      artifactRootDir,
      paths,
      bundle: bundle({
        artifactRootDir,
        provenanceId: entry.provenanceId,
        iteration: entry.iteration,
        status: entry.status,
        failure: entry.failure
      }),
      preflightReport: preflightReport({
        provenanceId: entry.provenanceId,
        iteration: entry.iteration
      }),
      preflightSummary: `Preflight summary for ${entry.provenanceId}`,
      failure: entry.failure,
      retentionCount: 1
    });
  }

  const runsDir = path.join(artifactRootDir, 'runs');
  const remainingBundleIds = (await fs.readdir(runsDir)).sort();

  assert.deepEqual(remainingBundleIds, [
    'run-i001-cli-20260307T000001Z',
    'run-i003-cli-20260307T000003Z'
  ]);

  const latestBundle = JSON.parse(
    await fs.readFile(path.join(artifactRootDir, 'latest-provenance-bundle.json'), 'utf8')
  ) as { provenanceId: string };
  const latestFailure = JSON.parse(
    await fs.readFile(path.join(artifactRootDir, 'latest-provenance-failure.json'), 'utf8')
  ) as { provenanceId: string };

  assert.equal(latestBundle.provenanceId, 'run-i003-cli-20260307T000003Z');
  assert.equal(latestFailure.provenanceId, 'run-i001-cli-20260307T000001Z');
});

test('writeProvenanceBundle persists completion-report divergence fields and summary details', async () => {
  const artifactRootDir = await makeArtifactRoot();
  const provenanceId = 'run-i004-cli-20260307T000004Z';
  const iteration = 4;
  const iterationPaths = resolveIterationArtifactPaths(artifactRootDir, iteration);
  const paths = resolveProvenanceBundlePaths(artifactRootDir, provenanceId);

  await fs.mkdir(iterationPaths.directory, { recursive: true });
  await fs.writeFile(
    iterationPaths.completionReportPath,
    JSON.stringify({ selectedTaskId: 'T1', requestedStatus: 'blocked' }, null, 2),
    'utf8'
  );

  const result = {
    schemaVersion: 1,
    provenanceId,
    iteration,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task',
    promptKind: 'iteration',
    promptPath: iterationPaths.promptPath,
    artifactDir: iterationPaths.directory,
    adapterUsed: 'cliExec',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    completionClassification: 'blocked',
    followUpAction: 'request_human_review',
    startedAt: '2026-03-07T00:00:04.000Z',
    finishedAt: '2026-03-07T00:01:04.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-03-07T00:00:04.000Z',
      inspectFinishedAt: '2026-03-07T00:00:06.000Z',
      taskSelectedAt: '2026-03-07T00:00:08.000Z',
      promptGeneratedAt: '2026-03-07T00:00:10.000Z',
      executionStartedAt: '2026-03-07T00:00:14.000Z',
      executionFinishedAt: '2026-03-07T00:00:34.000Z',
      resultCollectedAt: '2026-03-07T00:00:40.000Z',
      verificationFinishedAt: '2026-03-07T00:00:54.000Z',
      classifiedAt: '2026-03-07T00:00:58.000Z',
      persistedAt: '2026-03-07T00:01:04.000Z'
    },
    summary: 'Rejected completion report required reconciliation.',
    warnings: [],
    errors: ['Completion report did not match verifier outcome.'],
    execution: {
      exitCode: 0
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
      remainingTaskCount: 1,
      actionableTaskAvailable: true
    },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    completionReportStatus: 'rejected',
    reconciliationWarnings: [
      'Requested done but verifier failed.',
      'Task status left unchanged pending review.'
    ],
    stopReason: 'human_review_needed'
  } satisfies import('../src/ralph/types').RalphIterationResult;

  await writeProvenanceBundle({
    artifactRootDir,
    paths,
    bundle: bundle({
      artifactRootDir,
      provenanceId,
      iteration,
      status: 'executed'
    }),
    preflightReport: preflightReport({ provenanceId, iteration }),
    preflightSummary: `Preflight summary for ${provenanceId}`,
    result
  });

  const persistedBundle = JSON.parse(
    await fs.readFile(paths.bundlePath, 'utf8')
  ) as import('../src/ralph/types').RalphProvenanceBundle;
  const summary = await fs.readFile(paths.summaryPath, 'utf8');
  const epistemicGap = persistedBundle.epistemicGap;

  assert.equal(persistedBundle.completionReportStatus, 'rejected');
  assert.deepEqual(persistedBundle.reconciliationWarnings, [
    'Requested done but verifier failed.',
    'Task status left unchanged pending review.'
  ]);
  assert.equal(persistedBundle.completionReportPath, iterationPaths.completionReportPath);
  assert.equal(persistedBundle.executionSummaryPath, iterationPaths.executionSummaryPath);
  assert.equal(persistedBundle.verifierSummaryPath, iterationPaths.verifierSummaryPath);
  assert.ok(epistemicGap);
  assert.equal(epistemicGap.modelClaimsPath, iterationPaths.completionReportPath);
  assert.equal(epistemicGap.modelClaimsStatus, 'rejected');
  assert.equal(epistemicGap.modelClaimsAreUnverified, true);
  assert.deepEqual(epistemicGap.verifierEvidencePaths, [
    iterationPaths.executionSummaryPath,
    iterationPaths.verifierSummaryPath,
    iterationPaths.iterationResultPath
  ]);
  assert.equal(epistemicGap.verifierEvidenceIsAuthoritative, true);
  assert.match(summary, /## Model Claims/);
  assert.match(summary, /Model self-report status: rejected/);
  assert.match(summary, /Unverified model claim: yes/);
  assert.match(summary, /## Verifier Evidence/);
  assert.match(summary, /verifier-summary\.json/);
  assert.match(summary, /## Epistemic Gap/);
  assert.match(summary, /does not prove: That the model reasoned correctly internally or that its completion report is true without verifier support\./);
});

test('writeProvenanceBundle persists diagnosticCost in the provenance bundle manifest', async () => {
  const artifactRootDir = await makeArtifactRoot();
  const provenanceId = 'run-i007-cli-20260307T000007Z';
  const iteration = 7;
  const paths = resolveProvenanceBundlePaths(artifactRootDir, provenanceId);

  await writeProvenanceBundle({
    artifactRootDir,
    paths,
    bundle: bundle({
      artifactRootDir,
      provenanceId,
      iteration,
      status: 'executed',
      diagnosticCost: 137
    }),
    preflightReport: preflightReport({ provenanceId, iteration }),
    preflightSummary: `Preflight summary for ${provenanceId}`
  });

  const persistedBundle = JSON.parse(
    await fs.readFile(paths.bundlePath, 'utf8')
  ) as import('../src/ralph/types').RalphProvenanceBundle;

  assert.equal(persistedBundle.diagnosticCost, 137);
});

test('artifactStore exposes the protected generated-artifact roots explicitly', () => {
  assert.deepEqual(PROTECTED_GENERATED_STATE_ROOT_REFERENCES, [
    'lastPromptPath',
    'lastRun.promptPath',
    'lastRun.transcriptPath',
    'lastRun.lastMessagePath',
    'lastIteration.artifactDir',
    'lastIteration.promptPath',
    'lastIteration.execution.transcriptPath',
    'lastIteration.execution.lastMessagePath',
    'runHistory[].promptPath',
    'runHistory[].transcriptPath',
    'runHistory[].lastMessagePath',
    'iterationHistory[].artifactDir',
    'iterationHistory[].promptPath',
    'iterationHistory[].execution.transcriptPath',
    'iterationHistory[].execution.lastMessagePath'
  ]);

  assert.deepEqual(PROTECTED_GENERATED_LATEST_POINTER_FILES, [
    'latest-result.json',
    'latest-preflight-report.json',
    'latest-prompt-evidence.json',
    'latest-execution-plan.json',
    'latest-cli-invocation.json',
    'latest-provenance-bundle.json',
    'latest-provenance-failure.json'
  ]);

  assert.deepEqual(PROTECTED_GENERATED_LATEST_POINTER_REFERENCES, {
    'latest-result.json': [
      'artifactDir',
      'summaryPath',
      'promptPath',
      'promptEvidencePath',
      'executionPlanPath',
      'cliInvocationPath',
      'promptArtifactPath',
      'transcriptPath',
      'lastMessagePath'
    ],
    'latest-preflight-report.json': [
      'artifactDir',
      'reportPath',
      'summaryPath'
    ],
    'latest-prompt-evidence.json': [
      'kind+iteration (derived iteration directory and prompt file)'
    ],
    'latest-execution-plan.json': [
      'artifactDir',
      'promptPath',
      'promptArtifactPath',
      'promptEvidencePath',
      'executionPlanPath'
    ],
    'latest-cli-invocation.json': [
      'promptArtifactPath',
      'transcriptPath',
      'lastMessagePath',
      'cliInvocationPath'
    ],
    'latest-provenance-bundle.json': [
      'artifactDir',
      'preflightReportPath',
      'preflightSummaryPath',
      'promptArtifactPath',
      'promptEvidencePath',
      'executionPlanPath',
      'cliInvocationPath',
      'iterationResultPath',
      'provenanceFailurePath',
      'provenanceFailureSummaryPath'
    ],
    'latest-provenance-failure.json': [
      'artifactDir',
      'executionPlanPath',
      'promptArtifactPath',
      'cliInvocationPath',
      'provenanceFailurePath',
      'provenanceFailureSummaryPath'
    ]
  });
});

test('cleanupGeneratedArtifacts preserves each targeted latest/state protected root independently', async (t) => {
  const cases: Array<{
    name: string;
    writeState: (
      stateFilePath: string,
      dirs: { artifactRootDir: string; runDir: string }
    ) => Promise<void>;
    writePointer: (artifactRootDir: string) => Promise<void>;
    expected: {
      retainedIterationDirectories: string[];
      protectedRetainedIterationDirectories: string[];
      retainedPromptFiles: string[];
      protectedRetainedPromptFiles: string[];
      retainedRunArtifactBaseNames: string[];
      protectedRetainedRunArtifactBaseNames: string[];
    };
  }> = [
    {
      name: 'latest prompt evidence protects the implied prompt and iteration dir',
      writeState: async (stateFilePath: string) => {
        await fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8');
      },
      writePointer: async (artifactRootDir: string) => {
        await fs.writeFile(path.join(artifactRootDir, 'latest-prompt-evidence.json'), JSON.stringify({
          kind: 'iteration',
          iteration: 9
        }), 'utf8');
      },
      expected: {
        retainedIterationDirectories: ['iteration-010', 'iteration-009'],
        protectedRetainedIterationDirectories: ['iteration-009'],
        retainedPromptFiles: ['iteration-010.prompt.md', 'iteration-009.prompt.md'],
        protectedRetainedPromptFiles: ['iteration-009.prompt.md'],
        retainedRunArtifactBaseNames: ['iteration-010'],
        protectedRetainedRunArtifactBaseNames: []
      }
    },
    {
      name: 'latest result summary path protects only the iteration dir',
      writeState: async (stateFilePath: string) => {
        await fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8');
      },
      writePointer: async (artifactRootDir: string) => {
        await fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
          summaryPath: path.join(artifactRootDir, 'iteration-009', 'summary.md')
        }), 'utf8');
      },
      expected: {
        retainedIterationDirectories: ['iteration-010', 'iteration-009'],
        protectedRetainedIterationDirectories: ['iteration-009'],
        retainedPromptFiles: ['iteration-010.prompt.md'],
        protectedRetainedPromptFiles: [],
        retainedRunArtifactBaseNames: ['iteration-010'],
        protectedRetainedRunArtifactBaseNames: []
      }
    },
    {
      name: 'latest preflight report path protects only the iteration dir',
      writeState: async (stateFilePath: string) => {
        await fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8');
      },
      writePointer: async (artifactRootDir: string) => {
        await fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
          reportPath: path.join(artifactRootDir, 'iteration-009', 'preflight-report.json')
        }), 'utf8');
      },
      expected: {
        retainedIterationDirectories: ['iteration-010', 'iteration-009'],
        protectedRetainedIterationDirectories: ['iteration-009'],
        retainedPromptFiles: ['iteration-010.prompt.md'],
        protectedRetainedPromptFiles: [],
        retainedRunArtifactBaseNames: ['iteration-010'],
        protectedRetainedRunArtifactBaseNames: []
      }
    },
    {
      name: 'state lastRun transcript path protects only the transcript and last-message pair',
      writeState: async (stateFilePath: string, dirs: { runDir: string }) => {
        await fs.writeFile(stateFilePath, JSON.stringify({
          version: 2,
          lastRun: {
            transcriptPath: path.join(dirs.runDir, 'iteration-009.transcript.md')
          }
        }), 'utf8');
      },
      writePointer: async () => {},
      expected: {
        retainedIterationDirectories: ['iteration-010'],
        protectedRetainedIterationDirectories: [],
        retainedPromptFiles: ['iteration-010.prompt.md'],
        protectedRetainedPromptFiles: [],
        retainedRunArtifactBaseNames: ['iteration-010', 'iteration-009'],
        protectedRetainedRunArtifactBaseNames: ['iteration-009']
      }
    },
    {
      name: 'state lastRun last-message path protects only the transcript and last-message pair',
      writeState: async (stateFilePath: string, dirs: { runDir: string }) => {
        await fs.writeFile(stateFilePath, JSON.stringify({
          version: 2,
          lastRun: {
            lastMessagePath: path.join(dirs.runDir, 'iteration-009.last-message.md')
          }
        }), 'utf8');
      },
      writePointer: async () => {},
      expected: {
        retainedIterationDirectories: ['iteration-010'],
        protectedRetainedIterationDirectories: [],
        retainedPromptFiles: ['iteration-010.prompt.md'],
        protectedRetainedPromptFiles: [],
        retainedRunArtifactBaseNames: ['iteration-010', 'iteration-009'],
        protectedRetainedRunArtifactBaseNames: ['iteration-009']
      }
    },
    {
      name: 'state lastIteration artifact dir protects only the iteration dir',
      writeState: async (stateFilePath: string, dirs: { artifactRootDir: string }) => {
        await fs.writeFile(stateFilePath, JSON.stringify({
          version: 2,
          lastIteration: {
            artifactDir: path.join(dirs.artifactRootDir, 'iteration-009')
          }
        }), 'utf8');
      },
      writePointer: async () => {},
      expected: {
        retainedIterationDirectories: ['iteration-010', 'iteration-009'],
        protectedRetainedIterationDirectories: ['iteration-009'],
        retainedPromptFiles: ['iteration-010.prompt.md'],
        protectedRetainedPromptFiles: [],
        retainedRunArtifactBaseNames: ['iteration-010'],
        protectedRetainedRunArtifactBaseNames: []
      }
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();
      await seedGeneratedArtifacts({
        artifactRootDir,
        promptDir,
        runDir,
        iterations: ['009', '010']
      });
      await testCase.writeState(stateFilePath, { artifactRootDir, runDir });
      await testCase.writePointer(artifactRootDir);

      const retention = await cleanupGeneratedArtifacts({
        artifactRootDir,
        promptDir,
        runDir,
        stateFilePath,
        retentionCount: 1
      });

      assert.deepEqual(retention.deletedIterationDirectories, testCase.expected.retainedIterationDirectories.includes('iteration-009')
        ? []
        : ['iteration-009']);
      assert.deepEqual(retention.retainedIterationDirectories, testCase.expected.retainedIterationDirectories);
      assert.deepEqual(
        retention.protectedRetainedIterationDirectories,
        testCase.expected.protectedRetainedIterationDirectories
      );
      assert.deepEqual(retention.deletedPromptFiles, testCase.expected.retainedPromptFiles.includes('iteration-009.prompt.md')
        ? []
        : ['iteration-009.prompt.md']);
      assert.deepEqual(retention.retainedPromptFiles, testCase.expected.retainedPromptFiles);
      assert.deepEqual(retention.protectedRetainedPromptFiles, testCase.expected.protectedRetainedPromptFiles);
      assert.deepEqual(retention.deletedRunArtifactBaseNames, testCase.expected.retainedRunArtifactBaseNames.includes('iteration-009')
        ? []
        : ['iteration-009']);
      assert.deepEqual(retention.retainedRunArtifactBaseNames, testCase.expected.retainedRunArtifactBaseNames);
      assert.deepEqual(
        retention.protectedRetainedRunArtifactBaseNames,
        testCase.expected.protectedRetainedRunArtifactBaseNames
      );
    });
  }
});

test('cleanupGeneratedArtifacts keeps the newest iteration, prompt, and run artifacts by parsed iteration order', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  await Promise.all([
    fs.mkdir(path.join(artifactRootDir, 'iteration-009'), { recursive: true }),
    fs.mkdir(path.join(artifactRootDir, 'iteration-010'), { recursive: true }),
    fs.mkdir(path.join(artifactRootDir, 'iteration-011'), { recursive: true }),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'continue-progress-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'fix-failure-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'fix-failure-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'fix-failure-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'keep-me.txt'), 'manual note\n', 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 2
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-009']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-009.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-009']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), ['iteration-010', 'iteration-011']);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'continue-progress-010.prompt.md',
    'fix-failure-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'continue-progress-010.last-message.md',
    'continue-progress-010.transcript.md',
    'fix-failure-011.last-message.md',
    'fix-failure-011.transcript.md',
    'keep-me.txt'
  ]);
});

test('cleanupGeneratedArtifacts leaves generated files untouched when automatic cleanup is disabled', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  await Promise.all([
    fs.mkdir(path.join(artifactRootDir, 'iteration-001'), { recursive: true }),
    fs.writeFile(path.join(promptDir, 'iteration-001.prompt.md'), 'iteration 1\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-001.transcript.md'), 'transcript 1\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-001.last-message.md'), 'message 1\n', 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 0
  });

  assert.deepEqual(retention, {
    deletedIterationDirectories: [],
    retainedIterationDirectories: [],
    protectedRetainedIterationDirectories: [],
    deletedPromptFiles: [],
    retainedPromptFiles: [],
    protectedRetainedPromptFiles: [],
    deletedRunArtifactBaseNames: [],
    retainedRunArtifactBaseNames: [],
    protectedRetainedRunArtifactBaseNames: [],
    deletedWatchdogFiles: [],
    retainedWatchdogFiles: []
  });
  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), ['iteration-001']);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), ['iteration-001.prompt.md']);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'iteration-001.last-message.md',
    'iteration-001.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts prunes older handoff files when configured', async () => {
  const { artifactRootDir, promptDir, runDir, handoffDir, stateFilePath } = await makeGeneratedArtifactDirs();

  await Promise.all([
    fs.writeFile(path.join(handoffDir, 'default-008.json'), '{}\n', 'utf8'),
    fs.writeFile(path.join(handoffDir, 'default-009.json'), '{}\n', 'utf8'),
    fs.writeFile(path.join(handoffDir, 'default-010.json'), '{}\n', 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    handoffDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedHandoffFiles, ['default-009.json', 'default-008.json']);
  assert.deepEqual(retention.retainedHandoffFiles, ['default-010.json']);
  assert.deepEqual(await fs.readdir(handoffDir), ['default-010.json']);
});

test('cleanupGeneratedArtifacts keeps latest-linked and state-referenced generated artifacts', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'continue-progress-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'fix-failure-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'fix-failure-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'fix-failure-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      lastPromptPath: path.join(promptDir, 'fix-failure-010.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'fix-failure-010.prompt.md'),
        transcriptPath: path.join(runDir, 'fix-failure-010.transcript.md'),
        lastMessagePath: path.join(runDir, 'fix-failure-010.last-message.md')
      },
      lastIteration: {
        artifactDir: path.join(artifactRootDir, 'iteration-010'),
        promptPath: path.join(promptDir, 'fix-failure-010.prompt.md'),
        execution: {
          transcriptPath: path.join(runDir, 'fix-failure-010.transcript.md'),
          lastMessagePath: path.join(runDir, 'fix-failure-010.last-message.md')
        }
      }
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      summaryPath: path.join(artifactRootDir, 'iteration-010', 'summary.md'),
      promptPath: path.join(promptDir, 'fix-failure-010.prompt.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      reportPath: path.join(artifactRootDir, 'iteration-010', 'preflight-report.json'),
      summaryPath: path.join(artifactRootDir, 'iteration-010', 'preflight-summary.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-execution-plan.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      promptPath: path.join(promptDir, 'fix-failure-010.prompt.md'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-010', 'execution-plan.json')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-009', 'iteration-008']);
  assert.deepEqual(retention.deletedPromptFiles, ['continue-progress-009.prompt.md', 'iteration-008.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['continue-progress-009', 'iteration-008']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-010',
    'iteration-011',
    'latest-execution-plan.json',
    'latest-preflight-report.json',
    'latest-result.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'fix-failure-010.prompt.md',
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'fix-failure-010.last-message.md',
    'fix-failure-010.transcript.md',
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts keeps an older iteration dir when latest provenance failure points only at failure artifacts', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'provenance-failure.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'provenance-failure-summary.md'), `failure ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-provenance-failure.json'), JSON.stringify({
      provenanceFailurePath: path.join(artifactRootDir, 'iteration-010', 'provenance-failure.json'),
      provenanceFailureSummaryPath: path.join(artifactRootDir, 'iteration-010', 'provenance-failure-summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, ['iteration-010']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-010.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-010']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts removes stale latest provenance failure pointer when it references missing artifacts', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  await seedGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    iterations: ['010', '011']
  });
  await Promise.all([
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-provenance-failure.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-009', 'execution-plan.json'),
      promptArtifactPath: path.join(artifactRootDir, 'iteration-009', 'prompt.md'),
      cliInvocationPath: path.join(artifactRootDir, 'iteration-009', 'cli-invocation.json')
    }), 'utf8')
  ]);

  await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  await assert.rejects(
    fs.access(path.join(artifactRootDir, 'latest-provenance-failure.json'))
  );
});

test('cleanupGeneratedArtifacts keeps separately referenced latest result and preflight iterations', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      summaryPath: path.join(artifactRootDir, 'iteration-009', 'summary.md'),
      promptPath: path.join(promptDir, 'iteration-009.prompt.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      reportPath: path.join(artifactRootDir, 'iteration-010', 'preflight-report.json'),
      summaryPath: path.join(artifactRootDir, 'iteration-010', 'preflight-summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.deletedPromptFiles, []);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, []);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-009',
    'iteration-010',
    'iteration-011',
    'latest-preflight-report.json',
    'latest-result.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'iteration-009.prompt.md',
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual(await fs.readdir(runDir), []);
});

test('cleanupGeneratedArtifacts keeps only the iteration dir referenced by the latest preflight report', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-008'),
      reportPath: path.join(artifactRootDir, 'iteration-008', 'preflight-report.json'),
      summaryPath: path.join(artifactRootDir, 'iteration-008', 'preflight-summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-008',
    'iteration-011',
    'latest-preflight-report.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts derives protected iteration dirs from latest summary markdown surfaces', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-summary.md'), '# Ralph Iteration 8\n\nSummary body.\n', 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-summary.md'), '# Ralph Preflight 9\n\nPreflight body.\n', 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-provenance-summary.md'), '# Ralph Provenance run-i010-cli\n\n- Iteration: 10\n', 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md',
    'iteration-008.prompt.md'
  ]);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts derives protected iteration dirs from latest summary artifact-path lines', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'prompt.md'), `prompt ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(
      path.join(artifactRootDir, 'latest-summary.md'),
      [
        '# Ralph Latest Summary',
        '',
        `- Prompt: ${path.join(artifactRootDir, 'iteration-008', 'prompt.md')}`
      ].join('\n'),
      'utf8'
    ),
    fs.writeFile(
      path.join(artifactRootDir, 'latest-preflight-summary.md'),
      [
        '# Ralph Latest Preflight',
        '',
        `- Report: ${path.join(artifactRootDir, 'iteration-009', 'preflight-report.json')}`
      ].join('\n'),
      'utf8'
    ),
    fs.writeFile(
      path.join(artifactRootDir, 'latest-provenance-summary.md'),
      [
        '# Ralph Latest Provenance',
        '',
        `- Iteration artifact dir: ${path.join(artifactRootDir, 'iteration-010')}`
      ].join('\n'),
      'utf8'
    )
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md',
    'iteration-008.prompt.md'
  ]);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts keeps prompt and run files referenced only by latest result', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'continue-progress-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-008'),
      summaryPath: path.join(artifactRootDir, 'iteration-008', 'summary.md'),
      promptPath: path.join(promptDir, 'continue-progress-008.prompt.md'),
      transcriptPath: path.join(runDir, 'continue-progress-008.transcript.md'),
      lastMessagePath: path.join(runDir, 'continue-progress-008.last-message.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, []);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-011.prompt.md',
    'continue-progress-008.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, []);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-011',
    'continue-progress-008'
  ]);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-008',
    'iteration-011',
    'latest-result.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'continue-progress-008.prompt.md',
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'continue-progress-008.last-message.md',
    'continue-progress-008.transcript.md',
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts keeps an iteration dir referenced only by latest result summaryPath', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      summaryPath: path.join(artifactRootDir, 'iteration-008', 'summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts keeps an iteration dir referenced only by the latest preflight summaryPath', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      summaryPath: path.join(artifactRootDir, 'iteration-008', 'preflight-summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts keeps the prompt and iteration referenced by latest prompt evidence', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'prompt-evidence.json'), `{"iteration":"${iteration}"}`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'continue-progress-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-prompt-evidence.json'), JSON.stringify({
      kind: 'continue-progress',
      iteration: 8
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, []);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-011.prompt.md',
    'continue-progress-008.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['continue-progress-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-008',
    'iteration-011',
    'latest-prompt-evidence.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'continue-progress-008.prompt.md',
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts keeps run artifacts referenced only by transcript or last-message paths', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      runHistory: [
        {
          transcriptPath: path.join(runDir, 'iteration-008.transcript.md')
        }
      ]
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-cli-invocation.json'), JSON.stringify({
      lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, [
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.retainedIterationDirectories, ['iteration-011']);
  assert.deepEqual(retention.deletedPromptFiles, [
    'iteration-009.prompt.md',
    'iteration-008.prompt.md'
  ]);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, []);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-011',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedRunArtifactBaseNames, [
    'iteration-009',
    'iteration-008'
  ]);
});

test('cleanupGeneratedArtifacts combines latest summary and preflight dir protection with raw state prompt/run references', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'continue-progress-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'continue-progress-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-011.prompt.md'),
      runHistory: [
        {
          promptPath: path.join(promptDir, 'continue-progress-009.prompt.md'),
          transcriptPath: path.join(runDir, 'continue-progress-009.transcript.md'),
          lastMessagePath: path.join(runDir, 'continue-progress-009.last-message.md')
        }
      ]
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      summaryPath: path.join(artifactRootDir, 'iteration-008', 'summary.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      reportPath: path.join(artifactRootDir, 'iteration-010', 'preflight-report.json'),
      summaryPath: path.join(artifactRootDir, 'iteration-010', 'preflight-summary.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-009']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, [
    'iteration-010',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-010.prompt.md', 'iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-011.prompt.md',
    'continue-progress-009.prompt.md'
  ]);
  assert.deepEqual(retention.protectedRetainedPromptFiles, ['continue-progress-009.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-010', 'iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-011',
    'continue-progress-009'
  ]);
  assert.deepEqual(retention.protectedRetainedRunArtifactBaseNames, ['continue-progress-009']);
});

test('cleanupGeneratedArtifacts unions protected older entries on top of the newest retention window', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['007', '008', '009', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-007.prompt.md'), 'iteration 7\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-007.transcript.md'), 'transcript 7\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-007.last-message.md'), 'message 7\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-007.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'iteration-007.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-007.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-007.last-message.md')
      },
      lastIteration: {
        artifactDir: path.join(artifactRootDir, 'iteration-007'),
        promptPath: path.join(promptDir, 'iteration-007.prompt.md'),
        execution: {
          transcriptPath: path.join(runDir, 'iteration-007.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-007.last-message.md')
        }
      }
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      summaryPath: path.join(artifactRootDir, 'iteration-009', 'summary.md'),
      promptPath: path.join(promptDir, 'iteration-009.prompt.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      reportPath: path.join(artifactRootDir, 'iteration-009', 'preflight-report.json'),
      summaryPath: path.join(artifactRootDir, 'iteration-009', 'preflight-summary.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-execution-plan.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-009', 'execution-plan.json')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-cli-invocation.json'), JSON.stringify({
      promptArtifactPath: path.join(artifactRootDir, 'iteration-009', 'prompt.md'),
      transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
      lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-009',
    'iteration-007'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, [
    'iteration-009',
    'iteration-007'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-011.prompt.md',
    'iteration-009.prompt.md',
    'iteration-007.prompt.md'
  ]);
  assert.deepEqual(retention.protectedRetainedPromptFiles, [
    'iteration-009.prompt.md',
    'iteration-007.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-011',
    'iteration-009',
    'iteration-007'
  ]);
  assert.deepEqual(retention.protectedRetainedRunArtifactBaseNames, [
    'iteration-009',
    'iteration-007'
  ]);
});

test('cleanupGeneratedArtifacts keeps newest entries first when protected older entries also survive retention', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['007', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-007.prompt.md'), 'iteration 7\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-007.transcript.md'), 'transcript 7\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-007.last-message.md'), 'message 7\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-007.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'iteration-007.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-007.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-007.last-message.md')
      },
      lastIteration: {
        artifactDir: path.join(artifactRootDir, 'iteration-007'),
        promptPath: path.join(promptDir, 'iteration-007.prompt.md'),
        execution: {
          transcriptPath: path.join(runDir, 'iteration-007.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-007.last-message.md')
        }
      }
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-010']);
  assert.deepEqual(retention.retainedIterationDirectories, ['iteration-011', 'iteration-007']);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, ['iteration-007']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-010.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md', 'iteration-007.prompt.md']);
  assert.deepEqual(retention.protectedRetainedPromptFiles, ['iteration-007.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-010']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011', 'iteration-007']);
  assert.deepEqual(retention.protectedRetainedRunArtifactBaseNames, ['iteration-007']);
});

test('cleanupGeneratedArtifacts keeps prompts, runs, and iteration dirs referenced by latest execution plan and CLI invocation pointers', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'prompt.md'), `prompt ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-execution-plan.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-009'),
      promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
      promptArtifactPath: path.join(artifactRootDir, 'iteration-009', 'prompt.md'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-009', 'execution-plan.json')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-cli-invocation.json'), JSON.stringify({
      promptArtifactPath: path.join(artifactRootDir, 'iteration-009', 'prompt.md'),
      transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
      lastMessagePath: path.join(runDir, 'iteration-009.last-message.md'),
      cliInvocationPath: path.join(artifactRootDir, 'iteration-009', 'cli-invocation.json')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-010',
    'iteration-009'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009'
  ]);
});

test('cleanupGeneratedArtifacts keeps iteration dirs referenced only by latest preflight, execution-plan, and CLI-invocation artifact paths', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-preflight-report.json'), JSON.stringify({
      reportPath: path.join(artifactRootDir, 'iteration-008', 'preflight-report.json')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-execution-plan.json'), JSON.stringify({
      executionPlanPath: path.join(artifactRootDir, 'iteration-009', 'execution-plan.json')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-cli-invocation.json'), JSON.stringify({
      cliInvocationPath: path.join(artifactRootDir, 'iteration-010', 'cli-invocation.json')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, []);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.protectedRetainedIterationDirectories, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md',
    'iteration-008.prompt.md'
  ]);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);
});

test('cleanupGeneratedArtifacts keeps iterations still referenced by the latest provenance bundle and failure records', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['009', '010', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(iterationDir, 'preflight-report.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'preflight-summary.md'), `preflight ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'prompt.md'), `prompt ${iteration}\n`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'prompt-evidence.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'execution-plan.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'cli-invocation.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'iteration-result.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'provenance-failure.json'), `{"iteration":"${iteration}"}`, 'utf8'),
      fs.writeFile(path.join(iterationDir, 'provenance-failure-summary.md'), `failure ${iteration}\n`, 'utf8')
    ]);
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({ version: 2 }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-provenance-bundle.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      preflightReportPath: path.join(artifactRootDir, 'iteration-010', 'preflight-report.json'),
      preflightSummaryPath: path.join(artifactRootDir, 'iteration-010', 'preflight-summary.md'),
      promptArtifactPath: path.join(artifactRootDir, 'iteration-010', 'prompt.md'),
      promptEvidencePath: path.join(artifactRootDir, 'iteration-010', 'prompt-evidence.json'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-010', 'execution-plan.json'),
      cliInvocationPath: path.join(artifactRootDir, 'iteration-010', 'cli-invocation.json'),
      iterationResultPath: path.join(artifactRootDir, 'iteration-010', 'iteration-result.json'),
      provenanceFailurePath: path.join(artifactRootDir, 'iteration-010', 'provenance-failure.json'),
      provenanceFailureSummaryPath: path.join(artifactRootDir, 'iteration-010', 'provenance-failure-summary.md')
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-provenance-failure.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-010'),
      executionPlanPath: path.join(artifactRootDir, 'iteration-010', 'execution-plan.json'),
      promptArtifactPath: path.join(artifactRootDir, 'iteration-010', 'prompt.md'),
      cliInvocationPath: path.join(artifactRootDir, 'iteration-010', 'cli-invocation.json')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-009']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-011',
    'iteration-010'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-010.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, ['iteration-011.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-010']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, ['iteration-011']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-010',
    'iteration-011',
    'latest-provenance-bundle.json',
    'latest-provenance-failure.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('cleanupGeneratedArtifacts keeps prompts, runs, and iteration dirs referenced only by state history', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-010.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'iteration-010.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-010.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-010.last-message.md')
      },
      runHistory: [
        {
          promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
          transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
        }
      ],
      lastIteration: {
        artifactDir: path.join(artifactRootDir, 'iteration-010'),
        promptPath: path.join(promptDir, 'iteration-010.prompt.md'),
        execution: {
          transcriptPath: path.join(runDir, 'iteration-010.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-010.last-message.md')
        }
      },
      iterationHistory: [
        {
          artifactDir: path.join(artifactRootDir, 'iteration-009'),
          promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
          execution: {
            transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
            lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
          }
        }
      ]
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-010',
    'iteration-009'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009'
  ]);
});

test('cleanupGeneratedArtifacts derives protected iteration references from run-only state history', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-010.prompt.md'),
      runHistory: [
        {
          iteration: 9,
          mode: 'exec',
          promptKind: 'iteration',
          startedAt: '2026-03-01T00:00:00.000Z',
          finishedAt: '2026-03-01T00:01:00.000Z',
          status: 'succeeded',
          exitCode: 0,
          promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
          transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-009.last-message.md'),
          summary: 'iteration 9'
        }
      ]
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-010',
    'iteration-009'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009'
  ]);
});

test('cleanupGeneratedArtifacts derives protected iteration references from a lastRun-only state record', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-010.prompt.md'),
      lastRun: {
        iteration: 9,
        promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
      }
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-010',
    'iteration-009'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009'
  ]);
});

test('cleanupGeneratedArtifacts honors path-only lastRun and runHistory references from raw state', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '009', '010']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-009.prompt.md'), 'iteration 9\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-010.prompt.md'), 'iteration 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.transcript.md'), 'transcript 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-009.last-message.md'), 'message 9\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.transcript.md'), 'transcript 10\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-010.last-message.md'), 'message 10\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-010.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'iteration-010.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-010.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-010.last-message.md')
      },
      runHistory: [
        {
          promptPath: path.join(promptDir, 'iteration-009.prompt.md'),
          transcriptPath: path.join(runDir, 'iteration-009.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-009.last-message.md')
        }
      ]
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, [
    'iteration-009',
    'iteration-008'
  ]);
  assert.deepEqual(retention.retainedIterationDirectories, [
    'iteration-010'
  ]);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.retainedPromptFiles, [
    'iteration-010.prompt.md',
    'iteration-009.prompt.md'
  ]);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);
  assert.deepEqual(retention.retainedRunArtifactBaseNames, [
    'iteration-010',
    'iteration-009'
  ]);
});

test('cleanupGeneratedArtifacts ignores unrelated path-like fields outside the protected latest/state roots', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();

  for (const iteration of ['008', '011']) {
    const iterationDir = path.join(artifactRootDir, `iteration-${iteration}`);
    await fs.mkdir(iterationDir, { recursive: true });
    await fs.writeFile(path.join(iterationDir, 'summary.md'), `summary ${iteration}\n`, 'utf8');
  }

  await Promise.all([
    fs.writeFile(path.join(promptDir, 'iteration-008.prompt.md'), 'iteration 8\n', 'utf8'),
    fs.writeFile(path.join(promptDir, 'iteration-011.prompt.md'), 'iteration 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.transcript.md'), 'transcript 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-008.last-message.md'), 'message 8\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.transcript.md'), 'transcript 11\n', 'utf8'),
    fs.writeFile(path.join(runDir, 'iteration-011.last-message.md'), 'message 11\n', 'utf8'),
    fs.writeFile(stateFilePath, JSON.stringify({
      version: 2,
      lastPromptPath: path.join(promptDir, 'iteration-011.prompt.md'),
      scratchPromptPath: path.join(promptDir, 'iteration-008.prompt.md'),
      lastRun: {
        promptPath: path.join(promptDir, 'iteration-011.prompt.md'),
        transcriptPath: path.join(runDir, 'iteration-011.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-011.last-message.md')
      },
      extraRun: {
        transcriptPath: path.join(runDir, 'iteration-008.transcript.md'),
        lastMessagePath: path.join(runDir, 'iteration-008.last-message.md')
      },
      lastIteration: {
        artifactDir: path.join(artifactRootDir, 'iteration-011'),
        promptPath: path.join(promptDir, 'iteration-011.prompt.md'),
        execution: {
          transcriptPath: path.join(runDir, 'iteration-011.transcript.md'),
          lastMessagePath: path.join(runDir, 'iteration-011.last-message.md')
        },
        scratchArtifactDir: path.join(artifactRootDir, 'iteration-008')
      }
    }), 'utf8'),
    fs.writeFile(path.join(artifactRootDir, 'latest-result.json'), JSON.stringify({
      artifactDir: path.join(artifactRootDir, 'iteration-011'),
      summaryPath: path.join(artifactRootDir, 'iteration-011', 'summary.md'),
      promptPath: path.join(promptDir, 'iteration-011.prompt.md'),
      scratchPromptPath: path.join(promptDir, 'iteration-008.prompt.md')
    }), 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedIterationDirectories, ['iteration-008']);
  assert.deepEqual(retention.deletedPromptFiles, ['iteration-008.prompt.md']);
  assert.deepEqual(retention.deletedRunArtifactBaseNames, ['iteration-008']);

  assert.deepEqual((await fs.readdir(artifactRootDir)).sort(), [
    'iteration-011',
    'latest-result.json'
  ]);
  assert.deepEqual((await fs.readdir(promptDir)).sort(), [
    'iteration-011.prompt.md'
  ]);
  assert.deepEqual((await fs.readdir(runDir)).sort(), [
    'iteration-011.last-message.md',
    'iteration-011.transcript.md'
  ]);
});

test('writeWatchdogDiagnosticArtifact writes expected JSON to watchdog/ subdir', async () => {
  const artifactRootDir = await makeArtifactRoot();
  const actions = [
    {
      taskId: 'T99',
      agentId: 'agent-1',
      action: 'escalate_to_human' as const,
      severity: 'HIGH' as const,
      reason: 'No progress for 3 iterations',
      evidence: 'No files changed',
      trailingNoProgressCount: 3,
      trailingRepeatedFailureCount: 0
    }
  ];

  const filePath = await writeWatchdogDiagnosticArtifact({
    artifactRootDir,
    agentId: 'agent-1',
    provenanceId: 'run-test-provenance',
    iteration: 7,
    actions
  });

  assert.equal(filePath, path.join(artifactRootDir, 'watchdog', 'agent-1-007.json'));
  const contents = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(contents.schemaVersion, 1);
  assert.equal(contents.kind, 'watchdogDiagnostic');
  assert.equal(contents.agentId, 'agent-1');
  assert.equal(contents.provenanceId, 'run-test-provenance');
  assert.equal(contents.iteration, 7);
  assert.equal(contents.actionCount, 1);
  assert.deepEqual(contents.actions, actions);
  assert.ok(typeof contents.triggeredAt === 'string' && contents.triggeredAt.length > 0);
});

test('cleanupGeneratedArtifacts prunes older watchdog files', async () => {
  const { artifactRootDir, promptDir, runDir, stateFilePath } = await makeGeneratedArtifactDirs();
  const watchdogDir = path.join(artifactRootDir, 'watchdog');
  await fs.mkdir(watchdogDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(watchdogDir, 'default-008.json'), '{}', 'utf8'),
    fs.writeFile(path.join(watchdogDir, 'default-009.json'), '{}', 'utf8'),
    fs.writeFile(path.join(watchdogDir, 'default-010.json'), '{}', 'utf8')
  ]);

  const retention = await cleanupGeneratedArtifacts({
    artifactRootDir,
    promptDir,
    runDir,
    stateFilePath,
    retentionCount: 1
  });

  assert.deepEqual(retention.deletedWatchdogFiles, ['default-009.json', 'default-008.json']);
  assert.deepEqual(retention.retainedWatchdogFiles, ['default-010.json']);
  assert.deepEqual(await fs.readdir(watchdogDir), ['default-010.json']);
});
