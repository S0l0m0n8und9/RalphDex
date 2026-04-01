---
name: ralph-add-tasks
description: Add new tasks to .ralph/tasks.json following Ralph's schema — flat, explicit, versioned, with correct parentId and dependsOn.
---

Add tasks to `.ralph/tasks.json` following Ralph's task schema exactly.

Rules:
- Schema version must be `2`
- Every task needs `id`, `title`, `status` (`todo`),`acceptance`, and optionally `parentId`, `dependsOn`, `notes`, `validation`
- Task IDs must be unique and follow the existing numbering convention (read the file to determine the next available number)
- `acceptance` lists acceptance criteria
- `dependsOn` lists task IDs that must be `done` before this task can be selected
- `parentId` is for hierarchical grouping — a parent task is `done` only when all its children are `done`
- Keep tasks flat and inspectable — one deterministic next step per task
- `validation` should be a concrete shell command Ralph can run to verify the task is done

Read `.ralph/tasks.json` first to understand existing IDs and structure. Then write the new tasks with `status: "todo"`. Run `node ralph-codex-vscode-starter/scripts/check-ledger.js` after writing to confirm no drift was introduced.