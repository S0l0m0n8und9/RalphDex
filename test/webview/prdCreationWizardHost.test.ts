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
    ...overrides
  };
}

function lastStateMessage(webview: MockWebview): {
  type: string;
  state: {
    step?: number;
    warning?: string;
    generationState?: string;
    generationMessage?: string | null;
    prdReviewFindings?: Array<{ kind: string; message: string }>;
    taskReviewFindings?: Array<{ kind: string; message: string }>;
    writeSummary?: { filesWritten: string[] };
  };
} {
  const states = webview.posted.filter((msg): msg is {
    type: string;
    state: {
      step?: number;
      warning?: string;
      generationState?: string;
      generationMessage?: string | null;
      prdReviewFindings?: Array<{ kind: string; message: string }>;
      taskReviewFindings?: Array<{ kind: string; message: string }>;
      writeSummary?: { filesWritten: string[] };
    };
  } =>
    typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'state'
  );
  assert.ok(states.length > 0, 'Expected at least one state message');
  return states.at(-1)!;
}

test('PrdCreationWizardHost: renders the 5-step wizard without config controls', () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft(),
    writeDraft: async () => ({ filesWritten: [] })
  });

  assert.match(webview.html, /Project Shape/);
  assert.match(webview.html, /Draft Generation/);
  assert.match(webview.html, /PRD Review/);
  assert.match(webview.html, /Task Review/);
  assert.match(webview.html, /Confirm Write/);
  assert.doesNotMatch(webview.html, /Config & Skills/);
  assert.doesNotMatch(webview.html, /No configuration recommendations are available/i);
  assert.doesNotMatch(webview.html, /toggle-config-selection/);
  assert.doesNotMatch(webview.html, /configSelections/);

  const state = lastStateMessage(webview).state;
  assert.equal(state.step, 1);

  host.dispose();
});

test('PrdCreationWizardHost: generate composes structured intake fields into the existing draft contract', async () => {
  const webview = makeMockWebview();
  let generateInput: {
    mode: 'new' | 'regenerate';
    projectType: string;
    objective: string;
    constraints: string;
    nonGoals: string;
  } | null = null;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async (input) => {
      generateInput = input;
      return makeGeneratedDraft();
    },
    writeDraft: async () => ({ filesWritten: [] })
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'projectType', value: 'service' });
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Ship a deterministic API gateway.' });
  webviewSends(webview, { type: 'update-field', field: 'techStack', value: 'TypeScript, VS Code extension host' });
  webviewSends(webview, { type: 'update-field', field: 'outOfScope', value: 'Do not add telemetry or hosted services.' });
  webviewSends(webview, { type: 'update-field', field: 'existingConventions', value: 'Keep file-backed artifacts and deterministic validation.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(generateInput, {
    mode: 'new',
    projectType: 'service',
    objective: 'Ship a deterministic API gateway.',
    constraints: [
      'Tech stack:',
      'TypeScript, VS Code extension host',
      '',
      'Existing conventions:',
      'Keep file-backed artifacts and deterministic validation.'
    ].join('\n'),
    nonGoals: 'Do not add telemetry or hosted services.'
  });

  host.dispose();
});

test('PrdCreationWizardHost: replaceContext exposes structured intake state for regenerate flows', () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft(),
    writeDraft: async () => ({ filesWritten: [] })
  });

  webview.posted.length = 0;
  host.replaceContext({
    initialMode: 'regenerate',
    initialProjectType: 'library',
    initialObjective: 'Refresh the published SDK guide.',
    initialConstraints: 'Use TypeScript only.',
    initialNonGoals: 'No API redesign.'
  });

  const state = lastStateMessage(webview).state as {
    mode: 'new' | 'regenerate';
    projectType: string;
    objective: string;
    techStack: string;
    outOfScope: string;
    existingConventions: string;
  };
  assert.equal(state.mode, 'regenerate');
  assert.equal(state.projectType, 'library');
  assert.equal(state.objective, 'Refresh the published SDK guide.');
  assert.equal(state.techStack, 'Use TypeScript only.');
  assert.equal(state.outOfScope, 'No API redesign.');
  assert.equal(state.existingConventions, '');

  host.dispose();
});

