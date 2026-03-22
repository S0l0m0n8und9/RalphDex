# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, prompts, run artifacts, verifier output, and provenance evidence on disk under `.ralph/` so a new Codex session can resume from inspectable state instead of chat history.

This repository intentionally has one Git root and one nested extension package root. The repo root is the umbrella workspace shell you open in VS Code. The actual extension package, scripts, tests, and packaging metadata live under [`ralph-codex-vscode-starter/`](./ralph-codex-vscode-starter/). Ralph's durable workspace state stays at the repo root under [`.ralph/`](./.ralph/).

## Who This Is For

This project is for operators who want Codex work to survive across sessions as files instead of chat history, and for developers who want a VS Code extension that can prepare prompts, hand work off to Codex, and run deterministic `codex exec` loops with persisted evidence.

## Start Here

Open the repo root in VS Code. The root workspace files intentionally target the nested extension package for builds and debugging.

1. Install Node.js 20 or newer and VS Code 1.95 or newer.
2. Install dependencies from the extension package root:

   ```bash
   cd ralph-codex-vscode-starter
   npm install
   ```

3. Build or validate from that same package root:

   ```bash
   npm run compile
   npm run validate
   ```

4. Return to the repo root, press `F5`, and launch `Launch RalphDex Extension From Repo Root`.
5. In the development host, use `Ralph Codex: Show Status`, `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop`.

To build a local installable package, run `npm run package` from `ralph-codex-vscode-starter/` and install the generated VSIX.

## Repo Topology

| Path | Role | Notes |
| --- | --- | --- |
| `README.md`, `LICENSE`, `ralph.code-workspace` | Repo shell and onboarding | Root-level entrypoints for opening and understanding the whole repo. |
| `.vscode/`, `.claude/` | Repo-root support files | Editor and agent workflow config for the repo-open workflow; these are not the extension package itself. |
| `ralph-codex-vscode-starter/` | Extension package root | The real VS Code extension root: `package.json`, `src/`, `test/`, `scripts/`, and extension docs live here. |
| `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json` | Committed durable Ralph state | Safe to commit when the repository itself is the Ralph workspace. |
| Remaining `.ralph/` contents | Operator-local runtime state | Generated prompts, runs, logs, artifacts, and runtime state remain file-backed but should stay uncommitted. |

## Where Ralph Stores State

Ralph persists durable workspace state under `.ralph/`:

- `.ralph/prd.md`: objective
- `.ralph/progress.md`: progress log
- `.ralph/tasks.json`: task graph
- `.ralph/state.json`: operator-local runtime state
- `.ralph/prompts/`: operator-local generated prompts
- `.ralph/runs/`: operator-local transcripts and last messages
- `.ralph/artifacts/`: operator-local iteration artifacts and latest pointers
- `.ralph/logs/extension.log`: operator-local extension log

When the repository itself is the Ralph workspace, `.ralph/prd.md`, `.ralph/progress.md`, and `.ralph/tasks.json` are safe to commit alongside source. The remaining `.ralph` files and directories are operator-local runtime state and should stay uncommitted.

## Working Conventions

- Treat the repo root as the canonical place to open the project in VS Code.
- Treat `ralph-codex-vscode-starter/` as the canonical place to run `npm` commands.
- Keep path-sensitive validation hints and task notes in the form `cd ralph-codex-vscode-starter && npm ...`.
- Keep `.ralph/` at the repo root even when the extension inspects or executes from the nested package root.

For extension-specific implementation details, command behavior, and architecture, start with [`ralph-codex-vscode-starter/README.md`](./ralph-codex-vscode-starter/README.md).
