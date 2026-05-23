import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyOptimisticWizardMessage } from '../../src/webview-ui/App';
import { PrdCreationWizard, PRD_WIZARD_STEPS } from '../../src/webview-ui/components/PrdCreationWizard';
import type { WizardState } from '../../src/webview/prdCreationWizardTypes';

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    mode: 'new',
    step: 1,
    projectType: 'web-app',
    objective: 'Build a local notes app.',
    techStack: 'TypeScript',
    outOfScope: 'Cloud sync',
    existingConventions: 'Use local files.',
    draft: null,
    prdReadiness: null,
    taskGenerationStatus: 'idle',
    taskGenerationMessage: null,
    tasksStale: true,
    generationState: 'idle',
    generationMessage: null,
    operationStatus: 'idle',
    operationMessage: null,
    warning: null,
    error: null,
    currentPrdPreview: null,
    comparisonSummary: null,
    prdReviewFindings: [],
    taskReviewFindings: [],
    writeSummary: null,
    paths: {
      prdPath: '.ralph/prd.md',
      tasksPath: '.ralph/tasks.json'
    },
    ...overrides
  };
}

function renderWizard(state: WizardState, busy = false): string {
  return renderToStaticMarkup(
    <PrdCreationWizard
      state={state}
      busy={busy}
      onMessage={() => {}}
    />
  );
}

test('PRD wizard React view renders provider-failure fallback as a reviewable draft state', () => {
  const html = renderWizard(makeState({
    step: 3,
    draft: {
      prdText: '# Product / project brief\n\n## Goals\nBuild useful local notes.\n\n## Scope\nLocal markdown notes.',
      prdHash: 'fallback-hash',
      tasks: []
    },
    generationState: 'fallback',
    generationMessage: 'Generation fell back to a bootstrap draft. Provider rate limit.',
    operationStatus: 'succeeded',
    operationMessage: 'Fallback draft generated after provider failure. Provider rate limit.',
    prdReviewFindings: []
  }));

  assert.ok(html.includes('Fallback Draft'));
  assert.ok(html.includes('Fallback draft generated after provider failure'));
  assert.ok(!html.includes('Action Failed'));
  assert.ok(html.includes('Product / project brief'));
});

test('PRD wizard React view keeps PRD blockers advisory for task generation', () => {
  const html = renderWizard(makeState({
    step: 4,
    draft: {
      prdText: '# Placeholder\n\n## Overview\nTODO',
      prdHash: 'blocked-hash',
      tasks: []
    },
    prdReviewFindings: [
      { kind: 'blocker', message: 'Add concrete goals and success criteria.' }
    ],
    taskGenerationMessage: 'No tasks generated yet.'
  }));

  assert.ok(html.includes('Add concrete goals and success criteria.'));
  assert.doesNotMatch(html, /data-action="generate-tasks"[^>]*disabled/);
});

test('PRD wizard React view keeps PRD blockers advisory for confirm write', () => {
  const html = renderWizard(makeState({
    step: 6,
    draft: {
      prdText: '# Placeholder\n\n## Overview\nTODO',
      prdHash: 'blocked-hash',
      tasks: [{
        id: 'T1',
        title: 'Implement local note creation',
        status: 'todo',
        acceptance: ['A note can be created from the editor'],
        validation: 'npm run validate'
      }]
    },
    prdReviewFindings: [
      { kind: 'blocker', message: 'Add concrete goals and success criteria.' }
    ],
    taskReviewFindings: [],
    tasksStale: false
  }));

  assert.ok(html.includes('Add concrete goals and success criteria.'));
  assert.doesNotMatch(html, /data-action="confirm-write"[^>]*disabled/);
});

test('PRD wizard React view marks tasks stale after PRD edits and blocks confirm write', () => {
  const html = renderWizard(makeState({
    step: 6,
    draft: {
      prdText: '# PRD\n\n## Goals\nChanged after tasks.',
      prdHash: 'changed-hash',
      tasks: [{
        id: 'T1',
        title: 'Implement local note creation',
        status: 'todo',
        acceptance: ['A note can be created'],
        validation: 'npm run validate'
      }]
    },
    tasksStale: true,
    taskGenerationMessage: 'PRD changed after task generation. Regenerate tasks before writing.'
  }));

  assert.ok(html.includes('Tasks are stale because PRD text changed after generation.'));
  assert.match(html, /data-action="confirm-write"[^>]*disabled/);
});

test('PRD wizard React view exposes editable task review fields', () => {
  const html = renderWizard(makeState({
    step: 5,
    draft: {
      prdText: '# PRD',
      prdHash: 'prd-hash',
      tasks: [{
        id: 'T1',
        title: 'Implement local note creation',
        status: 'todo',
        dependsOn: ['T0'],
        notes: 'Keep this local-first.',
        acceptance: ['A note can be created', 'A note can be opened'],
        validation: 'npm run validate',
        tier: 'medium'
      }]
    },
    tasksStale: false,
    taskGenerationStatus: 'generated'
  }));

  assert.ok(html.includes('data-action="task-title"'));
  assert.ok(html.includes('value="Implement local note creation"'));
  assert.ok(html.includes('data-action="task-dependencies"'));
  assert.ok(html.includes('data-action="task-notes"'));
  assert.ok(html.includes('data-action="task-acceptance"'));
  assert.ok(html.includes('value="medium" selected'));
});

test('PRD wizard React view disables confirm write for empty or invalid task drafts', () => {
  const noTasks = renderWizard(makeState({
    step: 6,
    draft: {
      prdText: '# PRD\n\n## Goals\nBuild local notes.\n\n## Scope\nLocal files.\n\n## Non-Goals\nCloud sync.\n\n## Success Criteria\nCan create notes.\n\n## Initial Work Area\nEditor.',
      prdHash: 'ready-hash',
      tasks: []
    },
    tasksStale: false
  }));

  const invalidTask = renderWizard(makeState({
    step: 6,
    draft: {
      prdText: '# PRD\n\n## Goals\nBuild local notes.\n\n## Scope\nLocal files.\n\n## Non-Goals\nCloud sync.\n\n## Success Criteria\nCan create notes.\n\n## Initial Work Area\nEditor.',
      prdHash: 'ready-hash',
      tasks: [{
        id: 'T1',
        title: '',
        status: 'todo',
        acceptance: [],
        validation: ''
      }]
    },
    taskReviewFindings: [
      { kind: 'blocker', message: 'T1 needs a title.' }
    ],
    tasksStale: false
  }));

  assert.match(noTasks, /data-action="confirm-write"[^>]*disabled/);
  assert.match(invalidTask, /data-action="confirm-write"[^>]*disabled/);
  assert.ok(invalidTask.includes('T1 needs a title.'));
});

test('PRD wizard applies step navigation optimistically before host state returns', () => {
  const next = applyOptimisticWizardMessage(makeState({ step: 1 }), { type: 'set-step', step: 4 });

  assert.equal(next.step, 4);
});

test('PRD wizard internal navigation uses numeric step values', () => {
  assert.deepEqual(PRD_WIZARD_STEPS, [1, 2, 3, 4, 5, 6]);
  assert.ok(PRD_WIZARD_STEPS.every((step) => typeof step === 'number'));
});
