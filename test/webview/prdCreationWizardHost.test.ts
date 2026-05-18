import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { ProjectGenerationError } from '../../src/ralph/projectGenerator';
import { hashText } from '../../src/ralph/integrity';
import type { TaskGenerationPlanArtifact } from '../../src/ralph/prdReadiness';
import {
  PrdCreationWizardHost,
  type PrdWizardDraftBundle,
  type PrdWizardPrdGenerateResult,
  type PrdWizardTaskGenerateResult
} from '../../src/webview/prdCreationWizardHost';

type MessageHandler = (msg: unknown) => void;

interface MockWebview {
  html: string;
  posted: unknown[];
  handlers: MessageHandler[];
  postMessage(msg: unknown): Promise<boolean>;
  onDidReceiveMessage(handler: MessageHandler): { dispose(): void };
}

function makeMockWebview(): MockWebview {
  const webview: MockWebview = {
    html: '',
    posted: [],
    handlers: [],
    postMessage(msg) {
      webview.posted.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(handler) {
      webview.handlers.push(handler);
      return {
        dispose() {
          const index = webview.handlers.indexOf(handler);
          if (index >= 0) {
            webview.handlers.splice(index, 1);
          }
        }
      };
    }
  };
  return webview;
}

function webviewSends(webview: MockWebview, message: unknown): void {
  for (const handler of [...webview.handlers]) {
    handler(message);
  }
}

function lastStateMessage(webview: MockWebview): {
  type: string;
  state: Record<string, unknown>;
} {
  const states = webview.posted.filter((msg): msg is { type: string; state: Record<string, unknown> } =>
    typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'state'
  );
  assert.ok(states.length > 0, 'Expected at least one state message');
  return states.at(-1)!;
}

function makePrdDraft(overrides: Partial<PrdWizardPrdGenerateResult> = {}): PrdWizardPrdGenerateResult {
  return {
    prdText: [
      '# RalphDex PRD',
      '',
      '## Overview',
      'Improve PRD-first generation flow.',
      '',
      '## Goals',
      'Generate atomic starter tasks after readiness.',
      '',
      '## Scope',
      'Wizard and full workflow gating.',
      '',
      '## Non-Goals',
      'No doctrine auto-mutation.',
      '',
      '## Success Criteria',
      'No task generation before readiness.',
      '',
      '## Work Area A',
      'Implement readiness analysis and artifact persistence.',
      '',
      '## Validation',
      'Run npm run validate and focused tests.'
    ].join('\n'),
    ...overrides
  };
}

function makePlan(prdText: string, taskIds: string[]): TaskGenerationPlanArtifact {
  return {
    schemaVersion: 1,
    kind: 'taskGenerationPlan',
    generatedAt: '2026-05-07T00:00:00.000Z',
    status: 'draft',
    prdHash: hashText(prdText),
    prdTitle: 'RalphDex PRD',
    readinessScore: 92,
    workAreas: ['Work Area A'],
    generatedTaskIds: taskIds,
    warnings: [],
    blockedWorkAreas: []
  };
}

function makeTaskGenerationResult(prdText: string, overrides: Partial<PrdWizardTaskGenerateResult> = {}): PrdWizardTaskGenerateResult {
  return {
    tasks: [
      {
        id: 'T1',
        title: 'Persist PRD readiness artifacts',
        status: 'todo',
        acceptance: ['latest-prd-readiness.json is written after readiness analysis'],
        validation: 'npm run validate'
      },
      {
        id: 'T2',
        title: 'Gate task generation on readiness blockers',
        status: 'todo',
        dependsOn: ['T1'],
        acceptance: ['task generation refuses blocker PRDs'],
        validation: 'npm run test -- prd'
      }
    ],
    planArtifact: makePlan(prdText, ['T1', 'T2']),
    ...overrides
  };
}

test('PrdCreationWizardHost renders the six-step PRD-first flow', () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => makePrdDraft(),
    generateTasks: async (input) => makeTaskGenerationResult(input.prdText),
    writeDraft: async () => ({ filesWritten: [] })
  });

  assert.match(webview.html, /Project Shape/);
  assert.match(webview.html, /Draft Generation/);
  assert.match(webview.html, /PRD Review/);
  assert.match(webview.html, /Task Generation/);
  assert.match(webview.html, /Task Review/);
  assert.match(webview.html, /Confirm Write/);
  host.dispose();
});

test('PRD generation is PRD-only and does not populate tasks until task generation runs', async () => {
  const webview = makeMockWebview();
  const prdDraft = makePrdDraft();
  let taskGenerationCalls = 0;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => prdDraft,
    generateTasks: async (input) => {
      taskGenerationCalls += 1;
      return makeTaskGenerationResult(input.prdText);
    },
    writeDraft: async () => ({ filesWritten: [] })
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Ship readiness-first generation.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const stateAfterPrd = lastStateMessage(webview).state as {
    draft: PrdWizardDraftBundle;
    step: number;
    tasksStale: boolean;
  };
  assert.equal(stateAfterPrd.step, 3);
  assert.equal(stateAfterPrd.draft.tasks.length, 0);
  assert.equal(stateAfterPrd.tasksStale, true);
  assert.equal(taskGenerationCalls, 0);

  webviewSends(webview, { type: 'generate-tasks' });
  await new Promise((resolve) => setImmediate(resolve));

  const stateAfterTasks = lastStateMessage(webview).state as {
    draft: PrdWizardDraftBundle;
    step: number;
    tasksStale: boolean;
  };
  assert.equal(stateAfterTasks.step, 5);
  assert.equal(stateAfterTasks.draft.tasks.length, 2);
  assert.equal(stateAfterTasks.tasksStale, false);
  assert.equal(taskGenerationCalls, 1);
  host.dispose();
});

