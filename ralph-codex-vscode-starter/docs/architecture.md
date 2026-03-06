# Architecture

## Entry Point

- `src/extension.ts` creates the output channel logger and delegates all behavior to `registerCommands(...)`.
- Activation is command-based through `package.json` activation events.

## Module Boundaries

- `src/commands/registerCommands.ts`: command orchestration, progress reporting, user messages, and top-level error handling.
- `src/commands/workspaceSupport.ts`: workspace trust gating plus IDE-command environment inspection.
- `src/codex/`: handoff and execution strategies for `clipboard`, `ideCommand`, and `cliExec`.
- `src/config/`: defaults, setting types, and VS Code configuration reads.
- `src/prompt/promptBuilder.ts`: prompt kind selection, file naming, and prompt body construction.
- `src/ralph/`: path resolution, task-file parsing, and runtime state persistence.
- `src/services/`: logging, child-process execution, Codex CLI support inspection, workspace scanning, and package-manifest inspection.

## Prompt And Execution Flow

1. A command calls `preparePrompt()` in `src/commands/registerCommands.ts`.
2. Trusted write or execution commands are gated before the extension mutates files or runs Codex CLI.
3. `preparePrompt()` reads config, ensures the Ralph workspace exists, and loads PRD, progress, tasks, and runtime state through `RalphStateManager`.
4. `preparePrompt()` logs and reports any missing `.ralph` paths it had to recreate.
5. `scanWorkspace()` gathers repo-root facts and `package.json` lifecycle commands.
6. `buildPrompt()` writes either a `bootstrap-###.prompt.md` or `iteration-###.prompt.md` file under `.ralph/prompts/`.
7. Handoff commands pass that prompt to either the clipboard strategy or the IDE-command strategy.
8. CLI execution uses `CliExecCodexStrategy`, which runs `codex exec`, sends the prompt over stdin, writes `.last-message.md`, and saves a transcript.

## State Model

- `prdPath`, `progressPath`, and `ralphTaskFilePath` are configurable workspace-relative or absolute paths.
- `.ralph/state.json` is fixed and stores runtime iteration state plus recent run history.
- VS Code `workspaceState` mirrors the same runtime object and is used as fallback if `.ralph/state.json` cannot be loaded.
- `inspectWorkspace()` is the non-destructive read path used for status inspection.
- `.ralph/prompts/`, `.ralph/runs/`, and `.ralph/logs/` are generated artifact directories.

## Ralph Iteration Rules

- The first CLI run is a `bootstrap` run because `state.runHistory` is empty.
- Later runs are `iteration` runs.
- `runRalphIteration` records the run result, increments `nextIteration`, and saves the last prompt path.
- `runRalphLoop` repeats the single-iteration path up to `ralphCodex.ralphIterationCap`.
- The loop has no semantic stop condition. It stops only when the cap is reached or when `codex exec` fails.

## Boundaries And Constraints

- `src/codex/ideCommandStrategy.ts` uses clipboard plus `vscode.commands.executeCommand(...)`; it does not inject text directly into a Codex composer.
- `src/codex/cliExecStrategy.ts` is the only implemented automation path and uses `codex exec`.
- `src/services/workspaceScanner.ts` scans only repo-root entries and `package.json`. It is intentionally shallow.
- Untrusted workspaces have limited support: status inspection only.
- Virtual workspaces are unsupported.

## Roadmap

- Extract more of `registerCommands.ts` into a service layer if command-level integration tests become necessary.
- Add temp-dir tests for `workspaceScanner.ts` so the shallow-scan contract is verified end to end.
- Resolve the current `vsce` and Node 18 packaging incompatibility before treating this repo as publish-ready.
- Replace the placeholder `publisher` value in `package.json` before the first real release.