test('PrdCreationWizardHost: regenerate context keeps the current PRD as comparison state', () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft(),
    writeDraft: async () => ({ filesWritten: [] })
  });

  webview.posted.length = 0;
  host.replaceContext({
    initialMode: 'regenerate',
    initialObjective: 'Use the current PRD as source material.',
    initialPrdPreview: '# Existing PRD\n\nCurrent repo-owned content.\n'
  });

  const state = lastStateMessage(webview).state as {
    mode: 'new' | 'regenerate';
    objective: string;
    currentPrdPreview: string | null;
    draft: PrdWizardDraftBundle | null;
  };
  assert.equal(state.mode, 'regenerate');
  assert.equal(state.objective, 'Use the current PRD as source material.');
  assert.equal(state.currentPrdPreview, '# Existing PRD\n\nCurrent repo-owned content.\n');
  assert.equal(state.draft?.prdText, '# Existing PRD\n\nCurrent repo-owned content.\n');

  host.dispose();
});

test('PrdCreationWizardHost: regenerate state includes a current-vs-draft comparison summary', async () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'regenerate',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    initialObjective: 'Refine the existing PRD.',
    initialPrdPreview: '# Existing PRD\n\nCurrent repo-owned content.\n',
    generateDraft: async () => makeGeneratedDraft({
      prdText: '# Generated PRD\n\nFresh generated content.\n'
    }),
    writeDraft: async () => ({ filesWritten: [] })
  });

  let state = lastStateMessage(webview).state as {
    comparisonSummary?: string | null;
  };
  assert.equal(state.comparisonSummary, 'Draft matches the current PRD.');

  webview.posted.length = 0;
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  state = lastStateMessage(webview).state as {
    comparisonSummary?: string | null;
  };
  assert.match(state.comparisonSummary ?? '', /changed lines vs current PRD/i);

  webviewSends(webview, { type: 'update-draft-prd-text', value: '# Existing PRD\n\nCurrent repo-owned content.\n' });
  await new Promise((resolve) => setImmediate(resolve));

  state = lastStateMessage(webview).state as {
    comparisonSummary?: string | null;
  };
  assert.equal(state.comparisonSummary, 'Draft matches the current PRD.');

  host.dispose();
});

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
    generationState?: string;
    generationMessage?: string | null;
    draft: PrdWizardDraftBundle;
  };
  assert.equal(state.generationState, 'fallback');
  assert.match(state.generationMessage ?? '', /CLI unavailable/);
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
          path.join('workspace', '.ralph', 'tasks.json')
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
    path.join('workspace', '.ralph', 'tasks.json')
  ]);

  host.dispose();
});

test('PrdCreationWizardHost: documentation fallback draft stays documentation-only and marks tasks with documentation mode', async () => {
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
    writeDraft: async () => ({ filesWritten: [] })
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'projectType', value: 'documentation' });
  webviewSends(webview, {
    type: 'update-field',
    field: 'objective',
    value: 'Document the repository layout and operator workflows.'
  });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    draft: PrdWizardDraftBundle;
  };
  assert.match(state.draft.prdText, /Documentation Scope/i);
  assert.match(state.draft.prdText, /Do not change repo code or behavior/i);
  assert.equal(state.draft.tasks.length, 2);
  assert.equal(state.draft.tasks[0]?.mode, 'documentation');
  assert.equal(state.draft.tasks[1]?.mode, 'documentation');

  host.dispose();
});

test('PrdCreationWizardHost: generation state distinguishes generated, weak, and fallback drafts', async () => {
  const webview = makeMockWebview();
  let nextResult: PrdWizardGenerateResult | Error = makeGeneratedDraft();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => {
      if (nextResult instanceof Error) {
        throw nextResult;
      }
      return nextResult;
    },
    writeDraft: async () => ({ filesWritten: [] })
  });

  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Clarify generation state.' });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  let state = lastStateMessage(webview).state;
  assert.equal(state.generationState, 'generated');
  assert.match(state.generationMessage ?? '', /provider-backed draft generated successfully/i);

  nextResult = makeGeneratedDraft({ taskCountWarning: 'Generated 9 tasks; review and trim the backlog before writing.' });
  webview.posted.length = 0;
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  state = lastStateMessage(webview).state;
  assert.equal(state.generationState, 'weak');
  assert.match(state.generationMessage ?? '', /Generated 9 tasks/i);

  nextResult = new ProjectGenerationError('Provider timed out');
  webview.posted.length = 0;
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  state = lastStateMessage(webview).state;
  assert.equal(state.generationState, 'fallback');
  assert.match(state.generationMessage ?? '', /fell back to a bootstrap draft/i);
  assert.match(state.generationMessage ?? '', /Provider timed out/i);

  host.dispose();
});

