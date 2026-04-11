import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { buildPrompt, choosePromptKind, decidePromptKind, extractStaticPrefix, STATIC_PREFIX_BOUNDARY } from '../src/prompt/promptBuilder';

const snapshotDirectory = path.resolve(__dirname, '../../test/fixtures/snapshots');
const updateSnapshots = process.argv.includes('--updateSnapshot')
  || process.env.npm_config_updatesnapshot !== undefined;
import { RalphPaths } from '../src/ralph/pathResolver';
import { deriveRootPolicy } from '../src/ralph/rootPolicy';
import { RalphIterationResult, RalphWorkspaceState } from '../src/ralph/types';
import { WorkspaceScan } from '../src/services/workspaceInspection';
import { scanWorkspace } from '../src/services/workspaceScanner';

const paths: RalphPaths = {
  rootPath: '/workspace',
  ralphDir: '/workspace/.ralph',
  prdPath: '/workspace/.ralph/prd.md',
  progressPath: '/workspace/.ralph/progress.md',
  taskFilePath: '/workspace/.ralph/tasks.json',
  claimFilePath: '/workspace/.ralph/claims.json',
  stateFilePath: '/workspace/.ralph/state.json',
  handoffDir: '/workspace/.ralph/handoff',
  promptDir: '/workspace/.ralph/prompts',
  runDir: '/workspace/.ralph/runs',
  logDir: '/workspace/.ralph/logs',
  logFilePath: '/workspace/.ralph/logs/extension.log',
  artifactDir: '/workspace/.ralph/artifacts',
  memorySummaryPath: '/workspace/.ralph/memory-summary.md'
};

const validationProvenance = {
  taskValidationHint: 'cd nested && npm run validate',
  effectiveValidationCommand: 'npm run validate',
  normalizedValidationCommandFrom: 'cd nested && npm run validate'
};

const summary: WorkspaceScan = {
  workspaceName: 'demo',
  workspaceRootPath: '/workspace',
  rootPath: '/workspace',
  rootSelection: {
    workspaceRootPath: '/workspace',
    selectedRootPath: '/workspace',
    strategy: 'workspaceRoot',
    summary: 'Using the workspace root because it already exposes shallow repo markers.',
    override: null,
    candidates: [
      {
        path: '/workspace',
        relativePath: '.',
        markerCount: 7,
        markers: ['package.json', 'tsconfig.json', 'README.md', 'docs', 'AGENTS.md', 'src', 'test']
      }
    ]
  },
  manifests: ['package.json', 'tsconfig.json'],
  projectMarkers: ['package.json', 'README.md', 'docs', 'AGENTS.md', 'src', 'test'],
  packageManagers: ['npm'],
  packageManagerIndicators: ['package.json'],
  ciFiles: ['.github/workflows/ci.yml'],
  ciCommands: ['npm test'],
  docs: ['README.md', 'AGENTS.md'],
  sourceRoots: ['src'],
  tests: ['test'],
  lifecycleCommands: ['npm run validate', 'npm run lint', 'npm run test'],
  validationCommands: ['npm run validate', 'npm run test'],
  testSignals: ['package.json defines a test script.'],
  notes: ['Makefile targets detected: validate'],
  evidence: {
    rootEntries: ['.github', 'AGENTS.md', 'README.md', 'docs', 'package.json', 'src', 'test', 'tsconfig.json'],
    manifests: {
      checked: ['package.json', 'tsconfig.json', '*.sln', '*.csproj'],
      matches: ['package.json', 'tsconfig.json'],
      emptyReason: null
    },
    sourceRoots: {
      checked: ['src'],
      matches: ['src'],
      emptyReason: null
    },
    tests: {
      checked: ['test'],
      matches: ['test'],
      emptyReason: null
    },
    docs: {
      checked: ['README.md', 'README', 'docs', 'AGENTS.md'],
      matches: ['README.md', 'AGENTS.md'],
      emptyReason: null
    },
    ciFiles: {
      checked: ['.gitlab-ci.yml', 'azure-pipelines.yml', '.github/workflows/*.yml'],
      matches: ['.github/workflows/ci.yml'],
      emptyReason: null
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
      makeTargets: ['make validate'],
      justTargets: [],
      ciCommands: ['npm test'],
      manifestSignals: [],
      emptyReason: null
    },
    lifecycleCommands: {
      selected: ['npm run validate', 'npm run lint', 'npm run test'],
      packageJsonScripts: ['npm run validate', 'npm run lint', 'npm run test'],
      makeTargets: [],
      justTargets: [],
      ciCommands: [],
      manifestSignals: [],
      emptyReason: null
    }
  },
  packageJson: {
    name: 'demo',
    packageManager: 'npm',
    hasWorkspaces: false,
    scriptNames: ['validate', 'lint', 'test'],
    lifecycleCommands: ['npm run validate', 'npm run lint', 'npm run test'],
    validationCommands: ['npm run validate', 'npm run test'],
    testSignals: ['package.json defines a test script.']
  }
};

function baseIterationResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Ship prompt system',
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    adapterUsed: 'cliExec',
    executionIntegrity: {
      promptTarget: 'cliExec',
      rootPolicy: deriveRootPolicy(summary),
      templatePath: '/workspace/prompt-templates/iteration.md',
      taskValidationHint: validationProvenance.taskValidationHint,
      effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
      normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
      executionPlanPath: '/workspace/.ralph/artifacts/iteration-001/execution-plan.json',
      promptArtifactPath: '/workspace/.ralph/artifacts/iteration-001/prompt.md',
      promptHash: 'sha256:iteration001',
      promptByteLength: 1024,
      executionPayloadHash: 'sha256:iteration001',
      executionPayloadMatched: true,
      mismatchReason: null,
      cliInvocationPath: '/workspace/.ralph/artifacts/iteration-001/cli-invocation.json'
    },
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'partial_progress',
    followUpAction: 'continue_same_task',
    startedAt: '2026-03-07T00:00:00.000Z',
    finishedAt: '2026-03-07T00:05:00.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-03-07T00:00:00.000Z',
      inspectFinishedAt: '2026-03-07T00:00:30.000Z',
      taskSelectedAt: '2026-03-07T00:00:40.000Z',
      promptGeneratedAt: '2026-03-07T00:01:00.000Z',
      executionStartedAt: '2026-03-07T00:01:10.000Z',
      executionFinishedAt: '2026-03-07T00:04:10.000Z',
      resultCollectedAt: '2026-03-07T00:04:20.000Z',
      verificationFinishedAt: '2026-03-07T00:04:40.000Z',
      classifiedAt: '2026-03-07T00:04:50.000Z',
      persistedAt: '2026-03-07T00:05:00.000Z'
    },
    summary: 'Implemented prompt evidence persistence.',
    warnings: [],
    errors: [],
    execution: {
      exitCode: 0,
      transcriptPath: '/workspace/.ralph/runs/iteration-001.transcript.md',
      lastMessagePath: '/workspace/.ralph/runs/iteration-001.last-message.md',
      stdoutPath: '/workspace/.ralph/artifacts/iteration-001/stdout.log',
      stderrPath: '/workspace/.ralph/artifacts/iteration-001/stderr.log'
    },
    verification: {
      taskValidationHint: validationProvenance.taskValidationHint,
      effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
      normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
      primaryCommand: 'npm run validate',
      validationFailureSignature: null,
      verifiers: [
        {
          verifier: 'validationCommand',
          status: 'passed',
          summary: 'Validation command passed.',
          warnings: [],
          errors: []
        },
        {
          verifier: 'gitDiff',
          status: 'passed',
          summary: 'Relevant file changes detected.',
          warnings: [],
          errors: []
        },
        {
          verifier: 'taskState',
          status: 'passed',
          summary: 'Durable Ralph files changed.',
          warnings: [],
          errors: []
        }
      ]
    },
    backlog: {
      remainingTaskCount: 2,
      actionableTaskAvailable: true
    },
    diffSummary: {
      available: true,
      gitAvailable: true,
      summary: 'Detected 2 relevant changed file(s) out of 4 total changes.',
      changedFileCount: 4,
      relevantChangedFileCount: 2,
      changedFiles: ['README.md', 'src/prompt/promptBuilder.ts', '.ralph/progress.md', '.ralph/tasks.json'],
      relevantChangedFiles: ['README.md', 'src/prompt/promptBuilder.ts'],
      statusTransitions: ['README.md: clean -> M', 'src/prompt/promptBuilder.ts: clean -> M'],
      suggestedCheckpointRef: 'ralph/iter-iteration-001'
    },
    noProgressSignals: [],
    remediation: null,
    completionReportStatus: 'applied',
    reconciliationWarnings: [],
    stopReason: null,
    ...overrides
  };
}

