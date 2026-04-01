# Ralph Codex Workbench — Claude Code Project Memory

## What this repo is

Ralph Codex Workbench is a VS Code extension that runs durable, file-backed agentic coding loops. All state lives in `.ralph/` on disk so sessions can resume without chat history. The extension source is in `ralph-codex-vscode-starter/`. The `.ralph/` directory at the repo root is Ralph's live workspace state for this project.

## Before making any change

1. Read `ralph-codex-vscode-starter/AGENTS.md` — it is the authoritative routing document.
2. Read `ralph-codex-vscode-starter/docs/architecture.md` for module boundaries.
3. Check `.ralph/tasks.json` for the current backlog before inventing new work.
4. Run `cd ralph-codex-vscode-starter && npm run validate` to confirm the baseline is clean.

## Key module map

- `src/codex/` — execution strategies (codex exec, clipboard, IDE command, claude -p)
- `src/ralph/iterationEngine.ts` — loop orchestration entry point
- `src/ralph/iterationPreparation.ts` — prompt/preflight/context assembly
- `src/ralph/reconciliation.ts` — completion-report reconciliation
- `src/ralph/taskFile.ts` — task graph, claim acquisition, write locking
- `src/ralph/loopLogic.ts` — outcome classification and stop decisions
- `src/ralph/completionReportParser.ts` — parses the trailing JSON completion block
- `src/ralph/taskDecomposition.ts` — bounded child-task proposal logic
- `src/prompt/promptBuilder.ts` — prompt template rendering and budget policy
- `src/commands/registerCommands.ts` — VS Code command wiring (shell boundary)

## Completion report contract

Every CLI iteration prompt ends with this instruction: return a fenced `json` block as the very last thing in your response. The block must contain:

```json
{
  "selectedTaskId": "<the task id from Task Focus section>",
  "requestedStatus": "done" | "blocked" | "in_progress",
  "progressNote": "<optional one-line summary of what changed>",
  "blocker": "<optional — only if requestedStatus is blocked>",
  "validationRan": "<optional — the validation command you ran and its result>",
  "needsHumanReview": true  // optional — only if you hit something requiring human judgment
}
```

**Do not edit `.ralph/tasks.json` or `.ralph/progress.md` directly during normal task execution.** Ralph reconciles task state from your completion report.

## Validation gate

```bash
cd ralph-codex-vscode-starter && npm run validate
```

This runs: compile → check:docs → lint → tests. All must pass before a task is done.

## Git conventions

- Delete branches after they are merged — keep the remote clean.
- Use rebase (not merge) to keep main at the top of the graph. Rebase onto `origin/main` before pushing.

## What not to do

- Do not run `codex exec` — Ralph shells out to the CLI; it is not called from within a session.
- Do not rewrite `.ralph/tasks.json` unless the prompt explicitly targets backlog replenishment.
- Do not add broad multi-agent orchestration — see `docs/boundaries.md` and `docs/multi-agent-readiness.md`.
- Do not invent IDE APIs or hidden handoff channels.
