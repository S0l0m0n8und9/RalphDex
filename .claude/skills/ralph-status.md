---
name: ralph-status
description: Show the current Ralph workspace state — which tasks are done, what is next, and whether the ledger is clean.
---

Read and summarise the Ralph workspace state:

1. Run `node ralph-codex-vscode-starter/scripts/check-ledger.js` and report the result.
2. Read `.ralph/tasks.json` and count: total tasks, done, todo, in_progress, blocked.
3. Identify the next actionable task (first `in_progress`, then first `todo` with all dependencies done).
4. Read the last 10 lines of `.ralph/progress.md` and summarise what was recently completed.
5. Check `.ralph/claims.json` for any active or stale claims.

Output a concise status report. Do not modify any files.