function workspaceState(overrides: Partial<RalphWorkspaceState> = {}): RalphWorkspaceState {
  return {
    version: 2,
    objectivePreview: 'Ship better prompts',
    nextIteration: 2,
    lastPromptKind: 'iteration',
    lastPromptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    lastRun: {
      iteration: 1,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
      summary: 'Implemented prompt persistence.'
    },
    runHistory: [],
    lastIteration: baseIterationResult(),
    iterationHistory: [baseIterationResult()],
    updatedAt: '2026-03-07T00:05:00.000Z',
    ...overrides
  };
}

async function createTemplateDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prompt-template-'));
  const template = [
    '{{prompt_title}}',
    '',
    'Selection: {{template_selection_reason}}',
    'Repo:',
    '{{repo_context}}',
    'Strategy:',
    '{{strategy_context}}',
    'Task:',
    '{{task_context}}',
    'Prior:',
    '{{prior_iteration_context}}'
  ].join('\n');

  await Promise.all([
    'bootstrap',
    'iteration',
    'replenish-backlog',
    'fix-failure',
    'continue-progress',
    'human-review-handoff'
  ].map((name) => fs.writeFile(path.join(directory, `${name}.md`), template, 'utf8')));

  return directory;
}

test('decidePromptKind selects specialized prompt kinds deterministically', () => {
  const bootstrapState = workspaceState({
    lastPromptKind: null,
    lastPromptPath: null,
    lastRun: null,
    runHistory: [],
    lastIteration: null,
    iterationHistory: []
  });
  assert.equal(choosePromptKind(bootstrapState, 'cliExec'), 'bootstrap');

  const continued = workspaceState({
    lastIteration: baseIterationResult({
      completionClassification: 'partial_progress'
    })
  });
  assert.equal(decidePromptKind(continued, 'cliExec').kind, 'continue-progress');

  const failed = workspaceState({
    lastIteration: baseIterationResult({
      completionClassification: 'failed',
      verificationStatus: 'failed',
      verification: {
        taskValidationHint: validationProvenance.taskValidationHint,
        effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
        normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
        primaryCommand: 'npm run validate',
        validationFailureSignature: 'sig:validate:1',
        verifiers: []
      }
    })
  });
  assert.equal(decidePromptKind(failed, 'cliExec').kind, 'fix-failure');

  const exhausted = workspaceState({
    lastIteration: baseIterationResult({
      completionClassification: 'complete',
      verificationStatus: 'failed',
      stopReason: 'no_actionable_task',
      verification: {
        taskValidationHint: validationProvenance.taskValidationHint,
        effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
        normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
        primaryCommand: 'npm run validate',
        validationFailureSignature: 'sig:artifact-only-no-task',
        verifiers: []
      }
    })
  });
  assert.equal(decidePromptKind(exhausted, 'cliExec').kind, 'iteration');
  assert.equal(decidePromptKind(exhausted, 'cliExec', {
    selectedTask: null,
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 4 }
  }).kind, 'replenish-backlog');

  const humanReview = workspaceState({
    lastIteration: baseIterationResult({
      completionClassification: 'needs_human_review',
      stopReason: 'human_review_needed'
    })
  });
  assert.equal(decidePromptKind(humanReview, 'ideHandoff').kind, 'human-review-handoff');
  assert.deepEqual(decidePromptKind(humanReview, 'cliExec'), {
    kind: 'human-review-handoff',
    reason: 'The previous iteration requested human review, so the next prompt should preserve that blocker explicitly.'
  });
});

test('buildPrompt renders a file-based template with structured inputs', async () => {
  const templateDir = await createTemplateDir();

  const render = await buildPrompt({
    kind: 'fix-failure',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Previous validation failed.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n- Verifier evidence exists.\n',
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 3
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'failed',
        verificationStatus: 'failed',
        verification: {
          taskValidationHint: validationProvenance.taskValidationHint,
          effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
          normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
          primaryCommand: 'npm run validate',
          validationFailureSignature: 'sig:validate:1',
          verifiers: []
        }
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T0', title: 'Prep', status: 'done' },
        { id: 'T1', title: 'Ship prompt system', status: 'in_progress', dependsOn: ['T0'], notes: 'Keep it deterministic.' },
        { id: 'T1.1', title: 'Persist prompt evidence', status: 'todo', parentId: 'T1', dependsOn: ['T1'] }
      ]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'in_progress',
      dependsOn: ['T0'],
      notes: 'Keep it deterministic.'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.match(render.prompt, /# Ralph Prompt: fix-failure \(cliExec\)/);
  assert.match(render.prompt, /Selection: Previous validation failed\./);
  assert.match(render.prompt, /Repo:/);
  assert.match(render.prompt, /- Test roots: test/);
  assert.match(render.prompt, /- Package manager indicators: package\.json/);
  assert.match(render.prompt, /Target: Codex CLI execution via `codex exec`\./);
  assert.match(render.prompt, /Selected task id: T1/);
  assert.equal(render.evidence.templatePath, path.join(templateDir, 'fix-failure.md'));
  assert.equal(render.evidence.kind, 'fix-failure');
  assert.equal(render.evidence.target, 'cliExec');
  assert.equal(render.evidence.inputs.rootPolicy.executionRootPath, '/workspace');
  assert.equal(render.evidence.inputs.repoContextSnapshot.rootPath, '/workspace');
  assert.deepEqual(render.evidence.inputs.repoContextSnapshot.tests, ['test']);
  assert.equal(typeof render.evidence.promptByteLength, 'number');
  assert.equal(render.evidence.promptBudget?.policyName, 'fix-failure:cliExec');
  assert.ok((render.evidence.promptBudget?.estimatedTokens ?? 0) > 0);
  assert.equal(render.evidence.promptBudget?.withinTarget, true);
  assert.ok((render.evidence.promptBudget?.budgetDeltaTokens ?? Number.POSITIVE_INFINITY) <= 0);
});

test('buildPrompt routes review-agent prompts to the review template and omits implementation sections', async () => {
  const templateDir = await createTemplateDir();
  await fs.writeFile(path.join(templateDir, 'review-agent.md'), await fs.readFile(
    path.join(process.cwd(), 'prompt-templates', 'review-agent.md'),
    'utf8'
  ), 'utf8');

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Run a bounded review pass for the selected task.',
    objectiveText: '# Product / project brief\n\nVerify Ralph changes before implementation continues.',
    progressText: '# Progress\n\n- Review coverage is missing.\n',
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 3
    },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T38.3', title: 'Add review-agent regression coverage', status: 'in_progress' }
      ]
    },
    selectedTask: {
      id: 'T38.3',
      title: 'Add review-agent regression coverage',
      status: 'in_progress',
      notes: 'Review-only pass.'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: 'review'
    }
  });

  assert.equal(render.templatePath, path.join(templateDir, 'review-agent.md'));
  assert.match(render.prompt, /You are Ralph's review agent\./);
  assert.match(render.prompt, /Do not implement fixes in this run\./);
  assert.match(render.prompt, /- Do not make implementation edits; this role reports review findings only\./);
  assert.match(render.prompt, /4\. Do not make code changes\. Emit proposed follow-up tasks in `suggestedChildTasks` instead of editing files or the task ledger\./);
  assert.match(render.prompt, /- Reviewed files or review scope\./);
  assert.doesNotMatch(render.prompt, /Implement the smallest coherent improvement that advances the task\./);
  assert.doesNotMatch(render.prompt, /- Changed files\./);
  assert.equal(render.evidence.templatePath, path.join(templateDir, 'review-agent.md'));
});

