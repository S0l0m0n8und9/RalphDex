export interface VscodeMessageCall {
  message: string;
  items: string[];
}

export interface VscodeStubState {
  configuration: Record<string, unknown>;
  updatedSettings: Record<string, unknown>;
  workspaceFolders: unknown[];
  isTrusted: boolean;
  availableCommands: string[];
  clipboardText: string;
  infoMessages: VscodeMessageCall[];
  warningMessages: VscodeMessageCall[];
  errorMessages: VscodeMessageCall[];
  shownDocuments: Array<string | null>;
  executedCommands: Array<{ command: string; args: unknown[] }>;
  createdWebviewPanels: Array<{ viewType: string; title: string; html: string }>;
  registeredTreeDataProviders: Array<{ viewId: string; provider: unknown }>;
  createdFileSystemWatchers: Array<{
    pattern: unknown;
    changeListeners: unknown[];
    createListeners: unknown[];
    deleteListeners: unknown[];
  }>;
  inputBoxValue?: string;
  messageChoice?: string;
  quickPickSelections: unknown[];
}

export interface VscodeTestHarness {
  state: VscodeStubState;
  reset(): void;
  setConfiguration(configuration: Record<string, unknown>): void;
  setWorkspaceFolders(workspaceFolders: unknown[]): void;
  setAvailableCommands(commands: string[]): void;
  setInputBoxValue(value: string | undefined): void;
  setMessageChoice(value: string | undefined): void;
  setQuickPickSelections(selections: unknown[]): void;
  getOutputLines(name: string): string[];
  fireFileSystemWatcher(index: number, event: 'change' | 'create' | 'delete', uri?: unknown): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __RALPH_VSCODE_STUB__: VscodeTestHarness | undefined;
}

export function vscodeTestHarness(): VscodeTestHarness {
  if (!globalThis.__RALPH_VSCODE_STUB__) {
    throw new Error('VS Code test harness is not available. Did you run tests through the npm test script?');
  }

  return globalThis.__RALPH_VSCODE_STUB__;
}
