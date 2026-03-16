---
name: ralph-repair-ledger
description: Detect and repair task-ledger drift in .ralph/tasks.json — done parents with unfinished children, orphaned tasks, or stale claims.
---

1. Run `node ralph-codex-vscode-starter/scripts/check-ledger.js` and read its full output.
2. Read `.ralph/tasks.json` and identify:
   - Any parent task marked `done` whose children are `todo`, `in_progress`, or `blocked`
   - Any task whose `parentId` or `dependsOn` references a non-existent task id
3. For each drift case, propose the minimal repair: either reopen the parent (set to `in_progress`) or close the children (set to `done` if their work is verifiably complete).
4. **Do not write any changes** until you have listed all proposed repairs and explained each one.
5. After listing, ask: "Shall I apply these repairs to `.ralph/tasks.json`?"
6. Only write changes if explicitly confirmed.