test('buildPrompt renders backlog-replenishment instructions when the task list is exhausted', async () => {
  const templateDir = await createTemplateDir();

  const render = await buildPrompt({
    kind: 'replenish-backlog',
    target: 'cliExec',
    iteration: 3,
    selectionReason: 'The durable Ralph backlog is exhausted.',
    objectiveText: '# Product / project brief\n\nKeep Ralph moving without manual task seeding.\n',
    progressText: '# Progress\n\n- Finished the current backlog.\n',
    taskCounts: {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 4
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'complete',
        stopReason: 'no_actionable_task'
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Done task', status: 'done' }
      ]
    },
    selectedTask: null,
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: {
      ready: true,
      summary: 'No blocking preflight errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.match(render.prompt, /# Ralph Prompt: replenish-backlog \(cliExec\)/);
  assert.match(render.prompt, /replenish `\.ralph\/tasks\.json`/);
  assert.match(render.prompt, /The actionable backlog is exhausted\./);
  assert.equal(render.evidence.kind, 'replenish-backlog');
  assert.equal(render.evidence.selectedTaskId, null);
});

test('buildPrompt warns when replenish-backlog context is caused by task-ledger drift', async () => {
  const templateDir = await createTemplateDir();

  const render = await buildPrompt({
    kind: 'replenish-backlog',
    target: 'cliExec',
    iteration: 3,
    selectionReason: 'The durable Ralph backlog appears exhausted, but the task ledger drift must be repaired first.',
    objectiveText: '# Product / project brief\n\nKeep Ralph moving without masking task-ledger drift.\n',
    progressText: '# Progress\n\n- Finished the current backlog.\n',
    taskCounts: {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 4
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'complete',
        stopReason: 'no_actionable_task'
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Completed parent', status: 'done' },
        { id: 'T1.1', title: 'Active child', status: 'in_progress', parentId: 'T1' }
      ]
    },
    selectedTask: null,
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: {
      ready: false,
      summary: 'Preflight blocked.',
      diagnostics: [
        {
          category: 'taskGraph',
          severity: 'error',
          code: 'completed_parent_with_incomplete_descendants',
          message: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (in_progress).'
        }
      ]
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.match(render.prompt, /The task ledger is inconsistent; repair `\.ralph\/tasks\.json` before treating this as clean backlog exhaustion\./);
  assert.match(render.prompt, /The durable task ledger is inconsistent\. Do not treat this as clean backlog exhaustion\./);
  assert.match(render.prompt, /Task-ledger drift: Task T1 is marked done but descendant tasks are still unfinished: T1\.1 \(in_progress\)\./);
  assert.match(render.prompt, /Repair the task-ledger drift in `\.ralph\/tasks\.json` before adding new follow-up tasks\./);
  assert.doesNotMatch(render.prompt, /The actionable backlog is exhausted\./);
});

test('decidePromptKind explains replenish-backlog drift instead of clean exhaustion', () => {
  const decision = decidePromptKind(workspaceState({
    lastPromptKind: 'iteration',
    nextIteration: 3
  }), 'cliExec', {
    selectedTask: null,
    taskCounts: {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 2
    },
    taskInspectionDiagnostics: [
      {
        category: 'taskGraph',
        severity: 'error',
        code: 'completed_parent_with_incomplete_descendants',
        message: 'Task T1 is marked done but descendant tasks are still unfinished: T1.1 (in_progress).'
      }
    ]
  });

  assert.equal(decision.kind, 'replenish-backlog');
  assert.match(decision.reason, /task-ledger drift blocks safe task selection first/);
  assert.match(decision.reason, /Task T1 is marked done but descendant tasks are still unfinished/);
});

test('buildPrompt uses real scan results from a nested repo instead of rendering empty repo context', async () => {
  const templateDir = await createTemplateDir();
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prompt-scan-parent-'));
  const repoRoot = path.join(workspaceRoot, 'ralph-codex-vscode-starter');

  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'test'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'docs'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'AGENTS.md'), '# agents\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'README.md'), '# demo\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'tsconfig.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
    name: 'demo',
    scripts: {
      validate: 'npm run lint && npm run test',
      lint: 'tsc --noEmit',
      test: 'node --test'
    }
  }, null, 2), 'utf8');

  const scannedSummary = await scanWorkspace(workspaceRoot, 'workspace');

  const render = await buildPrompt({
    kind: 'bootstrap',
    target: 'cliExec',
    iteration: 1,
    selectionReason: 'No prior prompt exists.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\nNone.\n',
    taskCounts: {
      todo: 1,
      in_progress: 0,
      blocked: 0,
      done: 0
    },
    summary: scannedSummary,
    state: workspaceState({
      lastPromptKind: null,
      lastPromptPath: null,
      lastRun: null,
      runHistory: [],
      lastIteration: null,
      iterationHistory: []
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Ship prompt system', status: 'todo' }]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'todo'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.equal(scannedSummary.rootPath, repoRoot);
  assert.equal(scannedSummary.rootSelection.strategy, 'scoredChild');
  assert.match(render.prompt, /- Root selection: Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers\./);
  assert.match(render.prompt, new RegExp(`- Inspected root: ${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(render.prompt, new RegExp(`- Workspace root: ${workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(render.prompt, new RegExp(`- Execution root: ${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(render.prompt, new RegExp(`- Verifier root: ${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(render.prompt, /- Manifests: package\.json, tsconfig\.json/);
  assert.match(render.prompt, /- Source roots: src/);
  assert.match(render.prompt, /- Test roots: test/);
  assert.match(render.prompt, /- Docs: README\.md, docs, AGENTS\.md/);
  assert.match(render.prompt, /- Package managers: npm/);
  assert.match(render.prompt, /- package\.json name: demo/);
  assert.match(render.prompt, /- Validation commands: npm run validate, npm run lint, npm run test/);
  assert.doesNotMatch(render.prompt, /- Manifests: none/);
  assert.doesNotMatch(render.prompt, /- Source roots: none/);
  assert.doesNotMatch(render.prompt, /- Test roots: none/);
  assert.equal(render.evidence.inputs.repoContextSnapshot.rootPath, repoRoot);
  assert.equal(render.evidence.inputs.repoContextSnapshot.workspaceRootPath, workspaceRoot);
  assert.equal(render.evidence.inputs.repoContextSnapshot.rootSelection.selectedRootPath, repoRoot);
  assert.equal(render.evidence.inputs.repoContextSnapshot.rootSelection.strategy, 'scoredChild');
  assert.equal(render.evidence.inputs.rootPolicy.workspaceRootPath, workspaceRoot);
  assert.equal(render.evidence.inputs.rootPolicy.executionRootPath, repoRoot);
  assert.equal(render.evidence.inputs.rootPolicy.verificationRootPath, repoRoot);
});

test('buildPrompt trims prior verifier context to the configured budget', async () => {
  const templateDir = await createTemplateDir();
  const lastIteration = baseIterationResult({
    completionClassification: 'failed',
    verificationStatus: 'failed',
    verification: {
      taskValidationHint: validationProvenance.taskValidationHint,
      effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
      normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
      primaryCommand: 'npm run validate',
      validationFailureSignature: 'sig:validate:1',
      verifiers: [
        {
          verifier: 'validationCommand',
          status: 'failed',
          summary: 'Validation failed.',
          warnings: [],
          errors: ['exit 1']
        }
      ]
    },
    noProgressSignals: ['task-state-unchanged', 'no-relevant-diff'],
    diffSummary: {
      available: true,
      gitAvailable: true,
      summary: 'Detected 5 relevant changed file(s).',
      changedFileCount: 5,
      relevantChangedFileCount: 5,
      changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
      relevantChangedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
      statusTransitions: [],
      suggestedCheckpointRef: 'ralph/iter-002'
    }
  });

  const render = await buildPrompt({
    kind: 'fix-failure',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Use prior verifier output.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Existing state.',
    taskCounts: {
      todo: 1,
      in_progress: 1,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Ship prompt system', status: 'in_progress' }
      ]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'in_progress'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 4
    }
  });

  assert.equal(render.evidence.inputs.priorIterationContext.length, 4);
  assert.match(render.evidence.inputs.priorIterationContext.join('\n'), /sig:validate:1|Additional prior-context signals omitted/);
});

test('buildPrompt includes prior remediation guidance when present', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'fix-failure',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Previous attempts stalled.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: {
      todo: 1,
      in_progress: 0,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'no_progress',
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
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Ship prompt system', status: 'todo' }]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'todo'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 12
    }
  });

  assert.match(render.prompt, /Prior remediation: Task T1 made no durable progress across 2 consecutive attempts/);
});

test('buildPrompt omits unrelated prior-iteration signals for the selected task', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'continue-progress',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Continue task-focused work.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: {
      todo: 1,
      in_progress: 1,
      blocked: 0,
      done: 2
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'partial_progress',
        summary: 'Updated docs for an unrelated onboarding task.',
        remediation: {
          trigger: 'repeated_no_progress',
          taskId: 'T99',
          attemptCount: 2,
          action: 'request_human_review',
          humanReviewRecommended: true,
          summary: 'Task T99 stalled in a separate onboarding workflow.',
          evidence: ['unrelated']
        },
        verificationStatus: 'failed',
        verification: {
          taskValidationHint: validationProvenance.taskValidationHint,
          effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
          normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
          primaryCommand: 'npm run validate',
          validationFailureSignature: 'sig:onboarding:1',
          verifiers: [
            {
              verifier: 'validationCommand',
              status: 'failed',
              summary: 'Unrelated docs validation failed.',
              warnings: [],
              errors: ['docs drift']
            }
          ]
        },
        diffSummary: {
          available: true,
          gitAvailable: true,
          summary: 'Updated onboarding docs only.',
          changedFileCount: 2,
          relevantChangedFileCount: 1,
          changedFiles: ['docs/onboarding.md', 'README.md'],
          relevantChangedFiles: ['docs/onboarding.md'],
          statusTransitions: ['docs/onboarding.md: clean -> M'],
          suggestedCheckpointRef: 'ralph/iter-iteration-001'
        }
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Ship prompt system', status: 'in_progress' }]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'in_progress'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 10
    }
  });

  const priorContext = render.evidence.inputs.priorIterationContext.join('\n');
  assert.doesNotMatch(priorContext, /Task T99 stalled/);
  assert.doesNotMatch(priorContext, /sig:onboarding:1/);
  assert.doesNotMatch(priorContext, /Prior diff summary: Updated onboarding docs only/);
  assert.match(priorContext, /Prior outcome classification: partial_progress/);
  assert.match(priorContext, /Prior summary: Updated docs for an unrelated onboarding task\./);
});

test('buildPrompt keeps source roots for prompt-focused code tasks while staying task-aware', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'continue-progress',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Continue prompt-builder implementation work.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: {
      todo: 1,
      in_progress: 1,
      blocked: 0,
      done: 2
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'partial_progress',
        summary: 'Updated prompt-builder budgeting heuristics.'
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T22', title: 'Add token-budgeted prompt and context generation', status: 'in_progress' }]
    },
    selectedTask: {
      id: 'T22',
      title: 'Add token-budgeted prompt and context generation for Ralph CLI and IDE handoff flows',
      status: 'in_progress',
      notes: 'Keep the prompt-builder repo context task-aware.'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  const repoContext = render.evidence.inputs.repoContext.join('\n');
  assert.match(repoContext, /- Source roots: src/);
  assert.match(repoContext, /- Docs: README\.md, AGENTS\.md/);
  assert.match(repoContext, /- Validation commands: npm run validate, npm run test/);
});

test('buildPrompt omits irrelevant repo inventory for docs-focused CLI tasks', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'continue-progress',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Continue workflow documentation updates.',
    objectiveText: '# Product / project brief\n\nDocument the operator workflow clearly.',
    progressText: '# Progress\n\n- Workflow docs need another pass.\n',
    taskCounts: {
      todo: 1,
      in_progress: 1,
      blocked: 0,
      done: 2
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'partial_progress',
        summary: 'Updated workflow documentation headings.'
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T5', title: 'Document IDE handoff workflow', status: 'in_progress' }]
    },
    selectedTask: {
      id: 'T5',
      title: 'Document IDE handoff workflow',
      status: 'in_progress',
      notes: 'Keep the workflow guide concise for operators.'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  const repoContext = render.evidence.inputs.repoContext.join('\n');
  assert.match(repoContext, /- Docs: README\.md, AGENTS\.md/);
  assert.doesNotMatch(repoContext, /- Source roots:/);
  assert.doesNotMatch(repoContext, /- Test roots:/);
  assert.doesNotMatch(repoContext, /- Validation commands:/);
  assert.doesNotMatch(repoContext, /- Package managers:/);
  assert.doesNotMatch(repoContext, /- Package manager indicators:/);
});

test('buildPrompt keeps task-relevant prior validation and remediation signals near the top of the context', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'fix-failure',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Repair the failed validation path.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: {
      todo: 1,
      in_progress: 0,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'failed',
        verificationStatus: 'failed',
        stopReason: 'execution_failed',
        summary: 'Validation failed while updating the prompt builder.',
        remediation: {
          trigger: 'repeated_identical_failure',
          taskId: 'T1',
          attemptCount: 2,
          action: 'decompose_task',
          humanReviewRecommended: false,
          summary: 'Task T1 kept failing the validation path; isolate the prompt builder regression.',
          evidence: ['same_failure_signature']
        },
        verification: {
          taskValidationHint: validationProvenance.taskValidationHint,
          effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
          normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
          primaryCommand: 'npm run validate',
          validationFailureSignature: 'sig:validate:prompt-builder',
          verifiers: [
            {
              verifier: 'validationCommand',
              status: 'failed',
              summary: 'Validation failed.',
              warnings: [],
              errors: ['promptBuilder regression']
            }
          ]
        }
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Validate prompt builder regression', status: 'todo' }]
    },
    selectedTask: {
      id: 'T1',
      title: 'Validate prompt builder regression',
      status: 'todo'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 7
    }
  });

  assert.deepEqual(render.evidence.inputs.priorIterationContext.slice(0, 6), [
    '- Prior iteration: 1',
    '- Prior outcome classification: failed',
    '- Prior execution / verification: succeeded / failed',
    '- Prior remediation: Task T1 kept failing the validation path; isolate the prompt builder regression.',
    '- Prior validation failure signature: sig:validate:prompt-builder',
    '- Additional prior-context signals omitted: 6.'
  ]);
});

