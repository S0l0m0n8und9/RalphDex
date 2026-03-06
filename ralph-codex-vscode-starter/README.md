# Ralph Codex Workbench

A starter VS Code extension that gives you a practical bridge between **repo-aware prompt generation** and **Ralph-style fresh-iteration loops** for Codex.

## What this starter actually does

This repo is deliberately honest about the current boundary:

- The public Codex IDE extension exposes **commands** such as `chatgpt.openSidebar` and `chatgpt.newChat` through the VS Code command palette.
- The public docs do **not** describe a stable extension API for programmatically injecting an arbitrary prompt directly into the Codex chat composer.
- Codex also supports **scripted automation** through `codex exec` in non-interactive mode, which is a better fit for Ralph-style loops.

So this starter uses a two-lane design:

1. **IDE lane** — generate a repo-aware prompt, copy it to the clipboard, and open the Codex sidebar / a new Codex thread.
2. **Automation lane** — run `codex exec` repeatedly in a Ralph-style loop, with each iteration using fresh context and persisting memory in files.

That is the right architecture right now. Anything claiming direct prompt injection into the Codex IDE extension is either using private internals or making it up.

## Why this design matches the docs

OpenAI says the Codex IDE extension runs the same agent as the Codex CLI and shares the same configuration. The extension works directly in VS Code and supports agent mode, approvals, cloud delegation, and command-palette commands.

OpenAI also documents `codex exec` specifically for scripted and CI-style runs, which is exactly what a Ralph loop needs.

The Ralph technique itself is basically repeated fresh runs, with memory persisted in repo files like progress logs and task files rather than in one giant chat thread.

## Features in this starter

- Workspace scan to infer rough repo shape.
- Bootstrap prompt generator.
- Iteration prompt generator.
- Clipboard-based handoff into the Codex IDE extension.
- Commands to open the Codex sidebar and start a new Codex thread.
- `codex exec` runner for one-off execution.
- Ralph loop runner for repeated iterations.
- `.ralph/` state folder for PRD, progress, and tasks.
- Webview workbench as a basic control panel.

## Recommended setup

### 1. Install dependencies

```bash
npm install
```

### 2. Compile the extension

```bash
npm run compile
```

### 3. Install Codex CLI

```bash
npm i -g @openai/codex
```

Codex CLI is the official local client and supports `codex exec` for scripted runs.

### 4. Install the Codex IDE extension in VS Code

The workbench can function without it for CLI-driven loops, but the copy/open-sidebar flow assumes the Codex IDE extension is installed. The Codex IDE extension is documented for VS Code and other VS Code-compatible editors.

### 5. Run the extension in development

Press `F5` in VS Code.

This launches an Extension Development Host.

## Commands

Open the command palette and run:

- `Ralph Codex: Open Workbench`
- `Ralph Codex: Copy Bootstrap Prompt`
- `Ralph Codex: Copy Iteration Prompt`
- `Ralph Codex: Open Codex Sidebar`
- `Ralph Codex: New Codex Thread`
- `Ralph Codex: Run Single Codex Exec`
- `Ralph Codex: Run Ralph Loop`
- `Ralph Codex: Scan Workspace`

## Ralph state files

The extension creates these on demand:

```text
.ralph/
  prd.md
  progress.md
  tasks.json
  prompts/
  out/
```

### Usage model

- `prd.md` = durable objective / brief
- `progress.md` = durable loop memory
- `tasks.json` = structured task backlog
- `out/` = generated prompts and transcripts

This is the key Ralph pattern: **fresh runs, file-backed memory**.

## Settings

This starter exposes:

- `ralphCodex.codexExecutable`
- `ralphCodex.model`
- `ralphCodex.maxIterations`
- `ralphCodex.approvalMode`
- `ralphCodex.sandboxMode`
- `ralphCodex.autoOpenCodexSidebar`
- `ralphCodex.promptOutputFolder`

The official Codex docs note that some Codex behavior is configured in shared CLI config, while editor settings control extension-level behavior.

## Important limitations

### Direct prompt injection into Codex chat

Not implemented because there is no documented public API for it.

This starter uses the safest public mechanism available:

- copy prompt to clipboard
- optionally open the Codex sidebar
- optionally open a new Codex thread

That is clunky, but real.

### Full autonomous loops with destructive permissions

Possible, but risky.

OpenAI documents sandbox and approval modes and explicitly warns that bypassing approvals and sandboxing is dangerous.

This starter defaults to:

- `workspace-write`
- `on-request`

That is the sane default.

## Suggested next steps in Codex

Use Codex to continue from here with this sequence:

1. Replace the naive workspace scanner with real manifest parsing.
2. Turn `tasks.json` into a stronger schema with statuses, blockers, and validation criteria.
3. Add branch / worktree support for isolated loop iterations.
4. Add optional Git commit checkpoints after successful iterations.
5. Add a review loop that re-runs Codex as a verifier agent.
6. Add MCP-backed repo context, issue tracker sync, and CI/logs integration.
7. Replace the clipboard handoff with any future official prompt-submission API if OpenAI exposes one.

## Packaging

To package the extension:

```bash
npm run package
```

## Project structure

```text
src/
  extension.ts
  config.ts
  repoScanner.ts
  promptFactory.ts
  loopRunner.ts
  types.ts
.ralph/
  prd.md
  progress.md
  tasks.json
.vscode/
  launch.json
  tasks.json
AGENTS.md
```

## References

- https://developers.openai.com/codex/ide/
- https://developers.openai.com/codex/ide/features/
- https://developers.openai.com/codex/ide/commands/
- https://developers.openai.com/codex/ide/settings/
- https://developers.openai.com/codex/noninteractive/
- https://developers.openai.com/codex/cli/reference/
- https://developers.openai.com/codex/security/
- https://github.com/snarktank/ralph
