import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timeline } from '../../src/webview-ui/components/panels/Timeline';
import type { RalphDashboardIteration } from '../../src/ui/uiTypes';

const iter = (n: number, classification: RalphDashboardIteration['classification']): RalphDashboardIteration => ({
  iteration: n, taskId: 'T-1', taskTitle: 'Do thing', classification,
  stopReason: null, artifactDir: `/artifacts/${n}`,
});

test('Timeline renders nothing when iterations array is empty', () => {
  const html = renderToStaticMarkup(<Timeline iterations={[]} onOpenArtifact={() => {}} />);
  assert.equal(html, '');
});

test('Timeline renders a row for each iteration', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'complete'), iter(2, 'partial_progress')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('#1'));
  assert.ok(html.includes('#2'));
});

test('Timeline applies ok color for complete classification', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'complete')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('var(--ok)'));
});

test('Timeline applies bad color for failed classification', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'failed')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('var(--bad)'));
});

test('Timeline shows task ID and classification text', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(5, 'no_progress')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('T-1'));
  assert.ok(html.includes('no progress'));
});
