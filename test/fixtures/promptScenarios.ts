import { deriveRootPolicy } from '../../src/ralph/rootPolicy';
import {
  RalphIterationResult,
  RalphPromptKind,
  RalphTask,
  RalphTaskFile,
  RalphWorkspaceState
} from '../../src/ralph/types';
import { WorkspaceScan } from '../../src/services/workspaceInspection';

const FIXTURE_ROOT = '/fixture';
const FIXTURE_PROMPT_PATH = `${FIXTURE_ROOT}/.ralph/prompts/iteration-001.prompt.md`;
const FIXTURE_ARTIFACT_DIR = `${FIXTURE_ROOT}/.ralph/artifacts/iteration-001`;
const FIXTURE_TRANSCRIPT_PATH = `${FIXTURE_ROOT}/.ralph/runs/iteration-001.transcript.md`;
const FIXTURE_LAST_MESSAGE_PATH = `${FIXTURE_ROOT}/.ralph/runs/iteration-001.last-message.md`;
const FIXTURE_STDOUT_PATH = `${FIXTURE_ARTIFACT_DIR}/stdout.log`;
const FIXTURE_STDERR_PATH = `${FIXTURE_ARTIFACT_DIR}/stderr.log`;

export interface PromptScenarioFixture {
  name: string;
  description: string;
  expectedPromptKind: RalphPromptKind;
  selectedTaskId: string | null;
  requiredPromptSnippets: string[];
  forbiddenPromptSnippets?: string[];
  taskFile: RalphTaskFile;
  prd: string;
  progress: string;
  workspaceScan: WorkspaceScan;
  priorIteration: RalphIterationResult | null;
}

function taskCounts(taskFile: RalphTaskFile): Record<RalphTask['status'], number> {
  return taskFile.tasks.reduce<Record<RalphTask['status'], number>>((counts, task) => {
    counts[task.status] += 1;
    return counts;
  }, {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0
  });
}

function createWorkspaceScan(overrides: Partial<WorkspaceScan> = {}): WorkspaceScan {
  const rootPath = overrides.rootPath ?? FIXTURE_ROOT;

  return {
    workspaceName: overrides.workspaceName ?? 'fixture-workspace',
    workspaceRootPath: overrides.workspaceRootPath ?? rootPath,
    rootPath,
    rootSelection: overrides.rootSelection ?? {
      workspaceRootPath: rootPath,
      selectedRootPath: rootPath,
      strategy: 'workspaceRoot',
      summary: 'Using the workspace root because it already exposes shallow repo markers.',
      override: null,
      candidates: [
        {
          path: rootPath,
          relativePath: '.',
          markerCount: 6,
          markers: ['package.json', 'README.md', 'AGENTS.md', 'src', 'test', '.ralph']
        }
      ]
    },
    manifests: overrides.manifests ?? ['package.json', 'tsconfig.json'],
    projectMarkers: overrides.projectMarkers ?? ['package.json', 'README.md', 'AGENTS.md', 'src', 'test'],
    packageManagers: overrides.packageManagers ?? ['npm'],
    packageManagerIndicators: overrides.packageManagerIndicators ?? ['package.json', 'package-lock.json'],
    ciFiles: overrides.ciFiles ?? ['.github/workflows/ci.yml'],
    ciCommands: overrides.ciCommands ?? ['npm test'],
    docs: overrides.docs ?? ['README.md', 'AGENTS.md'],
    sourceRoots: overrides.sourceRoots ?? ['src'],
    tests: overrides.tests ?? ['test'],
    lifecycleCommands: overrides.lifecycleCommands ?? ['npm run compile', 'npm run test'],
    validationCommands: overrides.validationCommands ?? ['npm run compile'],
    testSignals: overrides.testSignals ?? ['package.json defines a test script.'],
    notes: overrides.notes ?? [],
    evidence: overrides.evidence ?? {
      rootEntries: ['.github', '.ralph', 'AGENTS.md', 'README.md', 'package.json', 'src', 'test', 'tsconfig.json'],
      manifests: {
        checked: ['package.json', 'tsconfig.json'],
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
        checked: ['README.md', 'AGENTS.md'],
        matches: ['README.md', 'AGENTS.md'],
        emptyReason: null
      },
      ciFiles: {
        checked: ['.github/workflows/*.yml'],
        matches: ['.github/workflows/ci.yml'],
        emptyReason: null
      },
      packageManagers: {
        indicators: ['package.json', 'package-lock.json'],
        detected: ['npm'],
        packageJsonPackageManager: 'npm',
        emptyReason: null
      },
      validationCommands: {
        selected: ['npm run compile'],
        packageJsonScripts: ['npm run compile'],
        makeTargets: [],
        justTargets: [],
        ciCommands: ['npm test'],
        manifestSignals: [],
        emptyReason: null
      },
      lifecycleCommands: {
        selected: ['npm run compile', 'npm run test'],
        packageJsonScripts: ['npm run compile', 'npm run test'],
        makeTargets: [],
        justTargets: [],
        ciCommands: [],
        manifestSignals: [],
        emptyReason: null
      }
    },
    packageJson: overrides.packageJson ?? {
      name: 'fixture-workspace',
      packageManager: 'npm',
      hasWorkspaces: false,
      scriptNames: ['compile', 'test'],
      lifecycleCommands: ['npm run compile', 'npm run test'],
      validationCommands: ['npm run compile'],
      testSignals: ['package.json defines a test script.']
    }
  };
}

function createIterationResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  const workspaceScan = createWorkspaceScan();
  const executionRootPolicy = deriveRootPolicy(workspaceScan);

  return {
    schemaVersion: 1,
    iteration: overrides.iteration ?? 1,
    selectedTaskId: overrides.selectedTaskId ?? 'T1',
    selectedTaskTitle: overrides.selectedTaskTitle ?? 'Default fixture task',
    promptKind: overrides.promptKind ?? 'iteration',
    promptPath: overrides.promptPath ?? FIXTURE_PROMPT_PATH,
    artifactDir: overrides.artifactDir ?? FIXTURE_ARTIFACT_DIR,
    adapterUsed: overrides.adapterUsed ?? 'cliExec',
    executionIntegrity: overrides.executionIntegrity ?? {
      promptTarget: 'cliExec',
      rootPolicy: executionRootPolicy,
      templatePath: `${FIXTURE_ROOT}/prompt-templates/iteration.md`,
      taskValidationHint: 'cd ralph-codex-vscode-starter && npm run compile',
      effectiveValidationCommand: 'npm run compile',
      normalizedValidationCommandFrom: 'cd ralph-codex-vscode-starter && npm run compile',
      executionPlanPath: `${FIXTURE_ARTIFACT_DIR}/execution-plan.json`,
      promptArtifactPath: `${FIXTURE_ARTIFACT_DIR}/prompt.md`,
      promptHash: 'sha256:fixture-iteration-001',
      promptByteLength: 512,
      executionPayloadHash: 'sha256:fixture-iteration-001',
      executionPayloadMatched: true,
      mismatchReason: null,
      cliInvocationPath: `${FIXTURE_ARTIFACT_DIR}/cli-invocation.json`
    },
    executionStatus: overrides.executionStatus ?? 'succeeded',
    verificationStatus: overrides.verificationStatus ?? 'passed',
    completionClassification: overrides.completionClassification ?? 'complete',
    followUpAction: overrides.followUpAction ?? 'continue_next_task',
    startedAt: overrides.startedAt ?? '2026-03-01T00:00:00.000Z',
    finishedAt: overrides.finishedAt ?? '2026-03-01T00:05:00.000Z',
    phaseTimestamps: overrides.phaseTimestamps ?? {
      inspectStartedAt: '2026-03-01T00:00:00.000Z',
      inspectFinishedAt: '2026-03-01T00:00:20.000Z',
      taskSelectedAt: '2026-03-01T00:00:30.000Z',
      promptGeneratedAt: '2026-03-01T00:00:40.000Z',
      executionStartedAt: '2026-03-01T00:00:50.000Z',
      executionFinishedAt: '2026-03-01T00:04:20.000Z',
      resultCollectedAt: '2026-03-01T00:04:30.000Z',
      verificationFinishedAt: '2026-03-01T00:04:40.000Z',
      classifiedAt: '2026-03-01T00:04:50.000Z',
      persistedAt: '2026-03-01T00:05:00.000Z'
    },
    summary: overrides.summary ?? 'Fixture iteration completed.',
    warnings: overrides.warnings ?? [],
    errors: overrides.errors ?? [],
    execution: overrides.execution ?? {
      exitCode: 0,
      transcriptPath: FIXTURE_TRANSCRIPT_PATH,
      lastMessagePath: FIXTURE_LAST_MESSAGE_PATH,
      stdoutPath: FIXTURE_STDOUT_PATH,
      stderrPath: FIXTURE_STDERR_PATH
    },
    verification: overrides.verification ?? {
      taskValidationHint: 'cd ralph-codex-vscode-starter && npm run compile',
      effectiveValidationCommand: 'npm run compile',
      normalizedValidationCommandFrom: 'cd ralph-codex-vscode-starter && npm run compile',
      primaryCommand: 'npm run compile',
      validationFailureSignature: null,
      verifiers: [
        {
          verifier: 'validationCommand',
          status: 'passed',
          summary: 'Validation command passed.',
          warnings: [],
          errors: []
        }
      ]
    },
    backlog: overrides.backlog ?? {
      remainingTaskCount: 1,
      actionableTaskAvailable: true
    },
    diffSummary: overrides.diffSummary ?? {
      available: true,
      gitAvailable: true,
      summary: 'Detected 1 relevant changed file out of 1 total change.',
      changedFileCount: 1,
      relevantChangedFileCount: 1,
      changedFiles: ['src/prompt/promptBuilder.ts'],
      relevantChangedFiles: ['src/prompt/promptBuilder.ts'],
      statusTransitions: ['src/prompt/promptBuilder.ts: clean -> M']
    },
    noProgressSignals: overrides.noProgressSignals ?? [],
    remediation: overrides.remediation ?? null,
    completionReportStatus: overrides.completionReportStatus ?? 'applied',
    reconciliationWarnings: overrides.reconciliationWarnings ?? [],
    stopReason: overrides.stopReason ?? null
  };
}