test('buildPrompt prepends session handoff context ahead of prior iteration evidence', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Resume from the latest clean handoff.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: {
      todo: 1,
      in_progress: 0,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        summary: 'Prior iteration completed with a handoff note.'
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Resume the selected task', status: 'todo' }]
    },
    selectedTask: {
      id: 'T1',
      title: 'Resume the selected task',
      status: 'todo'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: []
    },
    sessionHandoff: {
      agentId: 'default',
      iteration: 1,
      selectedTaskId: 'T1',
      selectedTaskTitle: 'Resume the selected task',
      stopReason: 'iteration_cap_reached',
      completionClassification: 'partial_progress',
      humanSummary: 'T1 (Resume the selected task) stopped with iteration_cap_reached. Keep going.',
      pendingBlocker: 'Waiting on follow-up validation.',
      validationFailureSignature: 'sig:validate:resume',
      remainingTaskCount: 3
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.deepEqual(render.evidence.inputs.priorIterationContext.slice(0, 5), [
    '### Session Handoff',
    '- Handoff summary: T1 (Resume the selected task) stopped with iteration_cap_reached. Keep going.',
    '- Handoff blocker: Waiting on follow-up validation.',
    '- Handoff validation failure signature: sig:validate:resume',
    '- Remaining task count at handoff: 3'
  ]);
  assert.match(render.prompt, /Prior:\n### Session Handoff/);
});

test('buildPrompt records the prompt-budget matrix for each prompt kind and target', async () => {
  const templateDir = await createTemplateDir();
  const expectedPolicies = [
    ['bootstrap', 'cliExec', 'bootstrap:cliExec', 2100, 'broad objective, expanded repo scan, standard runtime pointers', ['priorIterationContext']],
    ['bootstrap', 'ideHandoff', 'bootstrap:ideHandoff', 1500, 'broad objective, lighter runtime and repo detail for human review', ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']],
    ['iteration', 'cliExec', 'iteration:cliExec', 1600, 'selected task plus compact repo/runtime context', ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']],
    ['iteration', 'ideHandoff', 'iteration:ideHandoff', 1000, 'selected task plus compact review-oriented context', ['runtimeContext', 'repoContext', 'priorIterationContext', 'progressContext']],
    ['continue-progress', 'cliExec', 'continue-progress:cliExec', 1600, 'selected task plus compact recent progress and prior iteration state', ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']],
    ['continue-progress', 'ideHandoff', 'continue-progress:ideHandoff', 1000, 'selected task plus compact carry-forward state for human review', ['runtimeContext', 'repoContext', 'priorIterationContext', 'progressContext']],
    ['fix-failure', 'cliExec', 'fix-failure:cliExec', 1700, 'failure signature, blocker, remediation, validation context', ['runtimeContext', 'repoContext', 'progressContext']],
    ['fix-failure', 'ideHandoff', 'fix-failure:ideHandoff', 1100, 'failure signature and blocker summary for manual inspection', ['runtimeContext', 'repoContext', 'progressContext']],
    ['human-review-handoff', 'cliExec', 'human-review-handoff:cliExec', 1500, 'blocker, remediation, and current task state over broad history', ['runtimeContext', 'repoContext', 'progressContext']],
    ['human-review-handoff', 'ideHandoff', 'human-review-handoff:ideHandoff', 1100, 'blocker and review decision points over broad history', ['runtimeContext', 'repoContext', 'progressContext']],
    ['replenish-backlog', 'cliExec', 'replenish-backlog:cliExec', 1800, 'PRD, backlog counts, and expanded repo/runtime context for task generation', ['priorIterationContext']],
    ['replenish-backlog', 'ideHandoff', 'replenish-backlog:ideHandoff', 1300, 'PRD, backlog counts, and explicit next-task generation context', ['priorIterationContext']]
  ] as const;

  for (const [kind, target, policyName, targetTokens, minimumContextBias, optionalSections] of expectedPolicies) {
    const render = await buildPrompt({
      kind,
      target,
      iteration: 2,
      selectionReason: `Policy check for ${policyName}.`,
      objectiveText: '# Product / project brief\n\nShip prompt-budgeted context deterministically.\n',
      progressText: '# Progress\n\n- Prompt budgets are recorded in evidence.\n',
      taskCounts: {
        todo: 2,
        in_progress: 1,
        blocked: 0,
        done: 3
      },
      summary,
      state: workspaceState(),
      paths,
      taskFile: {
        version: 2,
        tasks: [
          { id: 'T22', title: 'Define prompt-budget policy', status: kind === 'replenish-backlog' ? 'done' : 'in_progress' }
        ]
      },
      selectedTask: kind === 'replenish-backlog'
        ? null
        : {
            id: 'T22',
            title: 'Define prompt-budget policy',
            status: 'in_progress'
          },
      taskValidationHint: validationProvenance.taskValidationHint,
      effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
      normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
      validationCommand: 'npm run validate',
      preflightReport: {
        ready: true,
        summary: 'Preflight completed without blocking errors.',
        diagnostics: []
      },
      config: {
        promptTemplateDirectory: templateDir,
        promptIncludeVerifierFeedback: true,
        promptPriorContextBudget: 8
      }
    });

    assert.equal(render.evidence.promptBudget?.policyName, policyName);
    assert.equal(render.evidence.promptBudget?.targetTokens, targetTokens);
    assert.equal(render.evidence.promptBudget?.minimumContextBias, minimumContextBias);
    assert.deepEqual(render.evidence.promptBudget?.requiredSections, [
      'strategyContext',
      'preflightContext',
      'objectiveContext',
      'taskContext',
      'operatingRules',
      'executionContract',
      'finalResponseContract'
    ]);
    assert.deepEqual(render.evidence.promptBudget?.optionalSections, optionalSections);
    assert.deepEqual(render.evidence.promptBudget?.omissionOrder, optionalSections);
  }
});

test('buildPrompt selects the Claude prompt-budget profile instead of the codex baseline when configured', async () => {
  const templateDir = await createTemplateDir();
  const baseInput = {
    kind: 'iteration' as const,
    target: 'cliExec' as const,
    iteration: 2,
    selectionReason: 'Profile selection check.',
    objectiveText: '# Product / project brief\n\nShip prompt-budgeted context deterministically.\n',
    progressText: '# Progress\n\n- Prompt budgets are recorded in evidence.\n',
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 3
    },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2 as const,
      tasks: [
        { id: 'T22', title: 'Define prompt-budget policy', status: 'in_progress' as const }
      ]
    },
    selectedTask: {
      id: 'T22',
      title: 'Define prompt-budget policy',
      status: 'in_progress' as const
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    }
  };

  const codexRender = await buildPrompt({
    ...baseInput,
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      promptBudgetProfile: 'codex'
    }
  });

  const claudeRender = await buildPrompt({
    ...baseInput,
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      promptBudgetProfile: 'claude'
    }
  });

  assert.equal(codexRender.evidence.promptBudget?.policyName, 'iteration:cliExec');
  assert.equal(codexRender.evidence.promptBudget?.targetTokens, 1600);
  assert.equal(claudeRender.evidence.promptBudget?.policyName, 'claude/iteration:cliExec');
  assert.equal(claudeRender.evidence.promptBudget?.targetTokens, 2400);
  assert.notEqual(claudeRender.evidence.promptBudget?.targetTokens, codexRender.evidence.promptBudget?.targetTokens);
});

