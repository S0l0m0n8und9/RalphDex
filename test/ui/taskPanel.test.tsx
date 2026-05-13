import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskPanel } from '../../src/webview-ui/components/tasks/TaskPanel';
import type { RalphDashboardTask, RalphDashboardTaskSeedingState } from '../../src/ui/uiTypes';

const task = (id: string, status: RalphDashboardTask['status']): RalphDashboardTask => ({
  id, title: `Task ${id}`, status, isCurrent: false, priority: 'normal',
  childIds: [], dependsOn: [],
});

const idleSeeding: RalphDashboardTaskSeedingState = {
  phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null,
};

const noop = () => {};

test('TaskPanel renders active tasks separately from done tasks', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[
      task('T-1', 'in_progress'),
      task('T-2', 'todo'),
      task('T-3', 'done'),
    ]} taskSeeding={idleSeeding} onSeedTasks={noop} />
  );
  assert.ok(html.includes('T-1'));
  assert.ok(html.includes('T-2'));
  assert.ok(html.includes('T-3'));
  assert.ok(html.includes('Active (2)'));
  assert.ok(html.includes('Completed (1)'));
});

test('TaskPanel shows blocked status in warn color', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'blocked'), blocker: 'Waiting on Redis' }]} taskSeeding={idleSeeding} onSeedTasks={noop} />
  );
  assert.ok(html.includes('var(--warn)'));
});

test('TaskPanel marks current task with accent indicator', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'in_progress'), isCurrent: true }]} taskSeeding={idleSeeding} onSeedTasks={noop} />
  );
  assert.ok(html.includes('current'));
});

test('TaskPanel renders empty state when no tasks', () => {
  const html = renderToStaticMarkup(<TaskPanel tasks={[]} taskSeeding={idleSeeding} onSeedTasks={noop} />);
  assert.ok(html.includes('No tasks'));
});

test('TaskPanel renders seed card in empty state', () => {
  const html = renderToStaticMarkup(<TaskPanel tasks={[]} taskSeeding={idleSeeding} onSeedTasks={noop} />);
  assert.ok(html.includes('Seed from Epic'));
});

test('TaskPanel renders seed button icon without stringifying React nodes', () => {
  const html = renderToStaticMarkup(<TaskPanel tasks={[]} taskSeeding={idleSeeding} onSeedTasks={noop} />);
  assert.ok(html.includes('Generate tasks'));
  assert.ok(!html.includes('[object Object]'));
});

test('TaskPanel renders seed card when tasks exist', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[task('T-1', 'todo')]} taskSeeding={idleSeeding} onSeedTasks={noop} />
  );
  assert.ok(html.includes('Seed from Epic'));
});

test('TaskPanel shows seeding success message', () => {
  const successSeeding: RalphDashboardTaskSeedingState = {
    phase: 'success', requestText: 'add auth', createdTaskCount: 5, message: 'Tasks created', artifactPath: null,
  };
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[]} taskSeeding={successSeeding} onSeedTasks={noop} />
  );
  assert.ok(html.includes('Tasks created'));
});
