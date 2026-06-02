import assert from 'node:assert/strict';
import test from 'node:test';
import { WebviewSmokeDiagnostics } from '../../src/webview/webviewSmokeDiagnostics';

test('WebviewSmokeDiagnostics resolves a waiter when a matching surface reports ready', async () => {
  const diagnostics = new WebviewSmokeDiagnostics();
  const ready = diagnostics.waitForReady('dashboard', 250);

  diagnostics.recordReady('dashboard', {
    mode: 'dashboard',
    mountedText: 'Ralphdex dashboard mounted',
    timestamp: '2026-06-02T00:00:00.000Z'
  });

  const result = await ready;
  assert.equal(result.mode, 'dashboard');
  assert.equal(result.mountedText, 'Ralphdex dashboard mounted');
});

test('WebviewSmokeDiagnostics rejects with surface diagnostics when readiness times out', async () => {
  const diagnostics = new WebviewSmokeDiagnostics();
  diagnostics.recordReady('dashboard', {
    mode: 'dashboard',
    mountedText: 'Ralphdex dashboard mounted',
    timestamp: '2026-06-02T00:00:00.000Z'
  });

  await assert.rejects(
    diagnostics.waitForReady('prd-wizard', 1),
    /Timed out waiting for prd-wizard webview readiness.*dashboard/s
  );
});