test('buildPrompt omits lower-priority sections when the prompt budget would otherwise be exceeded', async () => {
  const templateDir = await createTemplateDir();
  const largeParagraph = 'Budget pressure evidence. '.repeat(120);
  const render = await buildPrompt({
    kind: 'continue-progress',
    target: 'ideHandoff',
    iteration: 2,
    selectionReason: 'Continue with a compact IDE handoff.',
    objectiveText: `# Product / project brief\n\n${largeParagraph}\n${largeParagraph}\n${largeParagraph}`,
    progressText: `# Progress\n\n- ${largeParagraph}\n- ${largeParagraph}\n- ${largeParagraph}`,
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'partial_progress',
        summary: largeParagraph
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Ship prompt system', status: 'in_progress', notes: largeParagraph }
      ]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'in_progress',
      notes: largeParagraph
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.equal(render.evidence.promptBudget?.policyName, 'continue-progress:ideHandoff');
  assert.equal(render.evidence.promptBudget?.budgetMode, 'trimmed');
  assert.equal(render.evidence.promptBudget?.withinTarget, false);
  assert.ok((render.evidence.promptBudget?.budgetDeltaTokens ?? 0) > 0);
  assert.ok((render.evidence.promptBudget?.omittedSections.length ?? 0) > 0);
  assert.match(render.prompt, /Omitted by prompt budget policy/);
});

test('buildPrompt can omit progress context for oversized continue-progress CLI prompts', async () => {
  const templateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prompt-budget-template-'));
  const fullTemplate = [
    '{{prompt_title}}',
    '',
    'Selection: {{template_selection_reason}}',
    'Strategy:',
    '{{strategy_context}}',
    'Preflight:',
    '{{preflight_context}}',
    'Objective:',
    '{{objective_context}}',
    'Repo:',
    '{{repo_context}}',
    'Runtime:',
    '{{runtime_context}}',
    'Task:',
    '{{task_context}}',
    'Progress:',
    '{{progress_context}}',
    'Prior:',
    '{{prior_iteration_context}}',
    'Rules:',
    '{{operating_rules}}',
    'Exec:',
    '{{execution_contract}}',
    'Final:',
    '{{final_response_contract}}'
  ].join('\n');
  await fs.writeFile(path.join(templateDir, 'continue-progress.md'), fullTemplate, 'utf8');
  const largeParagraph = 'Progress budget pressure evidence. '.repeat(220);
  const priorHeavySummary = 'Prior iteration detail that still matters for the current task. '.repeat(45);
  const largeObjective = 'Objective detail that still matters for the delivery goal. '.repeat(80);
  const render = await buildPrompt({
    kind: 'continue-progress',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Continue from partial progress without overrunning the CLI prompt budget.',
    objectiveText: `# Product / project brief\n\n${largeObjective}\n${largeObjective}`,
    progressText: `# Progress\n\n- ${largeParagraph}\n- ${largeParagraph}\n- ${largeParagraph}`,
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'partial_progress',
        summary: priorHeavySummary
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T22', title: 'Keep the CLI prompt budgeted', status: 'in_progress' }
      ]
    },
    selectedTask: {
      id: 'T22',
      title: 'Keep the CLI prompt budgeted',
      status: 'in_progress'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.equal(render.evidence.promptBudget?.policyName, 'continue-progress:cliExec');
  assert.equal(render.evidence.promptBudget?.withinTarget, true);
  assert.deepEqual(render.evidence.promptBudget?.requiredSections, [
    'strategyContext',
    'preflightContext',
    'objectiveContext',
    'taskContext',
    'operatingRules',
    'executionContract',
    'finalResponseContract'
  ]);
  assert.deepEqual(render.evidence.promptBudget?.optionalSections, [
    'runtimeContext',
    'repoContext',
    'progressContext',
    'priorIterationContext'
  ]);
  assert.deepEqual(render.evidence.promptBudget?.omissionOrder, [
    'runtimeContext',
    'repoContext',
    'progressContext',
    'priorIterationContext'
  ]);
  assert.ok(render.evidence.promptBudget?.omittedSections.includes('progressContext'));
  assert.match(render.prompt, /recent progress did not fit within the target prompt budget/);
});

test('buildPrompt preserves prior blocker context before progress for oversized human-review CLI prompts', async () => {
  const templateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-human-review-budget-template-'));
  const fullTemplate = [
    '{{prompt_title}}',
    '',
    'Selection: {{template_selection_reason}}',
    'Strategy:',
    '{{strategy_context}}',
    'Preflight:',
    '{{preflight_context}}',
    'Objective:',
    '{{objective_context}}',
    'Repo:',
    '{{repo_context}}',
    'Runtime:',
    '{{runtime_context}}',
    'Task:',
    '{{task_context}}',
    'Progress:',
    '{{progress_context}}',
    'Prior:',
    '{{prior_iteration_context}}',
    'Rules:',
    '{{operating_rules}}',
    'Exec:',
    '{{execution_contract}}',
    'Final:',
    '{{final_response_contract}}'
  ].join('\n');
  await fs.writeFile(path.join(templateDir, 'human-review-handoff.md'), fullTemplate, 'utf8');
  const largeProgress = 'Recent attempt detail that can be summarized aggressively. '.repeat(260);
  const largeObjective = 'Objective context that still matters for the human-review handoff. '.repeat(120);
  const blockerSummary = 'A manual decision is needed before the task can continue safely. '.repeat(35);
  const remediationSummary = 'Escalate the blocker to a human reviewer with the captured evidence. '.repeat(30);
  const render = await buildPrompt({
    kind: 'human-review-handoff',
    target: 'cliExec',
    iteration: 2,
    selectionReason: 'Preserve the blocker without overrunning the CLI prompt budget.',
    objectiveText: `# Product / project brief\n\n${largeObjective}\n${largeObjective}\n${largeObjective}`,
    progressText: `# Progress\n\n- ${largeProgress}\n- ${largeProgress}\n- ${largeProgress}`,
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState({
      lastIteration: baseIterationResult({
        completionClassification: 'needs_human_review',
        stopReason: 'human_review_needed',
        summary: blockerSummary,
        remediation: {
          trigger: 'repeated_identical_failure',
          attemptCount: 2,
          summary: remediationSummary,
          action: 'request_human_review',
          taskId: 'T22',
          humanReviewRecommended: true,
          evidence: ['same_blocker_repeated']
        }
      })
    }),
    paths,
    taskFile: {
      version: 2,
      tasks: [
        { id: 'T22', title: 'Escalate blocker with durable evidence', status: 'in_progress' }
      ]
    },
    selectedTask: {
      id: 'T22',
      title: 'Escalate blocker with durable evidence',
      status: 'in_progress',
      blocker: 'Needs human review before more CLI retries.'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.equal(render.evidence.promptBudget?.policyName, 'human-review-handoff:cliExec');
  assert.equal(render.evidence.promptBudget?.budgetMode, 'trimmed');
  assert.ok(render.evidence.promptBudget?.omittedSections.includes('progressContext'));
  assert.ok(!render.evidence.promptBudget?.omittedSections.includes('priorIterationContext'));
  assert.ok((render.evidence.promptBudget?.budgetDeltaTokens ?? 0) > 0);
  assert.match(render.prompt, /Prior remediation: Escalate the blocker to a human reviewer with the captured evidence\./);
  assert.match(render.prompt, /Additional prior-context signals omitted: 2\./);
  assert.match(render.prompt, /recent progress did not fit within the target prompt budget/);
});

test('buildPrompt is deterministic across equivalent inputs', async () => {
  const templateDir = await createTemplateDir();
  const input: Parameters<typeof buildPrompt>[0] = {
    kind: 'continue-progress',
    target: 'ideHandoff',
    iteration: 2,
    selectionReason: 'Continue from durable partial progress.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Step one done.\n- Step two pending.\n',
    taskCounts: {
      todo: 2,
      in_progress: 1,
      blocked: 0,
      done: 1
    },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2 as const,
      tasks: [
        { id: 'T1', title: 'Ship prompt system', status: 'in_progress' }
      ]
    },
    selectedTask: {
      id: 'T1',
      title: 'Ship prompt system',
      status: 'in_progress'
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: {
      ready: true,
      summary: 'Preflight completed without blocking errors.',
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  };

  const first = await buildPrompt(input);
  const second = await buildPrompt(JSON.parse(JSON.stringify(input)) as Parameters<typeof buildPrompt>[0]);

  assert.equal(first.prompt, second.prompt);
  assert.equal(JSON.stringify(first.evidence), JSON.stringify(second.evidence));
});

test('buildPreflightContext surfaces session_handoff_available diagnostic in the preflight snapshot', async () => {
  const templateDir = await createTemplateDir();
  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 3,
    selectionReason: 'Continuing from a prior clean handoff.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 2 },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Preflight handoff test task', status: 'todo' }]
    },
    selectedTask: { id: 'T1', title: 'Preflight handoff test task', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: [
        {
          category: 'workspaceRuntime',
          severity: 'info',
          code: 'session_handoff_available',
          message: 'Resuming from handoff note default-002.json: Prior iteration completed cleanly.'
        }
      ]
    },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  assert.ok(
    render.evidence.inputs.preflightContext.includes(
      '- sessionHandoff: Resuming from handoff note default-002.json: Prior iteration completed cleanly.'
    ),
    'preflightContext should contain the session handoff line'
  );
  // The info diagnostic must NOT appear via the salient-warning block (severity filter excludes it)
  assert.ok(
    !render.evidence.inputs.preflightContext.some((line) => /workspaceRuntime info:/.test(line)),
    'info diagnostics should not appear via salient-warning block'
  );
});

test('static prefix is byte-identical across two prompt builds that differ only in task input', async () => {
  const sharedInput = {
    kind: 'iteration' as const,
    target: 'cliExec' as const,
    iteration: 2,
    selectionReason: 'A prior Ralph prompt exists and there is no stronger prior-iteration signal.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Prompt builder exists.\n',
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 3 },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2 as const,
      tasks: [
        { id: 'T10', title: 'Add cache-friendly static prefix', status: 'todo' as const },
        { id: 'T11', title: 'Surface recommended skills in Show Status', status: 'todo' as const }
      ]
    },
    taskValidationHint: validationProvenance.taskValidationHint,
    effectiveValidationCommand: validationProvenance.effectiveValidationCommand,
    normalizedValidationCommandFrom: validationProvenance.normalizedValidationCommandFrom,
    validationCommand: 'npm run validate',
    preflightReport: { ready: true, summary: 'Preflight completed.', diagnostics: [] },
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  };

  const renderA = await buildPrompt({
    ...sharedInput,
    selectedTask: { id: 'T10', title: 'Add cache-friendly static prefix', status: 'todo' }
  });

  const renderB = await buildPrompt({
    ...sharedInput,
    selectedTask: { id: 'T11', title: 'Surface recommended skills in Show Status', status: 'todo' }
  });

  const prefixA = extractStaticPrefix(renderA.prompt);
  const prefixB = extractStaticPrefix(renderB.prompt);

  assert.ok(
    renderA.prompt.includes(STATIC_PREFIX_BOUNDARY),
    'Rendered prompt must contain the static prefix boundary marker'
  );
  assert.ok(
    prefixA.length > 0,
    'Extracted static prefix must be non-empty'
  );
  assert.equal(
    prefixA,
    prefixB,
    'Static prefix must be byte-identical across two builds that differ only in task input'
  );

  const snapshotFile = path.join(snapshotDirectory, 'static-prefix.iteration.cliExec.md');
  const normalizedPrefix = prefixA.replace(/\r\n/g, '\n');

  if (updateSnapshots) {
    await fs.mkdir(snapshotDirectory, { recursive: true });
    await fs.writeFile(snapshotFile, normalizedPrefix, 'utf8');
    return;
  }

  let stored: string;
  try {
    stored = await fs.readFile(snapshotFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      assert.fail(
        `Missing snapshot ${path.relative(process.cwd(), snapshotFile)}. Run npm test -- --updateSnapshot to create it.`
      );
    }
    throw error;
  }

  assert.equal(
    normalizedPrefix,
    stored.replace(/\r\n/g, '\n'),
    `Static prefix snapshot mismatch. Inspect ${path.relative(process.cwd(), snapshotFile)} and update intentionally with npm test -- --updateSnapshot.`
  );
});

test('sliding-window memoryStrategy includes exactly the last memoryWindowSize iterations in prior-context', async () => {
  const templateDir = await createTemplateDir();

  const history = [1, 2, 3, 4, 5].map((n) =>
    baseIterationResult({
      iteration: n,
      summary: `Completed step ${n}.`,
      completionClassification: 'complete',
      executionStatus: 'succeeded'
    })
  );

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 6,
    selectionReason: 'Sliding-window test.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Steps 1-5 done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 5 },
    summary,
    state: workspaceState({
      lastIteration: history[history.length - 1],
      iterationHistory: history
    }),
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T6', title: 'Step 6', status: 'todo' }] },
    selectedTask: { id: 'T6', title: 'Step 6', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'Preflight ok.', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      memoryStrategy: 'sliding-window',
      memoryWindowSize: 3
    }
  });

  // Should contain the last 3 iterations (3, 4, 5) but not the earlier ones (1, 2)
  assert.match(render.prompt, /Iteration 3: complete \/ succeeded — Completed step 3\./);
  assert.match(render.prompt, /Iteration 4: complete \/ succeeded — Completed step 4\./);
  assert.match(render.prompt, /Iteration 5: complete \/ succeeded — Completed step 5\./);
  assert.doesNotMatch(render.prompt, /Iteration 1:/);
  assert.doesNotMatch(render.prompt, /Iteration 2:/);
});

