import { DEFAULT_CONFIG } from '../../../src/config/defaults';
import { buildSettingsSurfaceSnapshot } from '../../../src/config/settingsSurface';
import type { RalphDashboardState } from '../../../src/ui/uiTypes';

export interface UiStateFixture {
  id: string;
  description: string;
  state: RalphDashboardState;
}

function baseState(): RalphDashboardState {
  return {
    workspaceName: 'fixture-workspace',
    loopState: 'idle',
    agentRole: 'implementer',
    nextIteration: 1,
    iterationCap: 10,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'Preflight ready.',
    diagnostics: [],
    agentLanes: [],
    settingsSurface: null,
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    prdExists: false
  };
}

export const UI_STATE_FIXTURES: UiStateFixture[] = [
  {
    id: 'empty-workspace',
    description: 'Empty workspace with no PRD and no tasks.',
    state: baseState()
  },
  {
    id: 'no-prd',
    description: 'No PRD so run controls route to setup.',
    state: { ...baseState(), prdExists: false }
  },
  {
    id: 'prd-no-tasks',
    description: 'PRD exists but no tasks are present yet.',
    state: { ...baseState(), prdExists: true }
  },
  {
    id: 'provider-not-configured',
    description: 'Provider settings shown with missing readiness context.',
    state: {
      ...baseState(),
      settingsSurface: buildSettingsSurfaceSnapshot({
        ...DEFAULT_CONFIG,
        cliProvider: 'azure-foundry',
        azureFoundry: {
          ...DEFAULT_CONFIG.azureFoundry,
          endpointUrl: '',
          auth: { ...DEFAULT_CONFIG.azureFoundry.auth, mode: 'vscode-secret', secretStorageKey: '' }
        }
      })
    }
  },
  {
    id: 'provider-ready',
    description: 'Provider settings visible with normal defaults.',
    state: { ...baseState(), settingsSurface: buildSettingsSurfaceSnapshot(DEFAULT_CONFIG) }
  },
  {
    id: 'idle-with-tasks',
    description: 'Idle state with actionable tasks.',
    state: {
      ...baseState(),
      prdExists: true,
      taskCounts: { todo: 2, in_progress: 0, blocked: 0, done: 0 },
      tasks: [
        { id: 'T1', title: 'Implement feature', status: 'todo', isCurrent: true, priority: 'normal', childIds: [], dependsOn: [] },
        { id: 'T2', title: 'Add tests', status: 'todo', isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] }
      ]
    }
  },
  {
    id: 'running-single-agent',
    description: 'Loop running with one active lane.',
    state: {
      ...baseState(),
      loopState: 'running',
      agentLanes: [{ agentId: 'default', phase: 'execute', iteration: 3 }]
    }
  },
  {
    id: 'running-multi-agent',
    description: 'Multiple agent lanes in flight.',
    state: {
      ...baseState(),
      loopState: 'running',
      agentLanes: [
        { agentId: 'planner-1', phase: 'select', iteration: 2 },
        { agentId: 'impl-1', phase: 'execute', iteration: 2 }
      ]
    }
  },
  {
    id: 'blocked-preflight',
    description: 'Preflight blocked with actionable diagnostics.',
    state: {
      ...baseState(),
      prdExists: true,
      taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
      tasks: [
        { id: 'T1', title: 'Fix provider readiness', status: 'todo', isCurrent: true, priority: 'normal', childIds: [], dependsOn: [] }
      ],
      preflightReady: false,
      preflightSummary: 'Blocked preflight.',
      diagnostics: [{ severity: 'warning', message: 'Provider command path missing.' }]
    }
  },
  {
    id: 'blocked-with-recovery-queue',
    description: 'Blocked readiness with recovery queue attention from durable snapshot.',
    state: {
      ...baseState(),
      prdExists: true,
      preflightReady: false,
      preflightSummary: 'Blocked preflight.',
      taskCounts: { todo: 1, in_progress: 0, blocked: 1, done: 0 },
      tasks: [
        { id: 'T21', title: 'Unblock provider setup', status: 'blocked', isCurrent: true, priority: 'normal', childIds: [], dependsOn: [] }
      ],
      dashboardSnapshot: {
        workspaceName: 'fixture-workspace',
        taskBoard: {
          counts: { todo: 1, in_progress: 0, blocked: 1, done: 0 },
          deadLetterCount: 1,
          selectedTaskId: 'T21',
          selectedTaskTitle: 'Unblock provider setup',
          nextIteration: 3
        },
        agentGrid: { rows: [] },
        failureFeed: { entries: [] },
        diagnosis: null,
        deadLetter: {
          entries: [{
            schemaVersion: 1,
            kind: 'deadLetterEntry',
            taskId: 'T18',
            taskTitle: 'Retry provider auth bootstrap',
            deadLetteredAt: '2026-05-01T00:00:00.000Z',
            diagnosticHistory: [],
            recoveryAttemptCount: 2
          }]
        },
        quickActions: { hasDeadLetterEntries: true, hasBlockedTasks: true, canAttemptLoop: false },
        cost: { executionCostUsd: null, diagnosticCostUsd: null, promptCacheStats: null, hasAnyCostData: false }
      }
    }
  },
  {
    id: 'needs-human-review',
    description: 'Latest iteration requires human review.',
    state: {
      ...baseState(),
      prdExists: true,
      recentIterations: [
        { iteration: 4, taskId: 'T3', taskTitle: 'Refactor workflow', classification: 'needs_human_review', stopReason: 'human_review_needed', artifactDir: '/tmp/i4' }
      ],
      dashboardSnapshot: {
        workspaceName: 'fixture-workspace',
        taskBoard: {
          counts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
          deadLetterCount: 1,
          selectedTaskId: 'T3',
          selectedTaskTitle: 'Refactor workflow',
          nextIteration: 4
        },
        agentGrid: { rows: [] },
        failureFeed: {
          entries: [{
            taskId: 'T3',
            taskTitle: 'Refactor workflow',
            category: 'validation_mismatch',
            confidence: 'high',
            summary: 'Requires operator review before continuing.',
            suggestedAction: 'Review and requeue after confirmation.',
            recoveryAttemptCount: 1,
            remediationSummary: null,
            humanReviewRecommended: true
          }]
        },
        diagnosis: null,
        deadLetter: {
          entries: [{
            schemaVersion: 1,
            kind: 'deadLetterEntry',
            taskId: 'T3',
            taskTitle: 'Refactor workflow',
            deadLetteredAt: '2026-05-01T00:00:00.000Z',
            diagnosticHistory: [],
            recoveryAttemptCount: 1
          }]
        },
        quickActions: { hasDeadLetterEntries: true, hasBlockedTasks: false, canAttemptLoop: true },
        cost: { executionCostUsd: null, diagnosticCostUsd: null, promptCacheStats: null, hasAnyCostData: false }
      }
    }
  },
  {
    id: 'repeated-no-progress',
    description: 'Recent iterations show repeated no progress.',
    state: {
      ...baseState(),
      recentIterations: [
        { iteration: 5, taskId: 'T4', taskTitle: 'Stuck task', classification: 'no_progress', stopReason: 'repeated_no_progress', artifactDir: '/tmp/i5' }
      ]
    }
  },
  {
    id: 'failed-iteration',
    description: 'Latest iteration failed.',
    state: {
      ...baseState(),
      recentIterations: [
        { iteration: 6, taskId: 'T7', taskTitle: 'Failure case', classification: 'failed', stopReason: 'execution_failed', artifactDir: '/tmp/i6' }
      ]
    }
  },
  {
    id: 'all-tasks-done',
    description: 'All work complete state.',
    state: {
      ...baseState(),
      prdExists: true,
      taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 3 },
      tasks: [
        { id: 'T1', title: 'Done one', status: 'done', isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] },
        { id: 'T2', title: 'Done two', status: 'done', isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] },
        { id: 'T3', title: 'Done three', status: 'done', isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] }
      ]
    }
  },
  {
    id: 'settings-invalid',
    description: 'Settings surface with invalid tier thresholds.',
    state: {
      ...baseState(),
      settingsSurface: buildSettingsSurfaceSnapshot({
        ...DEFAULT_CONFIG,
        modelTiering: {
          ...DEFAULT_CONFIG.modelTiering,
          simpleThreshold: 40,
          complexThreshold: 10
        }
      })
    }
  },
  {
    id: 'task-seeding-success',
    description: 'Task seeding succeeded with artifact pointer.',
    state: {
      ...baseState(),
      taskSeeding: {
        phase: 'success',
        requestText: 'Seed a feature epic',
        createdTaskCount: 2,
        message: 'Seeded 2 task(s).',
        artifactPath: '.ralph/artifacts/task-seeding/latest.json'
      }
    }
  },
  {
    id: 'task-seeding-error',
    description: 'Task seeding failed with actionable message.',
    state: {
      ...baseState(),
      taskSeeding: {
        phase: 'error',
        requestText: 'Seed a feature epic',
        createdTaskCount: null,
        message: 'Provider returned invalid task list.',
        artifactPath: null
      }
    }
  }
];
