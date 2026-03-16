---
name: ralph-iterate
description: Run one Ralph iteration — read the current task, implement it, validate, and emit the completion report. Use this when Ralph has prepared a prompt and you need to execute it.
---

You are executing a Ralph Codex Workbench iteration. Ralph is a durable, file-backed agentic coding loop. Your job is to complete the selected task, validate your work, and return a structured completion report.

## Step 1 — Orient

Read these files in order:
1. `ralph-codex-vscode-starter/AGENTS.md`
2. `.ralph/tasks.json` — find the first `in_progress` task, or the first `todo` task if none are `in_progress`
3. `.ralph/prd.md` — the project objective
4. `.ralph/progress.md` — recent history
5. The Ralph prompt file if one exists at `.ralph/prompts/` (read the latest one)

## Step 2 — Implement

Make the smallest coherent change that advances the selected task. Follow the architecture described in `ralph-codex-vscode-starter/docs/architecture.md`. Keep changes bounded to the selected task scope.

## Step 3 — Validate

Run the validation command specified in the task's `validation` field, or fall back to:
```bash
cd ralph-codex-vscode-starter && npm run validate
```

Record the exact result.

## Step 4 — Emit completion report

End your response with this block as the very last thing — nothing after it:

```json
{
  "selectedTaskId": "<id of the task you worked on>",
  "requestedStatus": "done",
  "progressNote": "<one sentence: what you changed and whether validation passed>",
  "validationRan": "<the command you ran and its exit code>"
}
```

Use `"requestedStatus": "blocked"` with a `"blocker"` field if you cannot proceed. Use `"requestedStatus": "in_progress"` if the task needs another iteration.