test('static prefix is byte-identical across two sliding-window builds with different task inputs', async () => {
  const history = [1, 2, 3].map((n) =>
    baseIterationResult({
      iteration: n,
      summary: `Completed step ${n}.`,
      completionClassification: 'complete',
      executionStatus: 'succeeded'
    })
  );

  const sharedInput = {
    kind: 'iteration' as const,
    target: 'cliExec' as const,
    iteration: 4,
    selectionReason: 'A prior Ralph prompt exists and there is no stronger prior-iteration signal.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Steps 1-3 done.\n',
    taskCounts: { todo: 2, in_progress: 0, blocked: 0, done: 3 },
    summary,
    state: workspaceState({
      lastIteration: history[history.length - 1],
      iterationHistory: history
    }),
    paths,
    taskFile: {
      version: 2 as const,
      tasks: [
        { id: 'T20', title: 'Memory window task A', status: 'todo' as const },
        { id: 'T21', title: 'Memory window task B', status: 'todo' as const }
      ]
    },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'Preflight ok.', diagnostics: [] },
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      memoryStrategy: 'sliding-window' as const,
      memoryWindowSize: 3
    }
  };

  const renderA = await buildPrompt({
    ...sharedInput,
    selectedTask: { id: 'T20', title: 'Memory window task A', status: 'todo' }
  });

  const renderB = await buildPrompt({
    ...sharedInput,
    selectedTask: { id: 'T21', title: 'Memory window task B', status: 'todo' }
  });

  const prefixA = extractStaticPrefix(renderA.prompt);
  const prefixB = extractStaticPrefix(renderB.prompt);

  assert.ok(prefixA.length > 0, 'Static prefix must be non-empty');
  assert.equal(prefixA, prefixB, 'Static prefix must be byte-identical across two sliding-window builds that differ only in task input');
});

