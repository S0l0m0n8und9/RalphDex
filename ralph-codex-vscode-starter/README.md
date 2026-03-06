# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for three concrete paths:

- build repo-aware Ralph prompts from durable files,
- hand prompts to the Codex IDE through clipboard plus configurable VS Code command IDs,
- run fresh `codex exec` iterations with durable artifacts under `.ralph/`.

## What The Extension Persists

- Objective text at `ralphCodex.prdPath` (`.ralph/prd.md` by default)
- Progress log at `ralphCodex.progressPath` (`.ralph/progress.md` by default)
- Task backlog at `ralphCodex.ralphTaskFilePath` (`.ralph/tasks.json` by default)
- Runtime state at `.ralph/state.json`, mirrored to VS Code workspace storage
- Generated prompts in `.ralph/prompts/`
- CLI transcripts and last messages in `.ralph/runs/`
- Extension logs in `.ralph/logs/extension.log`

## Commands

- `Ralph Codex: Prepare Prompt` builds the next prompt file and optionally copies it to the clipboard.
- `Ralph Codex: Open Codex IDE` builds the next prompt, copies it, and best-effort opens the configured sidebar and new-chat commands.
- `Ralph Codex: Run CLI Iteration` builds a prompt and runs `codex exec` over stdin.
- `Ralph Codex: Run CLI Loop` repeats the CLI iteration path up to `ralphCodex.ralphIterationCap`.
- `Ralph Codex: Show Status` writes the current runtime snapshot to the `Ralph Codex` output channel.
- `Ralph Codex: Reset Runtime State` preserves PRD/progress/tasks and removes generated state, prompt, run, and log artifacts.

## Codex Boundary

- Interactive IDE handoff in this repo is clipboard plus configurable VS Code command IDs.
- Scripted automation in this repo is `codex exec`.
- `preferredHandoffMode = cliExec` changes the recommended path, but `Open Codex IDE` still performs clipboard handoff rather than running the CLI.
- If the configured IDE commands are unavailable, the extension falls back to clipboard-only handoff and warns clearly.

## Activation And Trust

- The extension activates on command invocation.
- In untrusted workspaces it supports `Ralph Codex: Show Status` in limited mode.
- Prompt generation, IDE handoff, runtime reset, and CLI execution require workspace trust.
- Virtual workspaces are unsupported because the extension reads and writes local files and can run the Codex CLI.

## Development

```bash
npm install
npm run compile
npm run validate
```

`npm run validate` is the authoritative local gate: it compiles, type-checks, and runs tests. Press `F5` in VS Code to start the Extension Development Host. `npm run package` uses `vscode:prepublish`, but in the current Node 18 environment it fails inside `vsce` before producing a `.vsix`. `scripts/dev-loop.sh` is a convenience wrapper that runs `npm run compile` and then opens the workspace in VS Code.

## Reference Docs

- `docs/architecture.md`
- `docs/workflows.md`
- `docs/testing.md`
