Proposed task ids are `T11`, `T12`, and `T13`.

- `T11`: Make prompt selection outcome-aware so Ralph can choose replenish, continue, fix, or human-review follow-up prompts from durable state.
- `T12`: Persist specialized prompt-kind and root-policy context across Ralph state, status, and provenance surfaces.
- `T13`: Add regression coverage and focused docs for specialized prompt flows and backlog replenishment.

These are the next coherent slice because the completed backlog stopped at nested-root semantics and the single-agent boundary, while the current repo state already shows partial work on the next control-plane step: specialized prompt kinds, backlog-replenishment flow, and the related status/provenance/test surfaces across `promptBuilder`, `iterationEngine`, `stateManager`, `statusReport`, templates, and tests.

A new actionable task would exist after applying the patch: `T11`.

Blocker: I could not safely replenish the active durable files at [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json) and [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md) because they live outside the writable sandbox root for this session. Both `apply_patch` and a direct shell write to `../.ralph/` were rejected with permission errors. If you want, I can give you the exact JSON/Markdown patch to paste into those two files.