test('summary memoryStrategy below threshold behaves identically to verbatim', async () => {
  const templateDir = await createTemplateDir();

  const history = [1, 2, 3].map((n) =>
    baseIterationResult({
      iteration: n,
      summary: `Completed step ${n}.`,
      completionClassification: 'complete',
      executionStatus: 'succeeded'
    })
  );

  const sharedState = workspaceState({
    lastIteration: history[history.length - 1],
    iterationHistory: history
  });

  const sharedConfig = {
    promptTemplateDirectory: templateDir,
    promptIncludeVerifierFeedback: true,
    promptPriorContextBudget: 8
  };

  const verbatimRender = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 4,
    selectionReason: 'Summary strategy test.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Steps 1-3 done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 3 },
    summary,
    state: sharedState,
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T4', title: 'Step 4', status: 'todo' }] },
    selectedTask: { id: 'T4', title: 'Step 4', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'Preflight ok.', diagnostics: [] },
    config: { ...sharedConfig, memoryStrategy: 'verbatim' }
  });

  // Threshold of 10 is above history depth of 3, so summary strategy should be identical to verbatim
  const summaryRender = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 4,
    selectionReason: 'Summary strategy test.',
    objectiveText: '# Product / project brief\n\nShip better prompts.',
    progressText: '# Progress\n\n- Steps 1-3 done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 3 },
    summary,
    state: sharedState,
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T4', title: 'Step 4', status: 'todo' }] },
    selectedTask: { id: 'T4', title: 'Step 4', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'Preflight ok.', diagnostics: [] },
    config: { ...sharedConfig, memoryStrategy: 'summary', memorySummaryThreshold: 10 }
  });

  assert.equal(verbatimRender.prompt, summaryRender.prompt,
    'summary strategy below threshold must produce the same prompt as verbatim');
});

test('summary memoryStrategy above threshold reads from memory-summary.md and appends recent verbatim entries', async () => {
  const templateDir = await createTemplateDir();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-summary-test-'));

  try {
    const ralphDir = path.join(tmpDir, '.ralph');
    await fs.mkdir(ralphDir, { recursive: true });
    const memorySummaryPath = path.join(ralphDir, 'memory-summary.md');

    // Write a pre-existing summary file representing the summarised old entries
    const persistedSummary = 'Earlier iterations established the project foundation and core scaffolding.';
    await fs.writeFile(memorySummaryPath, `<!-- ralph-memory: summarized-old-count=5 -->\n${persistedSummary}\n`, 'utf8');

    // History depth of 8 with window of 3 and threshold of 5: depth > threshold
    const history = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      baseIterationResult({
        iteration: n,
        summary: `Completed step ${n}.`,
        completionClassification: 'complete',
        executionStatus: 'succeeded'
      })
    );

    const testPaths: RalphPaths = {
      ...paths,
      rootPath: tmpDir,
      ralphDir,
      memorySummaryPath
    };

    const render = await buildPrompt({
      kind: 'iteration',
      target: 'cliExec',
      iteration: 9,
      selectionReason: 'Summary strategy above-threshold test.',
      objectiveText: '# Product / project brief\n\nShip better prompts.',
      progressText: '# Progress\n\n- Steps 1-8 done.\n',
      taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 8 },
      summary,
      state: workspaceState({
        lastIteration: history[history.length - 1],
        iterationHistory: history
      }),
      paths: testPaths,
      taskFile: { version: 2, tasks: [{ id: 'T9', title: 'Step 9', status: 'todo' }] },
      selectedTask: { id: 'T9', title: 'Step 9', status: 'todo' },
      taskValidationHint: null,
      effectiveValidationCommand: null,
      normalizedValidationCommandFrom: null,
      validationCommand: null,
      preflightReport: { ready: true, summary: 'Preflight ok.', diagnostics: [] },
      config: {
        promptTemplateDirectory: templateDir,
        promptIncludeVerifierFeedback: true,
        promptPriorContextBudget: 20,
        memoryStrategy: 'summary',
        memoryWindowSize: 3,
        memorySummaryThreshold: 5
      }
    });

    // The persisted summary text should appear in the prompt
    assert.match(render.prompt, /Earlier iterations established the project foundation and core scaffolding\./,
      'Persisted summary text must be included in prior-context section');

    // The most recent 3 iterations (window) should appear verbatim
    assert.match(render.prompt, /Iteration 6: complete \/ succeeded — Completed step 6\./);
    assert.match(render.prompt, /Iteration 7: complete \/ succeeded — Completed step 7\./);
    assert.match(render.prompt, /Iteration 8: complete \/ succeeded — Completed step 8\./);

    // Older iterations should NOT appear as verbatim entries (they are in the summary)
    assert.doesNotMatch(render.prompt, /Iteration 1: complete \/ succeeded — Completed step 1\./);
    assert.doesNotMatch(render.prompt, /Iteration 5: complete \/ succeeded — Completed step 5\./);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// memoryObservability provenance fields
// ---------------------------------------------------------------------------

test('memoryObservability: verbatim strategy populates fields correctly', async () => {
  const templateDir = await createTemplateDir();
  const history = [1, 2, 3].map((n) =>
    baseIterationResult({ iteration: n, summary: `Step ${n}.`, completionClassification: 'complete', executionStatus: 'succeeded' })
  );
  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 4,
    selectionReason: 'Memory observability verbatim test.',
    objectiveText: '# Objective\n\nTest.',
    progressText: '# Progress\n\n- Steps done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 3 },
    summary,
    state: workspaceState({ lastIteration: history[2], iterationHistory: history }),
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T1', title: 'Task', status: 'todo' }] },
    selectedTask: { id: 'T1', title: 'Task', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'ok', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  const obs = render.evidence.memoryObservability;
  assert.ok(obs, 'memoryObservability must be present on evidence');
  assert.equal(obs.memoryStrategy, 'verbatim', 'strategy must be verbatim');
  assert.equal(obs.historyDepth, 3, 'historyDepth must equal iterationHistory length');
  assert.equal(obs.windowedEntryCount, 1, 'verbatim includes only the last iteration');
  assert.equal(obs.summaryGenerationCost, false, 'verbatim never triggers summary cost');
});

test('memoryObservability: sliding-window strategy populates fields correctly', async () => {
  const templateDir = await createTemplateDir();
  const history = [1, 2, 3, 4, 5].map((n) =>
    baseIterationResult({ iteration: n, summary: `Step ${n}.`, completionClassification: 'complete', executionStatus: 'succeeded' })
  );
  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 6,
    selectionReason: 'Memory observability sliding-window test.',
    objectiveText: '# Objective\n\nTest.',
    progressText: '# Progress\n\n- Steps done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 5 },
    summary,
    state: workspaceState({ lastIteration: history[4], iterationHistory: history }),
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T1', title: 'Task', status: 'todo' }] },
    selectedTask: { id: 'T1', title: 'Task', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'ok', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      memoryStrategy: 'sliding-window',
      memoryWindowSize: 3
    }
  });

  const obs = render.evidence.memoryObservability;
  assert.ok(obs, 'memoryObservability must be present on evidence');
  assert.equal(obs.memoryStrategy, 'sliding-window', 'strategy must be sliding-window');
  assert.equal(obs.historyDepth, 5, 'historyDepth must equal iterationHistory length');
  assert.equal(obs.windowedEntryCount, 3, 'windowedEntryCount must be min(windowSize, historyDepth)');
  assert.equal(obs.summaryGenerationCost, false, 'sliding-window never triggers summary cost');
});