function createWorkspaceState(priorIteration: RalphIterationResult | null): RalphWorkspaceState {
  if (!priorIteration) {
    return {
      version: 2,
      objectivePreview: null,
      nextIteration: 1,
      lastPromptKind: null,
      lastPromptPath: null,
      lastRun: null,
      runHistory: [],
      lastIteration: null,
      iterationHistory: [],
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
  }

  return {
    version: 2,
    objectivePreview: 'Fixture objective preview',
    nextIteration: priorIteration.iteration + 1,
    lastPromptKind: priorIteration.promptKind,
    lastPromptPath: priorIteration.promptPath,
    lastRun: {
      iteration: priorIteration.iteration,
      mode: 'singleExec',
      promptKind: priorIteration.promptKind,
      startedAt: priorIteration.startedAt,
      finishedAt: priorIteration.finishedAt,
      status: priorIteration.executionStatus === 'failed' ? 'failed' : 'succeeded',
      exitCode: priorIteration.execution.exitCode ?? 0,
      promptPath: priorIteration.promptPath,
      transcriptPath: priorIteration.execution.transcriptPath,
      lastMessagePath: priorIteration.execution.lastMessagePath,
      summary: priorIteration.summary
    },
    runHistory: [],
    lastIteration: priorIteration,
    iterationHistory: [priorIteration],
    updatedAt: priorIteration.finishedAt
  };
}

export function buildWorkspaceStateForScenario(scenario: PromptScenarioFixture): RalphWorkspaceState {
  return createWorkspaceState(scenario.priorIteration);
}

export function findSelectedTaskForScenario(scenario: PromptScenarioFixture): RalphTask | null {
  if (!scenario.selectedTaskId) {
    return null;
  }

  return scenario.taskFile.tasks.find((task) => task.id === scenario.selectedTaskId) ?? null;
}

export function taskCountsForScenario(scenario: PromptScenarioFixture): Record<RalphTask['status'], number> {
  return taskCounts(scenario.taskFile);
}

export const freshWorkspaceScenario: PromptScenarioFixture = {
  name: 'freshWorkspace',
  description: 'Fresh workspace with no prior iterations and one actionable bootstrap task.',
  expectedPromptKind: 'bootstrap',
  selectedTaskId: 'T1',
  requiredPromptSnippets: [
    'Treat the repository and durable Ralph files as the source of truth.',
    'No prior Ralph iteration has been recorded.',
    'Selected task id: T1'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Initialize prompt fixture coverage',
        status: 'todo',
        validation: 'npm run compile'
      }
    ]
  },
  prd: '# Product / project brief\n\nBuild durable prompt fixtures for deterministic testing.\n',
  progress: '# Progress\n\nNo iterations have been recorded yet.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'fresh-fixture'
  }),
  priorIteration: null
};

