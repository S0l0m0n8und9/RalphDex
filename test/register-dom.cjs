// Headless DOM harness for webview-ui component tests.
//
// Loaded via `node --require ./test/register-dom.cjs` for the `test/ui` suite only
// (see the `test:ui` npm script). It installs a jsdom-backed DOM on the Node global
// so React components can be rendered with @testing-library/react and driven with
// real events — without launching a browser or a VS Code Extension Development Host.
//
// It also mocks `acquireVsCodeApi()` (the single seam in src/webview-ui/bridge/vscode.ts)
// so tests can assert the messages a component posts back to the extension host. The
// host side of that contract is covered separately by test/webview/messageBridge.test.ts.

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

const { window } = dom;

global.window = window;
global.document = window.document;

// Expose the DOM constructors libraries reach for via bare globals (Event, MessageEvent,
// Node, HTMLElement, getComputedStyle, ...). Skip anything Node already defines so we
// never clobber the runtime's own globals (fetch, URL, queueMicrotask, etc.).
const SKIP = new Set(['window', 'document', 'navigator', 'global', 'globalThis']);
for (const key of Object.getOwnPropertyNames(window)) {
  if (SKIP.has(key) || key in global) continue;
  try {
    const value = window[key];
    if (typeof value === 'function' || (value && typeof value === 'object')) {
      global[key] = value;
    }
  } catch {
    // Some window properties are throwing getters (e.g. layout-dependent); ignore them.
  }
}

// `navigator` is a read-only getter on the Node 24 global, so a plain assignment throws.
// Prefer jsdom's navigator (user-event reads navigator.clipboard) but fall back silently.
if (!('navigator' in global)) {
  global.navigator = window.navigator;
} else {
  try {
    Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  } catch {
    // Keep Node's navigator if it cannot be redefined; jsdom's is still on window.navigator.
  }
}

// ---------------------------------------------------------------------------
// VS Code webview API mock
// ---------------------------------------------------------------------------

const webviewApiState = { posted: [], persisted: undefined };

const webviewApi = {
  postMessage(message) {
    webviewApiState.posted.push(message);
  },
  getState() {
    return webviewApiState.persisted;
  },
  setState(value) {
    webviewApiState.persisted = value;
    return value;
  }
};

global.acquireVsCodeApi = function acquireVsCodeApi() {
  return webviewApi;
};

global.__RALPH_WEBVIEW_API__ = {
  /** Messages posted to the host since the last reset, in order. */
  get posted() {
    return webviewApiState.posted;
  },
  /** The latest message of a given `type`, or undefined. */
  lastPosted(type) {
    for (let i = webviewApiState.posted.length - 1; i >= 0; i--) {
      const msg = webviewApiState.posted[i];
      if (msg && typeof msg === 'object' && msg.type === type) return msg;
    }
    return undefined;
  },
  reset() {
    webviewApiState.posted.length = 0;
    webviewApiState.persisted = undefined;
  }
};
