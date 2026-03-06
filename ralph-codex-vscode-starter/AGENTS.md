# AGENTS.md

## Scope

This repo is a VS Code extension that:

- builds Ralph prompts from durable workspace files,
- hands prompts to Codex through clipboard plus configurable VS Code command IDs,
- runs controlled, repeatable CLI iterations with `codex exec`.

## Source Of Truth

- Edit `src/` and `test/`. Treat `out/` and `out-test/` as generated artifacts.
- Treat `package.json` as authoritative for contributed commands, settings, activation events, npm scripts, and supported runtime expectations.
- Treat `src/commands/registerCommands.ts` as command wiring only.
- Treat `src/ralph/iterationEngine.ts` as authoritative for the Ralph loop phases and stop behavior.
- Treat `src/ralph/stateManager.ts` as authoritative for durable state and artifact-root path resolution.
- Treat `src/ralph/loopLogic.ts` as authoritative for deterministic classification, no-progress detection, and stop decisions.
- Treat `src/ralph/verifier.ts` as authoritative for verifier behavior.
- If docs and code diverge, fix the docs in the same change.

## State And Artifacts

- Durable objective text lives at `ralphCodex.prdPath` and defaults to `.ralph/prd.md`.
- Durable progress text lives at `ralphCodex.progressPath` and defaults to `.ralph/progress.md`.
- Durable tasks live at `ralphCodex.ralphTaskFilePath` and default to `.ralph/tasks.json`.
- Runtime state lives in `.ralph/state.json` and is mirrored to VS Code `workspaceState`.
- State loads from `.ralph/state.json` first. VS Code `workspaceState` is the fallback if disk state is missing or unreadable.
- Generated prompts live in `.ralph/prompts/`.
- CLI transcripts and last-message artifacts live in `.ralph/runs/`.
- Per-iteration artifacts live under `ralphCodex.artifactRetentionPath` and default to `.ralph/artifacts/`.
- Extension logs live in `.ralph/logs/extension.log`.

## Ralph Iteration Model

- The loop phases are: `inspect`, `select task`, `generate prompt`, `execute`, `collect result`, `verify`, `classify outcome`, `persist state`, and `decide whether to continue`.
- Task selection is deterministic: first `in_progress`, then first `todo`.
- The verifier layer is deterministic and currently supports `validationCommand`, `gitDiff`, and `taskState`.
- Iteration results are persisted as machine-readable JSON with task id, prompt path, adapter, execution status, verification status, completion classification, follow-up action, timestamps, warnings/errors, and artifact references.
- The loop stops on task completion, verified completion with no remaining subtasks, repeated no-progress, repeated identical blocked/failed/human-review outcomes, explicit human-review-needed outcomes when configured, iteration cap, execution failure, or lack of an actionable task.
- No-progress detection uses repeated task selection, repeated validation failure signatures, unchanged task/progress files, and lack of relevant file changes. Do not replace that with “AI decides progress.”

## Codex Boundary

- Interactive IDE handoff in this repo is clipboard plus `vscode.commands.executeCommand(...)` using `ralphCodex.openSidebarCommandId` and `ralphCodex.newChatCommandId`.
- Scripted automation in this repo is `codex exec`.
- Do not invent a direct Codex composer injection path. Nothing in `src/` implements one, and the public APIs used here do not support it.
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI. That command falls back to clipboard handoff and warns the user.

## Runtime And Packaging

- Use Node 20+ for supported dependency installation and packaging.
- `npm run validate` remains the authoritative local compile + lint + test gate.
- `npm run package` runs `scripts/ensure-node-version.js` before `vsce package`.
- `ralphCodex.gitCheckpointMode` is non-destructive. It may capture status/diff artifacts and suggest checkpoint names, but it must not create branches, tags, or worktrees.

## Change Discipline

- When adding or renaming a command, update `src/commands/registerCommands.ts` and `package.json`.
- When changing settings, keep `package.json`, `src/config/defaults.ts`, and `src/config/readConfig.ts` aligned.
- When changing loop semantics, keep `src/ralph/iterationEngine.ts`, `src/ralph/loopLogic.ts`, README, and docs aligned.
- Keep workspace-scanning claims modest. `src/services/workspaceScanner.ts` inspects repo-root markers plus a small amount of CI metadata; it is not a full repository indexer.
