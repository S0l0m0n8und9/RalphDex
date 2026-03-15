const fs = require('node:fs');
const Module = require('node:module');

const state = {
  configuration: {},
  workspaceFolders: [],
  isTrusted: true,
  availableCommands: [],
  clipboardText: '',
  infoMessages: [],
  warningMessages: [],
  errorMessages: [],
  shownDocuments: [],
  executedCommands: [],
  inputBoxValue: undefined,
  messageChoice: undefined
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
  state.inputBoxValue = undefined;
  state.messageChoice = undefined;
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

const vscodeStub = {
  ProgressLocation: {
    Notification: 15
  },
  Uri: {
    file(fsPath) {
      return { fsPath };
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
        }
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
      return task({ report() {} });
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
