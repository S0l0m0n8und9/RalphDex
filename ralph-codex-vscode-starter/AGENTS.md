# AGENTS.md

## Scope

This repo is a VS Code extension that:

- builds Ralph prompts from durable workspace files,
- hands prompts to Codex through clipboard plus configurable VS Code command IDs,
- runs repeatable CLI iterations with `codex exec`.

## Source Of Truth

- Edit `src/` and `test/`. Treat `out/` and `out-test/` as generated artifacts.
- Treat `package.json` as authoritative for contributed commands, settings, activation events, and npm scripts.
- Treat `src/commands/registerCommands.ts` as authoritative for command behavior.
- Treat `src/commands/workspaceSupport.ts` as authoritative for trust gating and IDE-command inspection.
- Treat `src/services/codexCliSupport.ts` as authoritative for Codex CLI path inspection.
- Treat `src/config/defaults.ts` and `src/config/readConfig.ts` as authoritative for effective settings and legacy-key handling.
- If docs and code diverge, fix the docs in the same change.

## State And Artifacts

- Durable objective text lives at `ralphCodex.prdPath` and defaults to `.ralph/prd.md`.
- Durable progress text lives at `ralphCodex.progressPath` and defaults to `.ralph/progress.md`.
- Durable tasks live at `ralphCodex.ralphTaskFilePath` and default to `.ralph/tasks.json`.
- Runtime state lives in `.ralph/state.json` and is mirrored to VS Code `workspaceState`.
- State loads from `.ralph/state.json` first. VS Code `workspaceState` is the fallback if disk state is missing or unreadable.
- Generated prompts live in `.ralph/prompts/`.
- CLI transcripts and last-message artifacts live in `.ralph/runs/`.
- Extension logs live in `.ralph/logs/extension.log`.

## Ralph Iteration Model

- `preparePrompt()` is the shared entry path for prompt generation and CLI execution.
- `preparePrompt()` ensures the Ralph workspace, reads PRD/progress/tasks/state, scans the repo root, and writes a prompt file.
- The first run is `bootstrap`. Later runs are `iteration`. The distinction comes from `state.runHistory`.
- `ralphCodex.runRalphIteration` sends the prompt to `codex exec` over stdin, saves `.transcript.md` and `.last-message.md`, then records the run in state.
- `ralphCodex.runRalphLoop` repeats the single-iteration path up to `ralphCodex.ralphIterationCap` and stops on the first CLI failure.
- Fresh Codex runs are expected to update the PRD, progress log, and task file when work advances.
- Repeated prompt-only commands reuse the current `nextIteration` value until a CLI run records progress.

## Codex Boundary

- Interactive IDE handoff in this repo is clipboard plus `vscode.commands.executeCommand(...)` using `ralphCodex.openSidebarCommandId` and `ralphCodex.newChatCommandId`.
- Scripted automation in this repo is `codex exec`.
- Do not invent a direct Codex composer injection path. Nothing in `src/` implements one.
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI. That command falls back to clipboard handoff and warns the user.
- If you change command IDs, CLI flags, or Codex assumptions, update docs and config surface together.

## CLI Vs IDE Handoff

- Use CLI execution when you need repeatable runs, captured transcripts, last-message artifacts, or the Ralph loop.
- Use IDE handoff when a human needs to inspect or edit the prompt before continuing in the Codex sidebar.
- If the task depends on `.ralph/runs/` artifacts, use CLI execution. IDE handoff does not create them.
- If the workspace is untrusted, only status inspection is supported. All write or execution paths must fail fast with an actionable trust message.

## Authoritative Commands

- `npm run compile` builds the extension.
- `npm run lint` is the type-check gate for `src/` and `test/`.
- `npm test` compiles tests and runs the Node test suite from `out-test/test/`.
- `npm run validate` is the full local validation shortcut and must remain `compile + lint + test`.
- `npm run package` is the packaging command. Verify it in the current Node runtime if packaging matters.
- `.vscode/tasks.json` mirrors `compile`, `lint`, and `test`.
- `scripts/dev-loop.sh` is a convenience wrapper, not the source of truth.

## Change Discipline

- When adding or renaming a command, update `src/commands/registerCommands.ts` and `package.json`.
- When changing settings, keep `package.json`, `src/config/defaults.ts`, and `src/config/readConfig.ts` aligned.
- Keep `package.json` capabilities aligned with real restricted-mode support. `Show Status` is the limited-mode path; the other commands require trust.
- Keep workspace-scanning claims modest. `src/services/workspaceScanner.ts` inspects repo-root entries and `package.json`, not the full tree.
