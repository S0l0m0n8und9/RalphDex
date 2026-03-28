export interface VscodeMessageCall {
  message: string;
  items: string[];
}

export interface VscodeStubState {
  configuration: Record<string, unknown>;
  workspaceFolders: unknown[];
  isTrusted: boolean;
  availableCommands: string[];
  clipboardText: string;
  infoMessages: VscodeMessageCall[];
  warningMessages: VscodeMessageCall[];
  errorMessages: VscodeMessageCall[];
  shownDocuments: Array<string | null>;
  executedCommands: Array<{ command: string; args: unknown[] }>;
  inputBoxValue?: string;
  messageChoice?: string;
}

export interface VscodeTestHarness {
  state: VscodeStubState;
  reset(): void;
  setConfiguration(configuration: Record<string, unknown>): void;
  setWorkspaceFolders(workspaceFolders: unknown[]): void;
  setAvailableCommands(commands: string[]): void;
  setInputBoxValue(value: string | undefined): void;
  setMessageChoice(value: string | undefined): void;
  getOutputLines(name: string): string[];
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
