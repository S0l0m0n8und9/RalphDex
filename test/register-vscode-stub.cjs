const fs = require('node:fs');
const Module = require('node:module');

const state = {
  configuration: {},
  updatedSettings: {},
  workspaceFolders: [],
  isTrusted: true,
  availableCommands: [],
  clipboardText: '',
  infoMessages: [],
  warningMessages: [],
  errorMessages: [],
  shownDocuments: [],
  executedCommands: [],
  createdWebviewPanels: [],
  inputBoxValue: undefined,
  messageChoice: undefined,
  quickPickSelections: []
};

function reset() {
  state.configuration = {};
  state.workspaceFolders = [];
  state.isTrusted = true;
  state.availableCommands = [];
  state.clipboardText = '';
  state.infoMessages = [];
  state.warningMessages = [];
  state.errorMessages = [];
  state.shownDocuments = [];
  state.executedCommands = [];
  state.createdWebviewPanels = [];
  state.inputBoxValue = undefined;
  state.messageChoice = undefined;
  state.updatedSettings = {};
  state.quickPickSelections = [];
  outputChannels.clear();
  registeredCommands.clear();
}

function nextMessageChoice(items) {
  if (state.messageChoice && items.includes(state.messageChoice)) {
    return state.messageChoice;
  }

  return undefined;
}

const outputChannels = new Map();
const registeredCommands = new Map();

class StubEventEmitter {
  constructor() {
    this._listeners = [];
  }
  get event() {
    const self = this;
    const fn = (listener) => {
      self._listeners.push(listener);
      return { dispose() { const idx = self._listeners.indexOf(listener); if (idx >= 0) self._listeners.splice(idx, 1); } };
    };
    return fn;
  }
  fire(data) {
    for (const listener of this._listeners) listener(data);
  }
  dispose() {
    this._listeners = [];
  }
}

const vscodeStub = {
  EventEmitter: StubEventEmitter,
  ProgressLocation: {
    Notification: 15
  },
  ViewColumn: {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },
  Uri: {
    file(fsPath) {
      return { fsPath };
    }
  },
  RelativePattern: class RelativePattern {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  env: {
    clipboard: {
      async writeText(value) {
        state.clipboardText = String(value);
      }
    },
    openExternal: async () => true
  },
  commands: {
    registerCommand(command, handler) {
      registeredCommands.set(command, handler);
      return {
        dispose() {
          registeredCommands.delete(command);
        }
      };
    },
    async getCommands() {
      return Array.from(new Set([...state.availableCommands, ...registeredCommands.keys()]));
    },
    async executeCommand(command, ...args) {
      state.executedCommands.push({ command, args });
      if (registeredCommands.has(command)) {
        return registeredCommands.get(command)(...args);
      }
      return undefined;
    }
  },
  workspace: {
    get isTrusted() {
      return state.isTrusted;
    },
    set isTrusted(value) {
      state.isTrusted = Boolean(value);
    },
    get workspaceFolders() {
      return state.workspaceFolders;
    },
    set workspaceFolders(value) {
      state.workspaceFolders = Array.isArray(value) ? value : [];
    },
    getConfiguration() {
      return {
        get(key) {
          return state.configuration[key];
        },
        inspect(key) {
          const value = state.configuration[key];
          return { key, workspaceValue: value };
        },
        update(key, value) {
          state.configuration[key] = value;
          state.updatedSettings[key] = value;
          return Promise.resolve();
        }
      };
    },
    createFileSystemWatcher() {
      return {
        onDidChange() { return { dispose() {} }; },
        onDidCreate() { return { dispose() {} }; },
        onDidDelete() { return { dispose() {} }; },
        dispose() {}
      };
    },
    async openTextDocument(uriOrPath) {
      const fsPath = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
      const text = fs.existsSync(fsPath) ? fs.readFileSync(fsPath, 'utf8') : '';
      return {
        uri: { fsPath },
        fileName: fsPath,
        getText: () => text
      };
    }
  },
  window: {
    createOutputChannel(name) {
      if (!outputChannels.has(name)) {
        const lines = [];
        outputChannels.set(name, {
          name,
          lines,
          appendLine(value) {
            lines.push(String(value));
          },
          append(value) {
            lines.push(String(value));
          },
          show() {},
          dispose() {}
        });
      }

      return outputChannels.get(name);
    },
    async withProgress(_options, task) {
      return task({ report() {} }, { isCancellationRequested: false, onCancellationRequested() { return { dispose() {} }; } });
    },
    async showInputBox() {
      return state.inputBoxValue;
    },
    async showInformationMessage(message, ...items) {
      state.infoMessages.push({ message, items });
      return nextMessageChoice(items);
    },
    async showWarningMessage(message, ...items) {
      state.warningMessages.push({ message, items });
      return nextMessageChoice(items);
    },
    async showErrorMessage(message, ...items) {
      state.errorMessages.push({ message, items });
      return nextMessageChoice(items);
    },
    async showTextDocument(document) {
      state.shownDocuments.push(document.fileName ?? document.uri?.fsPath ?? null);
      return document;
    },
    async showQuickPick() {
      if (state.quickPickSelections.length > 0) {
        return state.quickPickSelections.shift();
      }
      return undefined;
    },
    createStatusBarItem() {
      return {
        text: '',
        tooltip: '',
        command: undefined,
        show() {},
        hide() {},
        dispose() {}
      };
    },
    registerWebviewViewProvider() {
      return { dispose() {} };
    },
    createWebviewPanel(_viewType, _title, _showOptions, _options) {
      const webview = {
        html: '',
        onDidReceiveMessage(_handler) { return { dispose() {} }; },
        async postMessage() { return true; }
      };
      const panelRecord = {
        viewType: _viewType,
        title: _title,
        html: webview.html
      };
      state.createdWebviewPanels.push(panelRecord);
      Object.defineProperty(webview, 'html', {
        get() {
          return panelRecord.html;
        },
        set(value) {
          panelRecord.html = value;
        }
      });
      return {
        webview,
        reveal() {},
        onDidDispose(_callback) { return { dispose() {} }; },
        dispose() {}
      };
    }
  }
};

global.__RALPH_VSCODE_STUB__ = {
  state,
  outputChannels,
  reset,
  setConfiguration(configuration) {
    state.configuration = { ...configuration };
  },
  setWorkspaceFolders(workspaceFolders) {
    state.workspaceFolders = workspaceFolders;
  },
  setAvailableCommands(commands) {
    state.availableCommands = Array.isArray(commands) ? [...commands] : [];
  },
  setInputBoxValue(value) {
    state.inputBoxValue = value;
  },
  setMessageChoice(value) {
    state.messageChoice = value;
  },
  setQuickPickSelections(selections) {
    state.quickPickSelections = Array.isArray(selections) ? [...selections] : [];
  },
  getOutputLines(name) {
    return outputChannels.get(name)?.lines ?? [];
  }
};

reset();

try {
  require('../out-test/test/support/processTestHarness.js').installProcessTestHarness();
} catch {
  // compile:tests emits the harness before the test runner loads this stub
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }

  return originalLoad.call(this, request, parent, isMain);
};
