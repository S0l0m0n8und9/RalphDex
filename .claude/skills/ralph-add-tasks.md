---
name: ralph-add-tasks
description: Add new tasks to .ralph/tasks.json following Ralph's schema — flat, explicit, versioned, with correct parentId and dependsOn.
---

Add tasks to `.ralph/tasks.json` following Ralph's task schema exactly.

## Supported fields

| Field         | Type              | Required | Description                                           |
|---------------|-------------------|----------|-------------------------------------------------------|
| `id`          | `string`          | yes      | Unique task identifier (e.g. `"T12"`, `"T12.1"`)     |
| `title`       | `string`          | yes      | Short action-oriented label                           |
| `status`      | `string`          | yes      | One of `"todo"`, `"in_progress"`, `"blocked"`, `"done"` |
| `acceptance`  | `string[]`        | yes      | Concrete done-criteria                                |
| `parentId`    | `string`          | no       | ID of parent task for hierarchical grouping           |
| `dependsOn`   | `string[]`        | no       | Task IDs that must be `"done"` before this is selectable |
| `notes`       | `string`          | no       | Free-form context or rationale                        |
| `validation`  | `string`          | no       | Shell command Ralph runs to verify completion         |
| `context`     | `string[]`        | no       | Relevant file paths or modules                        |
| `constraints` | `string[]`        | no       | Guardrails — things the agent must not do             |
| `priority`    | `string`          | no       | `"low"`, `"normal"`, or `"high"` (default: `"normal"`) |
| `blocker`     | `string`          | no       | Description of what is blocking this task             |

## Example task

```json
{
  "id": "T12",
  "title": "Add retry logic to CLI provider",
  "status": "todo",
  "acceptance": ["Retries up to 3 times on transient failure", "Unit test covers retry path"],
  "dependsOn": ["T11"],
  "context": ["src/codex/cliExecStrategy.ts", "test/cliExecStrategy.test.ts"],
  "constraints": ["Do not change the public API surface"],
  "validation": "cd ralph-codex-vscode-starter && npm test"
}
```

## WRONG field names — DO NOT USE

The parser will reject or auto-correct these. Always use the correct name.

| Wrong                          | Correct        |
|--------------------------------|----------------|
| `dependencies`, `depends_on`   | `dependsOn`    |
| `acceptanceCriteria`, `doneCriteria` | `acceptance` |
| `relevantFiles`, `files`       | `context`      |
| `guardrails`, `guard_rails`    | `constraints`  |

## Rules

- Schema version must be `2`
- Task IDs must be unique and follow the existing numbering convention (read the file to determine the next available number)
- `dependsOn` lists task IDs that must be `done` before this task can be selected
- `parentId` is for hierarchical grouping — a parent task is `done` only when all its children are `done`
- Keep tasks flat and inspectable — one deterministic next step per task
- `validation` should be a concrete shell command Ralph can run to verify the task is done

Read `.ralph/tasks.json` first to understand existing IDs and structure. Then write the new tasks with `status: "todo"`. Run `node ralph-codex-vscode-starter/scripts/check-ledger.js` after writing to confirm no drift was introduced.