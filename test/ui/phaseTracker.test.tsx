import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhaseTracker } from '../../src/webview-ui/components/hero/PhaseTracker';

test('PhaseTracker renders all 7 phases', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase="execute" />);
  for (const p of ['inspect','select','prompt','execute','verify','classify','persist']) {
    assert.ok(html.includes(p), `missing phase: ${p}`);
  }
});

test('PhaseTracker marks active phase with accent color', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase="execute" />);
  assert.ok(html.includes('var(--accent)'), 'active phase should use accent color');
});

test('PhaseTracker renders nothing when phase is null', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase={null} />);
  assert.equal(html, '');
});
