import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildWebviewUiHtml } from '../../src/webview/reactWebviewHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';

function defaultState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    agentLanes: [],
    settingsSurface: null,
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    prdExists: true,
    ...overrides
  };
}

function mockWebview() {
  return {
    cspSource: 'vscode-webview://test-source',
    asWebviewUri(uri: vscode.Uri) {
      return {
        toString() {
          return `vscode-resource:${uri.fsPath.replace(/\\/g, '/')}`;
        }
      };
    }
  } as unknown as vscode.Webview;
}

function createExtensionRootWithWebviewAssets(): vscode.Uri {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-webview-assets-'));
  const assetDir = path.join(root, 'out', 'webview-ui');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, 'main.js'), '/* bundled js */', 'utf8');
  fs.writeFileSync(path.join(assetDir, 'main.css'), '/* bundled css */', 'utf8');
  return vscode.Uri.file(root);
}

test('buildWebviewUiHtml emits nonce-gated local React script and stylesheet assets', () => {
  const extensionUri = createExtensionRootWithWebviewAssets();
  const html = buildWebviewUiHtml({
    mode: 'dashboard',
    state: defaultState(),
    nonce: 'abc123',
    webview: mockWebview(),
    extensionUri
  });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('out/webview-ui/main.js'));
  assert.ok(html.includes('out/webview-ui/main.css'));
  assert.match(html, /<script nonce="abc123" src="vscode-resource:.*\/out\/webview-ui\/main\.js" defer><\/script>/);
  assert.match(html, /<link nonce="abc123" rel="stylesheet" href="vscode-resource:.*\/out\/webview-ui\/main\.css">/);
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("style-src vscode-webview://test-source 'nonce-abc123'"));
  assert.ok(html.includes("script-src 'nonce-abc123'"));
  assert.ok(!html.includes('https://'));
  assert.ok(!html.includes('http://'));
});

test('buildWebviewUiHtml serializes initial dashboard state for the React shell', () => {
  const extensionUri = createExtensionRootWithWebviewAssets();
  const html = buildWebviewUiHtml({
    mode: 'dashboard',
    state: defaultState({ workspaceName: 'dashboard-ws', prdExists: false }),
    nonce: 'dash-nonce',
    webview: mockWebview(),
    extensionUri
  });

  assert.ok(html.includes('id="ralph-webview-bootstrap"'));
  assert.ok(html.includes('"mode":"dashboard"'));
  assert.ok(html.includes('"workspaceName":"dashboard-ws"'));
  assert.ok(html.includes('"prdExists":false'));
  assert.ok(html.includes('data-ralph-mode="dashboard"'));
});

test('buildWebviewUiHtml serializes initial sidebar state for the React shell', () => {
  const extensionUri = createExtensionRootWithWebviewAssets();
  const html = buildWebviewUiHtml({
    mode: 'sidebar',
    state: defaultState({ workspaceName: 'sidebar-ws', loopState: 'running' }),
    nonce: 'side-nonce',
    webview: mockWebview(),
    extensionUri
  });

  assert.ok(html.includes('"mode":"sidebar"'));
  assert.ok(html.includes('"workspaceName":"sidebar-ws"'));
  assert.ok(html.includes('"loopState":"running"'));
  assert.ok(html.includes('data-ralph-mode="sidebar"'));
});

test('buildWebviewUiHtml escapes serialized state from script-breaking markup', () => {
  const extensionUri = createExtensionRootWithWebviewAssets();
  const html = buildWebviewUiHtml({
    mode: 'dashboard',
    state: defaultState({ workspaceName: '</script><script>alert(1)</script>' }),
    nonce: 'safe-nonce',
    webview: mockWebview(),
    extensionUri
  });

  assert.equal((html.match(/<\/script>/g) ?? []).length, 2, 'only bootstrap and bundle script tags should close');
  assert.ok(!html.includes('</script><script>alert(1)</script>'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
});

test('buildWebviewUiHtml falls back to legacy HTML when debug webview assets are missing', () => {
  const extensionUri = vscode.Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-missing-webview-assets-')));
  const html = buildWebviewUiHtml({
    mode: 'sidebar',
    state: defaultState({ workspaceName: 'fallback-ws' }),
    nonce: 'fallback-nonce',
    webview: mockWebview(),
    extensionUri,
    fallbackHtml: (state, nonce) => `<html data-fallback="${nonce}"><body>${state.workspaceName}</body></html>`
  });

  assert.equal(html, '<html data-fallback="fallback-nonce"><body>fallback-ws</body></html>');
});