test('task generation is blocked when PRD readiness has blockers', async () => {
  const webview = makeMockWebview();
  let taskGenerationCalls = 0;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => ({
      prdText: '# Placeholder\n\n## Overview\nTODO\n'
    }),
    generateTasks: async (_input) => {
      taskGenerationCalls += 1;
      return makeTaskGenerationResult('# Placeholder\n\n## Overview\nTODO\n');
    },
    writeDraft: async () => ({ filesWritten: [] })
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate draft.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'generate-tasks' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as { warning?: string };
  assert.equal(taskGenerationCalls, 0);
  assert.match(state.warning ?? '', /readiness has blockers/i);
  host.dispose();
});

test('wizard marks generated tasks stale when PRD text changes after task generation', async () => {
  const webview = makeMockWebview();
  const prdDraft = makePrdDraft();
  let writeCount = 0;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => prdDraft,
    generateTasks: async (input) => makeTaskGenerationResult(input.prdText),
    writeDraft: async () => {
      writeCount += 1;
      return { filesWritten: [] };
    }
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate and edit.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'generate-tasks' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'update-draft-prd-text', value: `${prdDraft.prdText}\n\n## Extra\nNew section` });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    tasksStale: boolean;
    warning?: string;
    taskGenerationMessage?: string;
  };
  assert.equal(state.tasksStale, true);
  assert.equal(writeCount, 0);
  assert.match(state.warning ?? '', /stale/i);
  assert.match(state.taskGenerationMessage ?? '', /regenerate tasks/i);
  host.dispose();
});

test('epic-level starter tasks block confirm-write', async () => {
  const webview = makeMockWebview();
  let writeCount = 0;
  const prdDraft = makePrdDraft();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => prdDraft,
    generateTasks: async (_input) => ({
      tasks: [
        {
          id: 'T1',
          title: 'Implement dashboard',
          status: 'todo',
          acceptance: ['Improve UI'],
          validation: 'npm run validate'
        }
      ],
      planArtifact: makePlan(prdDraft.prdText, ['T1'])
    }),
    writeDraft: async () => {
      writeCount += 1;
      return { filesWritten: [] };
    }
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate epic task.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'generate-tasks' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as { warning?: string };
  assert.equal(writeCount, 0);
  assert.match(state.warning ?? '', /task readiness blockers/i);
  host.dispose();
});

test('confirm-write forwards a draft task-generation plan to persistence without pre-approving it', async () => {
  const webview = makeMockWebview();
  const prdDraft = makePrdDraft();
  let capturedPlanStatus: string | undefined;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => prdDraft,
    generateTasks: async (input) => makeTaskGenerationResult(input.prdText),
    writeDraft: async (draft) => {
      capturedPlanStatus = draft.taskGenerationPlan?.status;
      return { filesWritten: [] };
    }
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Confirm write draft status.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'generate-tasks' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(capturedPlanStatus, 'draft');
  host.dispose();
});

test('generatePrdDraft failure falls back to PRD-only fallback draft', async () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => {
      throw new ProjectGenerationError('Provider unavailable');
    },
    generateTasks: async (input) => makeTaskGenerationResult(input.prdText),
    writeDraft: async () => ({ filesWritten: [] })
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Fallback test.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    generationState?: string;
    draft: PrdWizardDraftBundle;
  };
  assert.equal(state.generationState, 'fallback');
  assert.equal(state.draft.tasks.length, 0);
  host.dispose();
});

test('generatePrdDraft provider failure yields a readiness-shaped fallback draft without failed operation state', async () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generatePrdDraft: async () => {
      throw new ProjectGenerationError('Provider rate limit: resets later.');
    },
    generateTasks: async (input) => makeTaskGenerationResult(input.prdText),
    writeDraft: async () => ({ filesWritten: [] })
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Build a file-backed markdown notes app for local use.' });
  webviewSends(webview, { type: 'update-field', field: 'techStack', value: 'TypeScript and local filesystem storage.' });
  webviewSends(webview, { type: 'update-field', field: 'outOfScope', value: 'Cloud sync and team collaboration.' });
  webviewSends(webview, { type: 'generate-prd-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    generationState?: string;
    operationStatus?: string;
    operationMessage?: string;
    draft: PrdWizardDraftBundle;
    prdReviewFindings?: Array<{ kind: string; message: string }>;
  };
  assert.equal(state.generationState, 'fallback');
  assert.equal(state.operationStatus, 'succeeded');
  assert.match(state.operationMessage ?? '', /Fallback draft generated/i);
  assert.match(state.draft.prdText, /^# Product \/ project brief/m);
  assert.match(state.draft.prdText, /## Goals/);
  assert.match(state.draft.prdText, /## Scope/);
  assert.match(state.draft.prdText, /## Non-Goals/);
  assert.match(state.draft.prdText, /## Success Criteria/);
  assert.match(state.draft.prdText, /## Initial Work Area/);
  assert.equal(
    state.prdReviewFindings?.some((finding) => finding.kind === 'blocker'),
    false
  );
  host.dispose();
});