export const partialProgressScenario: PromptScenarioFixture = {
  name: 'partialProgress',
  description: 'Workspace mid-task after a prior partial-progress iteration on the same selected task.',
  expectedPromptKind: 'continue-progress',
  selectedTaskId: 'T2',
  requiredPromptSnippets: [
    'Resume from that durable state and finish the next coherent slice without redoing settled work.',
    'Prior outcome classification: partial_progress',
    'Selected task id: T2'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Create fixture helpers',
        status: 'done'
      },
      {
        id: 'T2',
        title: 'Render prompt fixture coverage',
        status: 'in_progress',
        dependsOn: ['T1'],
        validation: 'npm run compile'
      }
    ]
  },
  prd: '# Product / project brief\n\nKeep prompt rendering deterministic across fresh sessions.\n',
  progress: '# Progress\n\n- Base helpers landed.\n- Prompt rendering assertions still need fixture coverage.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'partial-progress-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T2',
    selectedTaskTitle: 'Render prompt fixture coverage',
    completionClassification: 'partial_progress',
    followUpAction: 'continue_same_task',
    summary: 'Started fixture rendering coverage but left follow-up assertions pending.'
  })
};

export const repeatedNoProgressScenario: PromptScenarioFixture = {
  name: 'repeatedNoProgress',
  description: 'Workspace hit repeated no-progress on one task and now carries a pending decompose-task remediation.',
  expectedPromptKind: 'fix-failure',
  selectedTaskId: 'T3',
  requiredPromptSnippets: [
    'Focus first on the concrete failure or no-progress signal carried forward from the previous iteration.',
    'Prior remediation: Decompose T3 into smaller bounded child tasks before retrying.',
    'Additional prior-context signals omitted: 5.'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T3',
        title: 'Build prompt test fixture framework with representative workspace and task scenarios',
        status: 'in_progress',
        notes: 'Create fixtures and a small proposed child-task set with dependencies.',
        validation: 'npm run compile'
      }
    ]
  },
  prd: '# Product / project brief\n\nKeep fixture generation reproducible when remediation is required.\n',
  progress: '# Progress\n\n- Prior retries did not move the selected task.\n- Ralph proposed decomposing the task before another retry.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'repeated-no-progress-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T3',
    selectedTaskTitle: 'Build prompt test fixture framework with representative workspace and task scenarios',
    completionClassification: 'no_progress',
    followUpAction: 'stop',
    summary: 'Two retries produced no durable movement on the fixture task.',
    noProgressSignals: ['no_relevant_changed_files', 'task_state_unchanged'],
    remediation: {
      trigger: 'repeated_no_progress',
      taskId: 'T3',
      attemptCount: 2,
      action: 'decompose_task',
      humanReviewRecommended: false,
      summary: 'Decompose T3 into smaller bounded child tasks before retrying.',
      evidence: ['no_relevant_changed_files', 'task_state_unchanged']
    },
    stopReason: 'repeated_no_progress'
  })
};

