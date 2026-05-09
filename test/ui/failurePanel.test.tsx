import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FailurePanel } from '../../src/webview-ui/components/panels/FailurePanel';
import type { DiagnosisSection } from '../../src/webview/dashboardSnapshot';

const diagnosis: DiagnosisSection = {
  taskId: 'T-42', taskTitle: 'Fix the webhook',
  category: 'validation_mismatch', confidence: 'high',
  summary: 'Retry-After header uses wrong unit.',
  suggestedAction: 'Convert delay to seconds.',
  retryPromptAddendum: null, recoveryAttemptCount: 2,
  remediationSummary: null, failureAnalysisPath: '/path/to/analysis',
  recoveryStatePath: null,
};

test('FailurePanel shows task ID, category, and confidence', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} onCommand={() => {}} />);
  assert.ok(html.includes('T-42'));
  assert.ok(html.includes('validation mismatch'));
  assert.ok(html.includes('high'));
});

test('FailurePanel shows summary and suggested action', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} onCommand={() => {}} />);
  assert.ok(html.includes('Retry-After header uses wrong unit.'));
  assert.ok(html.includes('Convert delay to seconds.'));
});

test('FailurePanel shows attempt count', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} onCommand={() => {}} />);
  assert.ok(html.includes('2'));
});

test('FailurePanel shows open-artifact button when failureAnalysisPath is present', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} onCommand={() => {}} />);
  assert.ok(html.includes('Open artifact'));
});

test('FailurePanel hides open-artifact button when failureAnalysisPath is null', () => {
  const html = renderToStaticMarkup(
    <FailurePanel diagnosis={{ ...diagnosis, failureAnalysisPath: null }} onOpenArtifact={() => {}} onCommand={() => {}} />
  );
  assert.ok(!html.includes('Open artifact'));
});
