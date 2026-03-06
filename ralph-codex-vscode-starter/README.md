# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension starter for one developer who wants two reliable Codex paths in the same repo:

1. Generate a durable, repo-aware prompt and hand it to the Codex IDE with clipboard plus documented VS Code commands.
2. Run a Ralph-style fresh-iteration loop with `codex exec`, file-backed state, and repeatable artifacts under `.ralph/`.

This repo is now a usable v1, not a tutorial stub.

## What Works Now

- Prompt generation is file-backed and deterministic.
- Prompt handoff supports `ideCommand`, `clipboard`, and `cliExec`-aware strategy selection.
- Ralph runtime state is persisted in both VS Code workspace storage and `.ralph/state.json`.
- Prompt files, last messages, transcripts, and extension logs are written under `.ralph/`.
- The extension surfaces six focused commands instead of a starter-style workbench panel.
- Workspace scanning reads actual root manifests and `package.json` scripts rather than only checking for a few filenames.
- Pure logic modules have Node-based tests.

## Audit Summary Of The Original Starter

The original repo had the right high-level idea, but not a production-ready shape:

- Commands were flat and tightly coupled in `src/extension.ts`.
- Ralph state existed only as seed files and was not tracked as runtime state.
- The CLI runner passed the full prompt as a shell argument, which is fragile.
- IDE handoff assumed command ids but did not model failure modes cleanly.
- The scanner was mostly presence checks.
- There were no tests and no durable logging.

## Public Codex API Limits

The v1 architecture is intentionally built around what OpenAI publicly documents today.

- The Codex IDE exposes command palette commands and slash commands, but there is no documented extension API for injecting arbitrary text directly into the Codex composer.
- `codex exec` is the documented path for non-interactive automation and supports stdin input, approvals, sandbox selection, and file output.
- The VS Code extension therefore uses clipboard plus Codex IDE commands for interactive handoff and uses `codex exec` for automation.

Anything stronger than that would require private or undocumented integration points, so this repo does not pretend otherwise.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Compile the extension:

```bash
npm run compile
```

3. Run lint and tests:

```bash
npm run validate
```

4. Install Codex CLI:

```bash
npm i -g @openai/codex
```

5. Install the Codex IDE extension in VS Code if you want interactive handoff.

6. Press `F5` in VS Code to launch the Extension Development Host.

## Command Flow

### Generate Prompt

`Ralph Codex: Generate Prompt`

- Ensures `.ralph/` files exist.
- Reads the PRD, progress log, task file, runtime state, and workspace scan.
- Writes the next prompt to `.ralph/prompts/`.
- Optionally copies the prompt to the clipboard if `ralphCodex.clipboardAutoCopy` is enabled.

### Open Codex And Copy Prompt

`Ralph Codex: Open Codex And Copy Prompt`

- Generates the next prompt.
- Copies it to the clipboard.
- Uses the configured handoff strategy.
- In `ideCommand` mode it attempts the configured sidebar and new-chat command ids.
- In `clipboard` mode it stops after copying.
- If `preferredHandoffMode` is `cliExec`, this command falls back to clipboard handoff and tells you to use the iteration command for execution.

### Run One Ralph Iteration

`Ralph Codex: Run One Ralph Iteration`

- Generates the next prompt.
- Runs `codex exec` with the configured model, sandbox, and approval mode.
- Sends the prompt over stdin instead of embedding it as one shell argument.
- Writes the last assistant message and transcript to `.ralph/runs/`.
- Records the result in `.ralph/state.json`.

### Run Ralph Loop

`Ralph Codex: Run Ralph Loop`

- Repeats the single-iteration flow up to `ralphCodex.ralphIterationCap`.
- Stops immediately on the first failed `codex exec`.
- Leaves every iteration as a separate file-backed artifact.

### Show Ralph Status

`Ralph Codex: Show Ralph Status`

- Writes a structured snapshot to the `Ralph Codex` output channel.
- Includes runtime state, task counts, key file paths, and detected workspace commands.

### Reset Ralph Workspace State

`Ralph Codex: Reset Ralph Workspace State`

- Preserves the PRD, progress log, and task file.
- Deletes `.ralph/state.json`, generated prompts, run artifacts, and extension logs.
- Re-seeds the runtime state so the next run is deterministic.

## Expected Ralph Loop Behavior

The extension treats each CLI run as disposable context.

- Durable memory lives in `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, and `.ralph/state.json`.
- Prompt generation uses the PRD plus the current task/progress state.
- Each `codex exec` run starts fresh and should update durable files if work progressed.
- The extension records machine-visible metadata even when the Codex run fails.

That keeps the Ralph loop recoverable after VS Code restarts, extension reloads, or failed runs.

## Workspace Files

The extension creates and maintains:

```text
.ralph/
  logs/
    extension.log
  prompts/
    bootstrap-001.prompt.md
    iteration-002.prompt.md
  runs/
    bootstrap-001.last-message.md
    bootstrap-001.transcript.md
  prd.md
  progress.md
  state.json
  tasks.json
```

## Settings

Required v1 settings:

- `ralphCodex.codexCommandPath`
- `ralphCodex.preferredHandoffMode`
- `ralphCodex.ralphIterationCap`
- `ralphCodex.ralphTaskFilePath`
- `ralphCodex.prdPath`
- `ralphCodex.progressPath`
- `ralphCodex.clipboardAutoCopy`

Additional execution settings:

- `ralphCodex.model`
- `ralphCodex.approvalMode`
- `ralphCodex.sandboxMode`
- `ralphCodex.openSidebarCommandId`
- `ralphCodex.newChatCommandId`

## Project Structure

```text
src/
  commands/
  codex/
  config/
  prompt/
  ralph/
  services/
  extension.ts
test/
  *.test.ts
.ralph/
  prd.md
  progress.md
  state.json
  tasks.json
AGENTS.md
```

## Validation

```bash
npm run compile
npm run lint
npm test
```

## Known Limitations

- There is still no direct, documented Codex IDE composer injection API.
- The IDE command ids are configurable because they are not guaranteed by this extension itself.
- The Ralph loop currently stops only on iteration cap or CLI failure; it does not yet infer semantic completion.
- The scanner is still root-level and intentionally light; it is better than the original stub, but not a full repo indexer.
- `npm run package` was not validated in this container because the current `vsce` dependency chain trips over a Node 18 runtime; compile, lint, and tests do pass.

## References

- https://developers.openai.com/codex/ide/overview/
- https://developers.openai.com/codex/ide/features/
- https://developers.openai.com/codex/ide/commands/
- https://developers.openai.com/codex/ide/settings/
- https://developers.openai.com/codex/noninteractive/
- https://developers.openai.com/codex/cli/reference/
- https://developers.openai.com/codex/security/
- https://github.com/snarktank/ralph
