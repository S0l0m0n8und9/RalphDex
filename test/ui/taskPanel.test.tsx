import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskPanel } from '../../src/webview-ui/components/tasks/TaskPanel';
import type { RalphDashboardTask } from '../../src/ui/uiTypes';

const task = (id: string, status: RalphDashboardTask['status']): RalphDashboardTask => ({
  id, title: `Task ${id}`, status, isCurrent: false, priority: 'normal',
  childIds: [], dependsOn: [],
});

test('TaskPanel renders active tasks separately from done tasks', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[
      task('T-1', 'in_progress'),
      task('T-2', 'todo'),
      task('T-3', 'done'),
    ]} />
  );
  assert.ok(html.includes('T-1'));
  assert.ok(html.includes('T-2'));
  assert.ok(html.includes('T-3'));
  assert.ok(html.includes('Active (2)'));
  assert.ok(html.includes('Completed (1)'));
});

test('TaskPanel shows blocked status in warn color', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'blocked'), blocker: 'Waiting on Redis' }]} />
  );
  assert.ok(html.includes('var(--rdx-warn)'));
});

test('TaskPanel marks current task with accent indicator', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'in_progress'), isCurrent: true }]} />
  );
  assert.ok(html.includes('current'));
});

test('TaskPanel renders empty state when no tasks', () => {
  const html = renderToStaticMarkup(<TaskPanel tasks={[]} />);
  assert.ok(html.includes('No tasks'));
});
