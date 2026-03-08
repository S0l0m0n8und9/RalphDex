import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  resolveProvenanceBundlePaths,
  writeProvenanceBundle
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
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    ready: true,
    summary: `Preflight ready for ${input.provenanceId}.`,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task',
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
}): RalphProvenanceBundle {
  const paths = resolveProvenanceBundlePaths(input.artifactRootDir, input.provenanceId);

  return {
    schemaVersion: 1,
    kind: 'provenanceBundle',
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
