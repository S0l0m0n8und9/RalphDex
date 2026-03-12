# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, prompts, run artifacts, verifier output, and provenance evidence on disk under `.ralph/` so a new Codex session can resume from inspectable state instead of chat history.

This repository is the public home for the project. The extension source currently lives in [`ralph-codex-vscode-starter/`](./ralph-codex-vscode-starter/); treat that nested directory as the implementation root while the repo is still being flattened.

## Who This Is For

This project is for operators who want Codex work to survive across sessions as files instead of chat history, and for developers who want a VS Code extension that can prepare prompts, hand work off to Codex, and run deterministic `codex exec` loops with persisted evidence.

## Current Status

The extension is usable locally and the repository contains the full source, docs, tests, and packaging scripts. The public repo layout is still transitional because the extension code lives in a nested directory instead of the repo root.

## Getting Started

1. Install Node.js 20 or newer and VS Code 1.95 or newer.
2. Change into the extension directory:

   ```bash
   cd ralph-codex-vscode-starter
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the extension:

   ```bash
   npm run compile
   ```

5. Open the repository in VS Code and launch the Extension Development Host with `F5`.
6. In the development host, use `Ralph Codex: Show Status`, `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop`.

To build a local installable package, run `npm run package` from `ralph-codex-vscode-starter/` and install the generated VSIX.

## Where Ralph Stores State

Ralph persists durable workspace state under `.ralph/`:

- `.ralph/prd.md`: objective
- `.ralph/progress.md`: progress log
- `.ralph/tasks.json`: task graph
- `.ralph/state.json`: runtime state
- `.ralph/prompts/`: generated prompts
- `.ralph/runs/`: transcripts and last messages
- `.ralph/artifacts/`: iteration artifacts and latest pointers
- `.ralph/logs/extension.log`: extension log

## Project Structure

- [`ralph-codex-vscode-starter/`](./ralph-codex-vscode-starter/): VS Code extension source, tests, packaging config, and implementation docs
- [`.ralph/`](./.ralph/): local durable Ralph workspace state and generated artifacts for this checkout
- [`.vscode/`](./.vscode/): local editor settings for this workspace

For extension-specific implementation details, command behavior, and architecture, start with [`ralph-codex-vscode-starter/README.md`](./ralph-codex-vscode-starter/README.md).
