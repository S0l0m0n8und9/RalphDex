import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { buildPrompt, choosePromptKind, decidePromptKind } from '../src/prompt/promptBuilder';
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
  stateFilePath: '/workspace/.ralph/state.json',
  promptDir: '/workspace/.ralph/prompts',
  runDir: '/workspace/.ralph/runs',
  logDir: '/workspace/.ralph/logs',
  logFilePath: '/workspace/.ralph/logs/extension.log',
  artifactDir: '/workspace/.ralph/artifacts'
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