export const blockedTaskScenario: PromptScenarioFixture = {
  name: 'blockedTask',
  description: 'Workspace has a blocked selected task, but the prior iteration history does not force a special prompt kind.',
  expectedPromptKind: 'iteration',
  selectedTaskId: 'T4',
  requiredPromptSnippets: [
    'You are continuing Ralph work from durable repository state, not from chat memory. Re-inspect the repo and selected task before editing.',
    'Status: blocked',
    'Blocker: Waiting on a reproducible fixture input from an external dependency.'
  ],
  forbiddenPromptSnippets: [
    'The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T4',
        title: 'Capture missing verifier prerequisite',
        status: 'blocked',
        blocker: 'Waiting on a reproducible fixture input from an external dependency.',
        validation: 'npm run compile'
      },
      {
        id: 'T5',
        title: 'Document unblock path',
        status: 'todo',
        dependsOn: ['T4']
      }
    ]
  },
  prd: '# Product / project brief\n\nSurface blocked tasks without mutating the durable backlog unexpectedly.\n',
  progress: '# Progress\n\n- The current task is blocked on external input.\n- No failure remediation has been recorded yet.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'blocked-task-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Finish an earlier fixture helper',
    completionClassification: 'complete',
    summary: 'Completed a prior helper task cleanly.'
  })
};

export const fixFailureScenario: PromptScenarioFixture = {
  name: 'fixFailure',
  description: 'Fix-failure scenario with a validation failure signature captured in the prior iteration result.',
  expectedPromptKind: 'fix-failure',
  selectedTaskId: 'T6',
  requiredPromptSnippets: [
    'Repair the concrete cause instead of repeating the same attempt.',
    'Prior validation failure signature: npm run compile::TS2304::prompt-scenarios',
    'Selected task id: T6'
  ],
  forbiddenPromptSnippets: [
    'The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T6',
        title: 'Repair prompt fixture compile path',
        status: 'in_progress',
        validation: 'npm run compile'
      }
    ]
  },
  prd: '# Product / project brief\n\nRepair fixture regressions without losing deterministic failure evidence.\n',
  progress: '# Progress\n\n- The compile path is failing with a stable signature.\n- The next iteration should fix the concrete regression.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'fix-failure-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T6',
    selectedTaskTitle: 'Repair prompt fixture compile path',
    executionStatus: 'failed',
    verificationStatus: 'failed',
    completionClassification: 'failed',
    followUpAction: 'retry_same_task',
    summary: 'Fixture compile failed with a stable prompt-scenario regression.',
    execution: {
      exitCode: 1,
      transcriptPath: FIXTURE_TRANSCRIPT_PATH,
      lastMessagePath: FIXTURE_LAST_MESSAGE_PATH,
      stdoutPath: FIXTURE_STDOUT_PATH,
      stderrPath: FIXTURE_STDERR_PATH
    },
    verification: {
      taskValidationHint: 'cd ralph-codex-vscode-starter && npm run compile',
      effectiveValidationCommand: 'npm run compile',
      normalizedValidationCommandFrom: 'cd ralph-codex-vscode-starter && npm run compile',
      primaryCommand: 'npm run compile',
      validationFailureSignature: 'npm run compile::TS2304::prompt-scenarios',
      verifiers: [
        {
          verifier: 'validationCommand',
          status: 'failed',
          summary: 'TypeScript compile failed in prompt scenarios.',
          warnings: [],
          errors: ['TS2304: Cannot find name promptScenarios.'],
          failureSignature: 'npm run compile::TS2304::prompt-scenarios'
        }
      ]
    },
    stopReason: 'execution_failed'
  })
};