test('PrdCreationWizardHost: manual draft edits persist through later steps and confirm-write', async () => {
  const webview = makeMockWebview();
  let writeInput: PrdWizardDraftBundle | null = null;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'regenerate',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    initialPrdPreview: '# Existing PRD\n\nCurrent repo-owned content.\n',
    generateDraft: async () => makeGeneratedDraft({
      prdText: '# Generated PRD\n\nFresh generated content.\n',
      tasks: [
        { id: 'T1', title: 'Draft first task', status: 'todo' }
      ]
    }),
    writeDraft: async (draft) => {
      writeInput = draft;
      return { filesWritten: [path.join('workspace', '.ralph', 'prd.md')] };
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Refresh the PRD from the existing draft.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'update-draft-prd-text', value: '# Edited PRD\n\nOperator-owned changes.\n' });
  webviewSends(webview, { type: 'set-step', step: 4 });
  webviewSends(webview, { type: 'update-task-tier', taskId: 'T1', tier: 'complex' });
  webviewSends(webview, { type: 'set-step', step: 5 });
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(writeInput, 'confirm-write should pass the current draft bundle to writeDraft');
  const writtenDraft = writeInput as PrdWizardDraftBundle;
  assert.equal(writtenDraft.prdText, '# Edited PRD\n\nOperator-owned changes.\n');
  assert.equal(writtenDraft.tasks[0]?.tier, 'complex');

  const state = lastStateMessage(webview).state as {
    step: number;
    currentPrdPreview: string | null;
    draft: PrdWizardDraftBundle | null;
  };
  assert.equal(state.step, 5);
  assert.equal(state.currentPrdPreview, '# Existing PRD\n\nCurrent repo-owned content.\n');
  assert.equal(state.draft?.prdText, '# Edited PRD\n\nOperator-owned changes.\n');

  host.dispose();
});

test('PrdCreationWizardHost: task review supports title edits, reordering, and deletion before confirm-write', async () => {
  const webview = makeMockWebview();
  let writeInput: PrdWizardDraftBundle | null = null;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft({
      tasks: [
        { id: 'T1', title: 'First generated task', status: 'todo' },
        { id: 'T2', title: 'Second generated task', status: 'todo' },
        { id: 'T3', title: 'Third generated task', status: 'todo' }
      ]
    }),
    writeDraft: async (draft) => {
      writeInput = draft;
      return { filesWritten: [path.join('workspace', '.ralph', 'tasks.json')] };
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate editable tasks.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'update-task-title', taskId: 'T2', title: 'Operator revised second task' });
  webviewSends(webview, { type: 'move-task', taskId: 'T3', direction: 'up' });
  webviewSends(webview, { type: 'delete-task', taskId: 'T1' });
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(writeInput, 'confirm-write should pass the reviewed tasks to writeDraft');
  const writtenDraft = writeInput as PrdWizardDraftBundle;
  assert.deepEqual(
    writtenDraft.tasks.map((task) => ({ id: task.id, title: task.title })),
    [
      { id: 'T3', title: 'Third generated task' },
      { id: 'T2', title: 'Operator revised second task' }
    ]
  );

  host.dispose();
});

test('PrdCreationWizardHost: confirm-write blocks empty or invalid reviewed task lists', async () => {
  const webview = makeMockWebview();
  let writeCount = 0;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft({
      tasks: [
        { id: 'T1', title: 'First generated task', status: 'todo' },
        { id: 'T2', title: 'Second generated task', status: 'todo' }
      ]
    }),
    writeDraft: async () => {
      writeCount += 1;
      return { filesWritten: [path.join('workspace', '.ralph', 'tasks.json')] };
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate editable tasks.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));
  webviewSends(webview, { type: 'update-task-title', taskId: 'T1', title: '   ' });
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  let state = lastStateMessage(webview).state as {
    warning?: string;
    draft: PrdWizardDraftBundle;
  };
  assert.equal(writeCount, 0, 'blank task titles must block confirm-write');
  assert.match(state.warning ?? '', /must have a non-empty title/i);

  webviewSends(webview, { type: 'update-task-title', taskId: 'T1', title: 'Recovered title' });
  webviewSends(webview, { type: 'delete-task', taskId: 'T1' });
  webviewSends(webview, { type: 'delete-task', taskId: 'T2' });
  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  state = lastStateMessage(webview).state as {
    warning?: string;
    draft: PrdWizardDraftBundle;
  };
  assert.equal(writeCount, 0, 'empty task lists must block confirm-write');
  assert.equal(state.draft.tasks.length, 0);
  assert.match(state.warning ?? '', /at least one task/i);

  host.dispose();
});

