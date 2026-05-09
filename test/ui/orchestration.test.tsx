import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Orchestration } from '../../src/webview-ui/components/orchestration/Orchestration';
import type { DashboardCostSection } from '../../src/webview/dashboardSnapshot';

const costWithCache: DashboardCostSection = {
  executionCostUsd: 3.17, diagnosticCostUsd: 0.06,
  promptCacheStats: { staticPrefixBytes: 8400, cacheHit: true },
  hasAnyCostData: true,
};

const costNoCache: DashboardCostSection = {
  executionCostUsd: null, diagnosticCostUsd: null,
  promptCacheStats: null,
  hasAnyCostData: false,
};

test('Orchestration renders nothing when promptCacheStats is null', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costNoCache} />);
  assert.equal(html, '');
});

test('Orchestration renders cache prefix size when stats present', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costWithCache} />);
  assert.ok(html.includes('8.2 KB'), 'should format 8400 bytes as 8.2 KB');
});

test('Orchestration shows cache hit indicator', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costWithCache} />);
  assert.ok(html.includes('cache hit'));
});

test('Orchestration shows cache miss when cacheHit is false', () => {
  const html = renderToStaticMarkup(
    <Orchestration cost={{ ...costWithCache, promptCacheStats: { staticPrefixBytes: 5000, cacheHit: false } }} />
  );
  assert.ok(html.includes('cache miss'));
});
