import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthCell } from '../../src/webview-ui/components/hero/HealthCell';

test('HealthCell renders label, value, and sub', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Progress" value="14/27" sub="51% done" />
  );
  assert.ok(html.includes('PROGRESS'));
  assert.ok(html.includes('14/27'));
  assert.ok(html.includes('51% done'));
});

test('HealthCell renders progress bar when bar prop given', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Iteration" value="7/12" sub="58% of cap" bar={58} />
  );
  assert.ok(html.includes('width:'), 'should include bar width');
  assert.ok(html.includes('58%'), 'bar should be 58%');
});

test('HealthCell applies warn tone color', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Attention" value="3" sub="3 blocked" tone="warn" />
  );
  assert.ok(html.includes('var(--warn)'));
});