test('PrdCreationWizardHost: emits PRD and task review findings without blocking non-durable warnings', async () => {
  const webview = makeMockWebview();
  let writeCount = 0;

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft({
      prdText: [
        'TODO placeholder title',
        '',
        '## Overview',
        '',
        'TBD',
        '',
        '## Requirements',
        '',
        'Improve stuff soon.'
      ].join('\n'),
      tasks: [
        {
          id: 'T1',
          title: 'Improve thing',
          status: 'todo',
          validation: 'Test it'
        },
        {
          id: 'T2',
          title: 'Improve thing now',
          status: 'todo',
          validation: 'Check it works',
          dependencies: ['Depends on backend']
        }
      ]
    }),
    writeDraft: async () => {
      writeCount += 1;
      return { filesWritten: [path.join('workspace', '.ralph', 'prd.md')] };
    }
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate findings-rich output.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const generatedState = lastStateMessage(webview).state as {
    prdReviewFindings?: Array<{ kind: string; message: string }>;
    taskReviewFindings?: Array<{ kind: string; message: string }>;
  };
  const prdMessages = (generatedState.prdReviewFindings ?? []).map((finding) => finding.message);
  const taskMessages = (generatedState.taskReviewFindings ?? []).map((finding) => finding.message);

  assert.ok(prdMessages.some((message) => /title/i.test(message)), 'expected a title finding');
  assert.ok(prdMessages.some((message) => /missing.*success criteria/i.test(message)), 'expected a required section finding');
  assert.ok(prdMessages.some((message) => /placeholder/i.test(message)), 'expected a placeholder finding');
  assert.ok(prdMessages.some((message) => /thin/i.test(message)), 'expected a thin section finding');
  assert.ok(prdMessages.some((message) => /vague/i.test(message)), 'expected a vague wording finding');
  assert.ok(taskMessages.some((message) => /duplicate/i.test(message)), 'expected a duplicate-title finding');
  assert.ok(taskMessages.some((message) => /vague/i.test(message)), 'expected a vague-title finding');
  assert.ok(taskMessages.some((message) => /validation/i.test(message)), 'expected a validation finding');
  assert.ok(taskMessages.some((message) => /dependenc/i.test(message)), 'expected a dependency finding');

  webviewSends(webview, { type: 'confirm-write' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(writeCount, 1, 'non-blocking review findings should not prevent writing');
  assert.equal(lastStateMessage(webview).state.warning, null);
  assert.match(webview.html, /PRD Findings/);
  assert.match(webview.html, /Task Findings/);

  host.dispose();
});

test('PrdCreationWizardHost: findings avoid false positives for valid commands, task ids, and punctuated headings', async () => {
  const webview = makeMockWebview();

  const host = new PrdCreationWizardHost({
    webview: webview as unknown as import('vscode').Webview,
    initialMode: 'new',
    initialPaths: {
      prdPath: path.join('workspace', '.ralph', 'prd.md'),
      tasksPath: path.join('workspace', '.ralph', 'tasks.json')
    },
    generateDraft: async () => makeGeneratedDraft({
      prdText: [
        '# Customer Portal Rewrite',
        '',
        '## 1. Overview:',
        '',
        'Operators can review workflow state and approve blocked work from one panel.',
        '',
        '## Requirements:',
        '',
        'The extension keeps durable files authoritative and exposes review-first generation.',
        '',
        '## Success Criteria:',
        '',
        'Operators can review and write the PRD and starter backlog without leaving the wizard.'
      ].join('\n'),
      tasks: [
        {
          id: 'T1',
          title: 'Implement durable PRD review checks',
          status: 'todo',
          validation: 'npm test'
        },
        {
          id: 'T2',
          title: 'Render task review findings inline',
          status: 'todo',
          validation: 'npm run validate',
          dependsOn: ['T1']
        }
      ]
    }),
    writeDraft: async () => ({ filesWritten: [path.join('workspace', '.ralph', 'prd.md')] })
  });

  webview.posted.length = 0;
  webviewSends(webview, { type: 'update-field', field: 'objective', value: 'Generate realistic review findings.' });
  webviewSends(webview, { type: 'generate-draft' });
  await new Promise((resolve) => setImmediate(resolve));

  const state = lastStateMessage(webview).state as {
    prdReviewFindings?: Array<{ kind: string; message: string }>;
    taskReviewFindings?: Array<{ kind: string; message: string }>;
  };
  const prdMessages = (state.prdReviewFindings ?? []).map((finding) => finding.message);
  const taskMessages = (state.taskReviewFindings ?? []).map((finding) => finding.message);

  assert.ok(!prdMessages.some((message) => /missing.*success criteria/i.test(message)));
  assert.ok(!taskMessages.some((message) => /validation/i.test(message)));
  assert.ok(!taskMessages.some((message) => /dependenc/i.test(message)));

  host.dispose();
});