test('memoryObservability: summary strategy below threshold reports no summaryGenerationCost', async () => {
  const templateDir = await createTemplateDir();
  const history = [1, 2, 3].map((n) =>
    baseIterationResult({ iteration: n, summary: `Step ${n}.`, completionClassification: 'complete', executionStatus: 'succeeded' })
  );
  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 4,
    selectionReason: 'Memory observability summary-below-threshold test.',
    objectiveText: '# Objective\n\nTest.',
    progressText: '# Progress\n\n- Steps done.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 3 },
    summary,
    state: workspaceState({ lastIteration: history[2], iterationHistory: history }),
    paths,
    taskFile: { version: 2, tasks: [{ id: 'T1', title: 'Task', status: 'todo' }] },
    selectedTask: { id: 'T1', title: 'Task', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommand: null,
    preflightReport: { ready: true, summary: 'ok', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      memoryStrategy: 'summary',
      memoryWindowSize: 3,
      memorySummaryThreshold: 10
    }
  });

  const obs = render.evidence.memoryObservability;
  assert.ok(obs, 'memoryObservability must be present on evidence');
  assert.equal(obs.memoryStrategy, 'summary', 'strategy must be summary');
  assert.equal(obs.historyDepth, 3, 'historyDepth must equal iterationHistory length');
  assert.equal(obs.windowedEntryCount, 3, 'windowedEntryCount is min(windowSize, historyDepth) for summary');
  assert.equal(obs.summaryGenerationCost, false, 'summary below threshold must not trigger summaryGenerationCost');
});

test('memoryObservability: summary strategy above threshold reports summaryGenerationCost true', async () => {
  const templateDir = await createTemplateDir();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-obs-test-'));
  try {
    const ralphDir = path.join(tmpDir, '.ralph');
    await fs.mkdir(ralphDir, { recursive: true });
    const memorySummaryPath = path.join(ralphDir, 'memory-summary.md');
    await fs.writeFile(memorySummaryPath, 'Older work captured here.\n', 'utf8');

    const history = [1, 2, 3, 4, 5, 6].map((n) =>
      baseIterationResult({ iteration: n, summary: `Step ${n}.`, completionClassification: 'complete', executionStatus: 'succeeded' })
    );

    const testPaths: RalphPaths = {
      ...paths,
      rootPath: tmpDir,
      ralphDir,
      memorySummaryPath
    };

    const render = await buildPrompt({
      kind: 'iteration',
      target: 'cliExec',
      iteration: 7,
      selectionReason: 'Memory observability summary-above-threshold test.',
      objectiveText: '# Objective\n\nTest.',
      progressText: '# Progress\n\n- Steps done.\n',
      taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 6 },
      summary,
      state: workspaceState({ lastIteration: history[5], iterationHistory: history }),
      paths: testPaths,
      taskFile: { version: 2, tasks: [{ id: 'T1', title: 'Task', status: 'todo' }] },
      selectedTask: { id: 'T1', title: 'Task', status: 'todo' },
      taskValidationHint: null,
      effectiveValidationCommand: null,
      normalizedValidationCommandFrom: null,
      validationCommand: null,
      preflightReport: { ready: true, summary: 'ok', diagnostics: [] },
      config: {
        promptTemplateDirectory: templateDir,
        promptIncludeVerifierFeedback: true,
        promptPriorContextBudget: 20,
        memoryStrategy: 'summary',
        memoryWindowSize: 3,
        memorySummaryThreshold: 5
      }
    });

    const obs = render.evidence.memoryObservability;
    assert.ok(obs, 'memoryObservability must be present on evidence');
    assert.equal(obs.memoryStrategy, 'summary', 'strategy must be summary');
    assert.equal(obs.historyDepth, 6, 'historyDepth must equal iterationHistory length');
    assert.equal(obs.windowedEntryCount, 3, 'windowedEntryCount is min(windowSize, historyDepth) for summary above threshold');
    assert.equal(obs.summaryGenerationCost, true, 'summary above threshold must report summaryGenerationCost true');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Template routing for planning-layer roles (T99 AC12)
// ---------------------------------------------------------------------------

test('buildPrompt routes planner role to planning.md template', async () => {
  const templateDir = await createTemplateDir();
  await fs.writeFile(path.join(templateDir, 'planning.md'), await fs.readFile(
    path.join(process.cwd(), 'prompt-templates', 'planning.md'),
    'utf8'
  ), 'utf8');

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 3,
    selectionReason: 'T1 is the next actionable task.',
    objectiveText: '# Project\n\nBuild the feature.\n',
    progressText: '# Progress\n\n- Planning in progress.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 2 },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Plan auth module', status: 'todo' }]
    },
    selectedTask: { id: 'T1', title: 'Plan auth module', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: 'npm run validate',
    normalizedValidationCommandFrom: null,
    validationCommand: 'npm run validate',
    preflightReport: { ready: true, summary: 'Ready.', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: 'planner'
    }
  });

  assert.equal(render.templatePath, path.join(templateDir, 'planning.md'));
  assert.match(render.prompt, /You are Ralph's planner agent\./);
  assert.match(render.prompt, /planning-only mode/);
  assert.doesNotMatch(render.prompt, /Implement the smallest coherent improvement/);
});

test('buildPrompt routes reviewer role to review.md template', async () => {
  const templateDir = await createTemplateDir();
  await fs.writeFile(path.join(templateDir, 'review.md'), await fs.readFile(
    path.join(process.cwd(), 'prompt-templates', 'review.md'),
    'utf8'
  ), 'utf8');

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 4,
    selectionReason: 'T1 done task selected for review.',
    objectiveText: '# Project\n\nReview completed work.\n',
    progressText: '# Progress\n\n- T1 done.\n',
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 1 },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Implement auth', status: 'done' }]
    },
    selectedTask: { id: 'T1', title: 'Implement auth', status: 'done' },
    taskValidationHint: null,
    effectiveValidationCommand: 'npm run validate',
    normalizedValidationCommandFrom: null,
    validationCommand: 'npm run validate',
    preflightReport: { ready: true, summary: 'Ready.', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: 'reviewer'
    }
  });

  assert.equal(render.templatePath, path.join(templateDir, 'review.md'));
  assert.match(render.prompt, /You are Ralph's reviewer agent\./);
  assert.match(render.prompt, /review-only mode/);
  assert.doesNotMatch(render.prompt, /Implement the smallest coherent improvement/);
});

test('buildPrompt routes implementer role to standard iteration template', async () => {
  const templateDir = await createTemplateDir();

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: 5,
    selectionReason: 'T1 is the next todo task.',
    objectiveText: '# Project\n\nImplement the feature.\n',
    progressText: '# Progress\n\n- Starting T1.\n',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    summary,
    state: workspaceState(),
    paths,
    taskFile: {
      version: 2,
      tasks: [{ id: 'T1', title: 'Implement auth', status: 'todo' }]
    },
    selectedTask: { id: 'T1', title: 'Implement auth', status: 'todo' },
    taskValidationHint: null,
    effectiveValidationCommand: 'npm run validate',
    normalizedValidationCommandFrom: null,
    validationCommand: 'npm run validate',
    preflightReport: { ready: true, summary: 'Ready.', diagnostics: [] },
    config: {
      promptTemplateDirectory: templateDir,
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: 'implementer'
    }
  });

  assert.equal(render.templatePath, path.join(templateDir, 'iteration.md'));
});