export const replenishBacklogScenario: PromptScenarioFixture = {
  name: 'replenishBacklog',
  description: 'Backlog is exhausted, so the next prompt should regenerate durable task entries before normal execution resumes.',
  expectedPromptKind: 'replenish-backlog',
  selectedTaskId: null,
  requiredPromptSnippets: [
    'The durable Ralph backlog is exhausted.',
    'The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.',
    'Update `.ralph/progress.md` with a short note explaining why backlog replenishment was needed and what was added.'
  ],
  forbiddenPromptSnippets: [
    'Selected task id:'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T7',
        title: 'Seed prompt fixture coverage',
        status: 'done'
      },
      {
        id: 'T8',
        title: 'Document snapshot update workflow',
        status: 'done',
        dependsOn: ['T7']
      }
    ]
  },
  prd: '# Product / project brief\n\nKeep Ralph moving when the current durable backlog is fully consumed.\n',
  progress: '# Progress\n\n- The fixture backlog was completed.\n- The next iteration should replenish the task ledger deterministically.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'replenish-backlog-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T8',
    selectedTaskTitle: 'Document snapshot update workflow',
    completionClassification: 'complete',
    followUpAction: 'continue_next_task',
    summary: 'Finished the last actionable backlog task.',
    backlog: {
      remainingTaskCount: 0,
      actionableTaskAvailable: false
    },
    stopReason: 'no_actionable_task'
  })
};

export const humanReviewScenario: PromptScenarioFixture = {
  name: 'humanReview',
  description: 'A prior iteration requested human review, so the next prompt should preserve that blocker instead of masking it.',
  expectedPromptKind: 'human-review-handoff',
  selectedTaskId: 'T9',
  requiredPromptSnippets: [
    'Treat the prior blocker as real until the repository proves otherwise.',
    'Blocker: [human-review-needed] Fixture baseline requires explicit reviewer sign-off before proceeding.',
    'Prior remediation: Request human review before continuing the fixture workflow.'
  ],
  forbiddenPromptSnippets: [
    'The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.'
  ],
  taskFile: {
    version: 2,
    tasks: [
      {
        id: 'T9',
        title: 'Escalate fixture approval blocker',
        status: 'blocked',
        blocker: '[human-review-needed] Fixture baseline requires explicit reviewer sign-off before proceeding.',
        validation: 'npm run compile'
      }
    ]
  },
  prd: '# Product / project brief\n\nCapture explicit human-review blockers without inventing closure.\n',
  progress: '# Progress\n\n- A prior iteration surfaced a reviewer gate.\n- Ralph should now hand that blocker off explicitly.\n',
  workspaceScan: createWorkspaceScan({
    workspaceName: 'human-review-fixture'
  }),
  priorIteration: createIterationResult({
    selectedTaskId: 'T9',
    selectedTaskTitle: 'Escalate fixture approval blocker',
    completionClassification: 'needs_human_review',
    followUpAction: 'request_human_review',
    summary: 'The fixture baseline cannot proceed without explicit reviewer confirmation.',
    remediation: {
      trigger: 'human_review_needed',
      taskId: 'T9',
      attemptCount: 1,
      action: 'request_human_review',
      humanReviewRecommended: true,
      summary: 'Request human review before continuing the fixture workflow.',
      evidence: ['human-review-needed marker recorded in task state']
    },
    stopReason: 'human_review_needed'
  })
};

export const promptScenarios = {
  freshWorkspace: freshWorkspaceScenario,
  partialProgress: partialProgressScenario,
  repeatedNoProgress: repeatedNoProgressScenario,
  blockedTask: blockedTaskScenario,
  fixFailure: fixFailureScenario,
  replenishBacklog: replenishBacklogScenario,
  humanReview: humanReviewScenario
} as const;

export const promptScenarioList: PromptScenarioFixture[] = Object.values(promptScenarios);
