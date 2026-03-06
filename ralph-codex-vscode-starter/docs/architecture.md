# Architecture

## Entry Point

- `src/extension.ts` creates the output channel logger and delegates all behavior to `registerCommands(...)`.
- Activation is command-based through `package.json` activation events.

## Module Boundaries

- `src/commands/registerCommands.ts`: command registration, trust gating, progress UI, and user-visible messaging.
- `src/codex/`: handoff and execution strategies for `clipboard`, `ideCommand`, and `cliExec`.
- `src/config/`: defaults, setting types, and VS Code configuration reads.
- `src/prompt/promptBuilder.ts`: prompt kind selection and prompt body construction.
- `src/ralph/stateManager.ts`: durable Ralph state persistence and path management.
- `src/ralph/iterationEngine.ts`: the explicit Ralph loop phase runner.
- `src/ralph/loopLogic.ts`: pure classification, no-progress detection, and stop-decision logic.
- `src/ralph/verifier.ts`: validation-command, file-change, and task-state verifiers.
- `src/ralph/artifactStore.ts`: deterministic per-iteration artifact writing.
- `src/services/`: logging, child-process execution, Codex CLI support inspection, and shallow workspace scanning.

## Prompt And Execution Flow

1. A trusted command resolves config and workspace paths through `RalphStateManager`.
2. `RalphIterationEngine` inspects durable Ralph files and a shallow workspace summary.
3. The engine deterministically selects the next task from `.ralph/tasks.json`.
4. `buildPrompt()` writes a `bootstrap-###.prompt.md` or `iteration-###.prompt.md` artifact under `.ralph/prompts/`.
5. CLI execution uses `CliExecCodexStrategy`, which runs `codex exec`, sends the prompt over stdin, writes `.last-message.md`, and saves a transcript.
6. The verifier layer runs the configured verifier modes.
7. `loopLogic.ts` classifies the outcome and decides whether the loop continues.
8. `artifactStore.ts` and `stateManager.ts` persist the machine-readable iteration result and related artifacts.

## State Model

- `.ralph/state.json` stores versioned runtime state plus a compact run history and a machine-readable iteration history.
- `.ralph/prompts/`, `.ralph/runs/`, `.ralph/logs/`, and `.ralph/artifacts/` are generated artifact directories.
- `inspectWorkspace()` is the non-destructive read path used for status inspection.
- `resetRuntimeState()` preserves PRD/progress/task files and removes generated runtime artifacts.

## Ralph Iteration Rules

- The first actual `codex exec` run is `bootstrap`. Later runs are `iteration`.
- Task selection is deterministic: first `in_progress`, then first `todo`.
- The loop phases are explicit and timestamped.
- Stop behavior is semantic, not cap-or-failure only.
- No-progress detection is deterministic and based on repeated signals, not inferred intent.

## Boundaries And Constraints

- `src/codex/ideCommandStrategy.ts` uses clipboard plus `vscode.commands.executeCommand(...)`; it does not inject text directly into a Codex composer.
- `src/services/workspaceScanner.ts` inspects repo-root markers, selected CI files, and a small amount of manifest data. It is intentionally shallow.
- Untrusted workspaces have limited support: status inspection only.
- Virtual workspaces are unsupported.
- Git checkpointing is intentionally non-destructive.
