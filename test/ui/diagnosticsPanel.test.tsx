import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagnosticsPanel } from '../../src/webview-ui/components/panels/DiagnosticsPanel';

test('DiagnosticsPanel renders each diagnostic message', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[
      { severity: 'ok',   message: 'Git tree clean' },
      { severity: 'warn', message: 'No validation command' },
      { severity: 'bad',  message: 'Provider not found' },
    ]} />
  );
  assert.ok(html.includes('Git tree clean'));
  assert.ok(html.includes('No validation command'));
  assert.ok(html.includes('Provider not found'));
});

test('DiagnosticsPanel applies ok color for ok severity', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[{ severity: 'ok', message: 'All good' }]} />
  );
  assert.ok(html.includes('var(--ok)'));
});

test('DiagnosticsPanel applies bad color for bad severity', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[{ severity: 'bad', message: 'Error' }]} />
  );
  assert.ok(html.includes('var(--bad)'));
});
