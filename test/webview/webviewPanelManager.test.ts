import assert from 'node:assert/strict';
import test from 'node:test';
import { WebviewPanelManager } from '../../src/webview/WebviewPanelManager';
import type { WebviewPanelFactory } from '../../src/webview/WebviewPanelManager';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

type DisposeListener = () => void;

interface MockPanel {
  revealed: boolean;
  revealedColumn: number | undefined;
  disposed: boolean;
  disposeListeners: DisposeListener[];
  reveal(column?: number): void;
  onDidDispose(listener: DisposeListener): { dispose(): void };
  dispose(): void;
}

function makeMockPanel(): MockPanel {
  const panel: MockPanel = {
    revealed: false,
    revealedColumn: undefined,
    disposed: false,
    disposeListeners: [],
    reveal(column) {
      panel.revealed = true;
      panel.revealedColumn = column;
    },
    onDidDispose(listener) {
      panel.disposeListeners.push(listener);
      return {
        dispose() {
          const idx = panel.disposeListeners.indexOf(listener);
          if (idx >= 0) panel.disposeListeners.splice(idx, 1);
        }
      };
    },
    dispose() {
      if (!panel.disposed) {
        panel.disposed = true;
        for (const fn of panel.disposeListeners) fn();
      }
    }
  };
  return panel;
}

function makeFactory(panel: MockPanel): WebviewPanelFactory {
  return {
    createWebviewPanel(_viewType, _title, _showOptions, _options) {
      // Cast to satisfy the generic vscode.WebviewPanel interface; tests
      // only need the surface used by WebviewPanelManager.
      return panel as unknown as import('vscode').WebviewPanel;
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('WebviewPanelManager: createOrReveal creates a new panel', () => {
  const mockPanel = makeMockPanel();
  const manager = new WebviewPanelManager(makeFactory(mockPanel));

  const panel = manager.createOrReveal('main', { viewType: 'test', title: 'Test' });

  assert.ok(panel, 'should return a panel');
  assert.equal(manager.get('main'), panel, 'panel should be accessible by name');
});

test('WebviewPanelManager: createOrReveal reveals existing panel instead of creating a duplicate', () => {
  let createCount = 0;
  const mockPanel = makeMockPanel();
  const factory: WebviewPanelFactory = {
    createWebviewPanel(_vt, _title, _col, _opts) {
      createCount++;
      return mockPanel as unknown as import('vscode').WebviewPanel;
    }
  };
  const manager = new WebviewPanelManager(factory);

  manager.createOrReveal('main', { viewType: 'test', title: 'Test' });
  manager.createOrReveal('main', { viewType: 'test', title: 'Test' });

  assert.equal(createCount, 1, 'factory should be called only once');
  assert.ok(mockPanel.revealed, 'existing panel should be revealed on second call');
});

test('WebviewPanelManager: disposePanel removes panel from registry and disposes it', () => {
  const mockPanel = makeMockPanel();
  const manager = new WebviewPanelManager(makeFactory(mockPanel));

  manager.createOrReveal('main', { viewType: 'test', title: 'Test' });
  manager.disposePanel('main');

  assert.ok(mockPanel.disposed, 'panel should be disposed');
  assert.equal(manager.get('main'), undefined, 'registry should be empty after dispose');
});

test('WebviewPanelManager: panel removed from registry when VS Code closes it', () => {
  const mockPanel = makeMockPanel();
  const manager = new WebviewPanelManager(makeFactory(mockPanel));

  manager.createOrReveal('main', { viewType: 'test', title: 'Test' });
  assert.ok(manager.get('main'), 'panel should be in registry');

  // Simulate VS Code closing the panel (fires onDidDispose listeners).
  mockPanel.dispose();

  assert.equal(manager.get('main'), undefined, 'registry entry should be removed after VS Code disposes panel');
});

test('WebviewPanelManager: dispose cleans up all open panels', () => {
  const panelA = makeMockPanel();
  const panelB = makeMockPanel();
  let callCount = 0;

  const factory: WebviewPanelFactory = {
    createWebviewPanel(_vt, _title, _col, _opts) {
      callCount++;
      return (callCount === 1 ? panelA : panelB) as unknown as import('vscode').WebviewPanel;
    }
  };
  const manager = new WebviewPanelManager(factory);

  manager.createOrReveal('a', { viewType: 'test', title: 'A' });
  manager.createOrReveal('b', { viewType: 'test', title: 'B' });

  manager.dispose();

  assert.ok(panelA.disposed, 'panel A should be disposed');
  assert.ok(panelB.disposed, 'panel B should be disposed');
  assert.equal(manager.get('a'), undefined, 'registry should be empty after dispose');
  assert.equal(manager.get('b'), undefined, 'registry should be empty after dispose');
});

test('WebviewPanelManager: disposePanel on unknown name is a no-op', () => {
  const manager = new WebviewPanelManager({
    createWebviewPanel() { throw new Error('should not be called'); }
  });

  assert.doesNotThrow(() => manager.disposePanel('nonexistent'));
});

test('WebviewPanelManager: multiple named panels are tracked independently', () => {
  const panelA = makeMockPanel();
  const panelB = makeMockPanel();
  let callCount = 0;

  const factory: WebviewPanelFactory = {
    createWebviewPanel(_vt, _title, _col, _opts) {
      callCount++;
      return (callCount === 1 ? panelA : panelB) as unknown as import('vscode').WebviewPanel;
    }
  };
  const manager = new WebviewPanelManager(factory);

  manager.createOrReveal('a', { viewType: 'test', title: 'A' });
  manager.createOrReveal('b', { viewType: 'test', title: 'B' });

  manager.disposePanel('a');

  assert.ok(panelA.disposed, 'panel A should be disposed');
  assert.ok(!panelB.disposed, 'panel B should still be open');
  assert.equal(manager.get('a'), undefined);
  assert.ok(manager.get('b'));
});
