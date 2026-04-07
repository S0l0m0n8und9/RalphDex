/**
 * Host abstraction layer for VS Code APIs consumed by the Ralph iteration engine.
 *
 * These interfaces mirror the subset of VS Code API surface that iterationEngine,
 * iterationPreparation, and registerCommands depend on, expressed without any
 * import of the `vscode` module. A concrete VS Code implementation (the real
 * extension host) satisfies these interfaces structurally. A stdout-backed shim
 * (T71.2) will implement them for headless CLI execution.
 */

/**
 * Minimal output channel — append a line of text to the host's output surface.
 */
export interface IOutputChannel {
  appendLine(value: string): void;
}

/**
 * Progress token passed into long-running operations.
 * Mirrors `vscode.Progress<{ message?: string; increment?: number }>`.
 */
export interface IProgress {
  report(value: { message?: string; increment?: number }): void;
}

/**
 * Read-only slice of workspace configuration.
 * Mirrors the `get` and `inspect` overloads on `vscode.WorkspaceConfiguration`.
 */
export interface IWorkspaceConfiguration {
  get<T>(section: string): T | undefined;
  get<T>(section: string, defaultValue: T): T;
  inspect<T>(section: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined;
}

/**
 * Thin command executor — invoke a registered command by ID.
 * Mirrors `vscode.commands.executeCommand`.
 */
export interface ICommandExecutor {
  executeCommand<T = unknown>(command: string, ...args: unknown[]): Thenable<T>;
}

/**
 * Aggregate host interface injected into engine components that need VS Code
 * services. Implementations: VS Code extension host (real), stdout shim (T71.2).
 */
export interface IVSCodeHost {
  outputChannel: IOutputChannel;
  progress: IProgress;
  configuration: IWorkspaceConfiguration;
  commands: ICommandExecutor;
}
