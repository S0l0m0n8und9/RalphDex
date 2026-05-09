import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentLanes } from '../../src/webview-ui/components/panels/AgentLanes';
import type { RalphAgentLaneState } from '../../src/ui/uiTypes';

const lane = (id: string, phase: RalphAgentLaneState['phase']): RalphAgentLaneState =>
  ({ agentId: id, phase, iteration: 3, message: undefined });

test('AgentLanes renders nothing when lanes array is empty', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[]} />);
  assert.equal(html, '');
});

test('AgentLanes renders a row for each lane', () => {
  const html = renderToStaticMarkup(
    <AgentLanes lanes={[lane('impl-01', 'execute'), lane('review-01', 'verify')]} />
  );
  assert.ok(html.includes('impl-01'));
  assert.ok(html.includes('review-01'));
});

test('AgentLanes applies reviewer color for agentId containing "reviewer"', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[lane('reviewer-01', 'verify')]} />);
  assert.ok(html.includes('var(--ok)'));
});

test('AgentLanes applies watchdog color for agentId containing "watchdog"', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[lane('watchdog', 'inspect')]} />);
  assert.ok(html.includes('var(--warn)'));
});
