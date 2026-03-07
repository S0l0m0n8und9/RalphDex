# AGENTS.md

## Scope

This repo is a VS Code extension that:

- builds Ralph prompts from durable workspace files
- hands prompts to Codex through clipboard plus configurable VS Code command IDs
- runs controlled, repeatable `codex exec` iterations with deterministic verification and stop behavior

## Source Of Truth

- Edit `src/` and `test/`. Treat `out/`, `out-test/`, and packaged `.vsix` files as generated artifacts.
- `package.json` is authoritative for commands, settings, activation events, scripts, and runtime expectations.
- `src/commands/registerCommands.ts` is command wiring plus user-visible status/reporting behavior.
- `src/prompt/promptBuilder.ts` is authoritative for deterministic prompt-kind selection, template rendering, strategy-aware prompt shaping, compact repo-context packaging, and prompt-evidence generation.
- `prompt-templates/` is the editable source for bundled prompt text. Keep template names aligned with prompt kinds.
- `src/ralph/iterationEngine.ts` is authoritative for loop phases and iteration orchestration.
- `src/ralph/integrity.ts` is authoritative for prompt hashing and execution-integrity helpers.
- `src/ralph/taskFile.ts` is authoritative for the explicit task schema, task normalization, selection, and subtask/dependency behavior.
- `src/ralph/preflight.ts` is authoritative for categorized preflight diagnostics, adapter/runtime confidence reporting, and blocking conditions before CLI execution.
- `src/ralph/loopLogic.ts` is authoritative for classification, no-progress detection, and stop decisions.
- `src/ralph/verifier.ts` is authoritative for verifier behavior and git-aware summaries.
- `src/ralph/artifactStore.ts` is authoritative for predictable artifact layout, preflight evidence persistence, and latest-result/preflight pointers.
- Keep docs aligned with code in the same change.

## Task Schema

`tasks.json` is versioned and explicit:

```json
{
  "version": 2,
  "tasks": [
    {
      "id": "T1",
      "title": "Top-level task",
      "status": "in_progress"
    },
    {
      "id": "T1.1",
      "title": "Child task",
      "status": "todo",
      "parentId": "T1",
      "dependsOn": ["T1"]
    }
  ]
}
```

Rules:

- use `parentId` for parent-child/subtask relationships
- use `dependsOn` for prerequisites
- keep the file flat and inspectable
- task selection is deterministic: first actionable `in_progress`, then first actionable `todo`
- do not reintroduce implicit subtask inference as the main model
- preflight must detect duplicate ids, orphaned parents, invalid dependencies, dependency cycles, and impossible done-with-incomplete-dependencies states before CLI execution starts
- preserve simple task source metadata from the raw task file so diagnostics can reference array index plus line/column where feasible

Legacy normalization is allowed for simple old task files, but persisted output should be version 2.

## State And Artifacts

- durable objective text lives at `ralphCodex.prdPath` and defaults to `.ralph/prd.md`
- durable progress text lives at `ralphCodex.progressPath` and defaults to `.ralph/progress.md`
- durable tasks live at `ralphCodex.ralphTaskFilePath` and default to `.ralph/tasks.json`
- runtime state lives in `.ralph/state.json` and is mirrored to VS Code `workspaceState`
- prompts live in `.ralph/prompts/`
- CLI transcripts and last messages live in `.ralph/runs/`
- per-iteration artifacts live in `.ralph/artifacts/iteration-###/`
- each iteration folder includes `preflight-report.json`, `preflight-summary.md`, `prompt.md`, `prompt-evidence.json`, `execution-plan.json`, `cli-invocation.json` for CLI runs, `summary.md`, `execution-summary.json`, `verifier-summary.json`, and `iteration-result.json` when applicable
- `.ralph/artifacts/latest-summary.md` and `.ralph/artifacts/latest-result.json` are the stable entry points for the newest Ralph evidence, including blocked preflight starts
- `.ralph/artifacts/latest-preflight-report.json` and `.ralph/artifacts/latest-preflight-summary.md` always point to the newest preflight snapshot
- `.ralph/artifacts/latest-prompt.md` and `.ralph/artifacts/latest-prompt-evidence.json` are the stable entry points for the newest generated prompt and its structured inputs
- `.ralph/artifacts/latest-execution-plan.json` and `.ralph/artifacts/latest-cli-invocation.json` are the stable entry points for the newest execution-provenance records
- `Ralph Codex: Open Latest Ralph Summary` should prefer `latest-summary.md` over raw JSON surfaces
- extension logs live in `.ralph/logs/extension.log`

## Ralph Iteration Model

- phases are: `inspect`, `select task`, `generate prompt`, `execute`, `collect result`, `verify`, `classify outcome`, `persist state`, `decide whether to continue`
- prompt kinds are deterministic and currently include `bootstrap`, `iteration`, `fix-failure`, `continue-progress`, and `human-review-handoff`
- prompt generation may differ by target strategy (`cliExec` vs `ideHandoff`) but must not change the underlying Ralph loop model
- prompt generation should use compact summaries, not raw transcript dumps or full-repo enumeration
- before execution, Ralph must persist an execution plan that binds selected task, prompt kind, prompt target, template path, prompt artifact path, and prompt hash
- CLI execution must run the verified persisted prompt artifact content, not an unchecked ad hoc string
- CLI iterations emit a concise preflight summary before execution, persist it under the iteration artifact directory, and block immediately on severe preflight diagnostics
- verifier modes are `validationCommand`, `gitDiff`, and `taskState`
- machine-readable iteration results include selected task id/title, execution status, verification status, classification, stop reason, timestamps, and artifact references
- `Show Status` should remain readable without requiring users to inspect raw JSON
- adapter reporting must distinguish explicit CLI-path verification, missing paths, non-executable paths, PATH-only assumptions, and unavailable IDE command handoff
- prompt evidence should record template path, selection reason, and the compact structured inputs used to render the prompt
- execution provenance must remain explicit about what is guaranteed:
  CLI runs guarantee selected/rendered/executed prompt integrity.
  IDE handoff only guarantees the prepared prompt, not what a human may later paste or edit.

## Stop Behavior

The loop may stop for:

- `task_marked_complete`
- `verification_passed_no_remaining_subtasks`
- `iteration_cap_reached`
- `repeated_no_progress`
- `repeated_identical_failure`
- `human_review_needed`
- `execution_failed`
- `no_actionable_task`

Operational rule:

- `needs_human_review` must not be masked by verifier-driven completion
- verifier-driven completion only applies to genuine `partial_progress` with no remaining subtasks
- do not replace deterministic no-progress logic with “AI decides progress”

## Git And Safety

- git handling is detection/reporting only
- include git status snapshots and diff summaries when configured and available
- do not add branch creation, worktree orchestration, or destructive git behavior unless explicitly required by code and docs

## Codex Boundary

- IDE handoff is clipboard plus `vscode.commands.executeCommand(...)`
- scripted automation is `codex exec`
- do not invent direct composer injection or other unsupported Codex IDE APIs
- `preferredHandoffMode = cliExec` still does not make `Open Codex IDE` run the CLI

## Runtime And Testing

- supported packaging/runtime baseline is Node 20+
- `npm run validate` is the authoritative compile + type-check + test gate
- tests run under plain Node with a lightweight `vscode` preload stub plus temp-workspace integration cases
- command-shell smoke tests cover registration plus status/summary commands with mocked state and artifacts
- `npm run test:activation` is the thin real Extension Development Host smoke path; keep it focused on activation plus basic command registration/invocation
- keep integration tests lightweight; prefer temp directories, real files, and mocked Codex exec over heavy harnesses
