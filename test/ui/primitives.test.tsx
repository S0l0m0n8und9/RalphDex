import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card, StatusPill, Btn, formatBytes } from '../../src/webview-ui/components/primitives/Card';

test('Card renders children and title', () => {
  const html = renderToStaticMarkup(
    <Card title="My Section"><span>content</span></Card>
  );
  assert.ok(html.includes('MY SECTION'), 'title should be uppercased');
  assert.ok(html.includes('content'));
});

test('Card renders accent top border when accent=true', () => {
  const html = renderToStaticMarkup(<Card accent>body</Card>);
  assert.ok(html.includes('var(--accent)'), 'accent border should reference accent token');
});

test('StatusPill applies running kind styles', () => {
  const html = renderToStaticMarkup(<StatusPill kind="running">Loop running</StatusPill>);
  assert.ok(html.includes('Loop running'));
  assert.ok(html.includes('var(--ok)'));
});

test('StatusPill applies bad kind styles', () => {
  const html = renderToStaticMarkup(<StatusPill kind="bad">error</StatusPill>);
  assert.ok(html.includes('var(--bad)'));
});

test('Btn renders label and applies primary variant', () => {
  const html = renderToStaticMarkup(<Btn variant="primary">Start loop</Btn>);
  assert.ok(html.includes('Start loop'));
  assert.ok(html.includes('var(--accent)'));
});

test('Btn renders danger variant', () => {
  const html = renderToStaticMarkup(<Btn variant="danger">Stop</Btn>);
  assert.ok(html.includes('var(--bad)'));
});

test('formatBytes formats bytes correctly', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(8400), '8.2 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});
