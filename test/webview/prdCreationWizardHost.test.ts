import assert from 'node:assert/strict';
import test from 'node:test';
import * as path from 'node:path';
import { ProjectGenerationError } from '../../src/ralph/projectGenerator';
import {
  PrdCreationWizardHost,
  type PrdWizardDraftBundle,
  type PrdWizardGenerateResult,
  type PrdWizardWriteResult
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

function makeGeneratedDraft(overrides: Partial<PrdWizardGenerateResult> = {}): PrdWizardGenerateResult {
  return {
    prdText: '# Title\n\n## Overview\n\nGenerated preview.\n',
    tasks: [
      { id: 'T1', title: 'Draft first task', status: 'todo' }
    ],
    recommendedSkills: [
      { name: 'testing', description: 'Testing discipline', rationale: 'Verify changes.' }
    ],
    ...overrides
  };
}

function lastStateMessage(webview: MockWebview): { type: string; state: { warning?: string; writeSummary?: { filesWritten: string[] } } } {
  const states = webview.posted.filter((msg): msg is { type: string; state: { warning?: string; writeSummary?: { filesWritten: string[] } } } =>
    typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'state'
  );
  assert.ok(states.length > 0, 'Expected at least one state message');
  return states.at(-1)!;
}

test('PrdCreationWizardHost: generate falls back to bootstrap draft on generation failure', async () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => {
      throw new ProjectGenerationError('CLI unavailable');
    },
    writeDraft: async () => {
      throw new Error('write should not run in this test');
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, {
    type: 'update-field',
    field: 'objective',
    value: 'Build a deterministic wizard'
  });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    warning?: string;
    draft: PrdWizardDraftBundle;
  };
  assert.match(state.warning ?? '', /CLI unavailable/);
  assert.match(state.draft.prdText, /Build a deterministic wizard/);
  assert.equal(state.draft.tasks.length, 2, 'fallback should use bootstrap seed tasks');

  host.dispose();
});

test('PrdCreationWizardHost: confirm-write posts a per-file write summary', async () => {
  const webview = makeMockWebview();
  let writeInput: PrdWizardDraftBundle | null = null;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft(),
    writeDraft: async (draft): Promise<PrdWizardWriteResult> => {
      writeInput = draft;
      return {
        filesWritten: [
          path.join('workspace', '.ralph', 'prd.md'),
          path.join('workspace', '.ralph', 'tasks.json'),
          path.join('workspace', '.ralph', 'recommended-skills.json')
        ]
      };
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, {
    type: 'update-field',
    field: 'objective',
    value: 'Build a deterministic wizard'
  });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(writeInput, 'confirm-write should pass the current draft bundle to writeDraft');
  const writtenDraft = writeInput as PrdWizardDraftBundle;
  assert.equal(writtenDraft.tasks[0]?.title, 'Draft first task');
  assert.deepEqual(lastStateMessage(webview).state.writeSummary?.filesWritten, [
    path.join('workspace', '.ralph', 'prd.md'),
    path.join('workspace', '.ralph', 'tasks.json'),
    path.join('workspace', '.ralph', 'recommended-skills.json')
  ]);

  host.dispose();
});
