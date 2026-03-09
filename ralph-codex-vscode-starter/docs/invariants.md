# Invariants

This document owns what must remain true in the Ralph control plane and artifact model.

Related docs:

- [Architecture](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md) for module layout
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for trust-chain details
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md) for verifier and stop semantics
- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md) for explicit non-goals

## Durable Workspace Model

These paths are stable parts of the product contract:

- objective text: `ralphCodex.prdPath`, default `.ralph/prd.md`
- progress log: `ralphCodex.progressPath`, default `.ralph/progress.md`
- task graph: `ralphCodex.ralphTaskFilePath`, default `.ralph/tasks.json`
- runtime state: `.ralph/state.json`, mirrored to VS Code `workspaceState`
- generated prompts: `.ralph/prompts/`
- CLI transcripts and last messages: `.ralph/runs/`
- per-iteration artifacts: `.ralph/artifacts/iteration-###/`
- run-level provenance bundles: `.ralph/artifacts/runs/<provenance-id>/`
- extension log: `.ralph/logs/extension.log`

`resetRuntimeState()` may remove generated runtime state and artifacts, but it must preserve the durable PRD, progress log, and task file.

## Task Graph Invariants

`tasks.json` is explicit, flat, and versioned:

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

Required rules:

- Persisted output must be version `2`.
- Use `parentId` for parent-child relationships.
- Use `dependsOn` for prerequisites.
- Keep the file flat and inspectable.
- Task selection stays deterministic: first actionable `in_progress`, then first actionable `todo`.
- Do not reintroduce implicit subtask inference as the main task model.
- `remainingSubtasks` and backlog logic must use explicit descendants and dependencies, not task-id prefix guesses.

Legacy normalization is allowed for simple older task files, but persisted output should still end as version 2.

## Preflight Invariants

Before CLI execution starts, preflight must run and remain deterministic.

It must detect:

- duplicate ids
- orphaned parents
- invalid dependencies
- dependency cycles
- impossible done-with-incomplete-dependencies states
- likely schema drift such as `dependencies` instead of `dependsOn`

Task diagnostics should preserve lightweight source metadata from the raw task file so messages can cite array index plus line/column when feasible.

Severe preflight findings must block CLI execution before `codex exec` starts.

## Iteration Model Invariants

The Ralph loop phases are fixed:

1. `inspect`
2. `select task`
3. `generate prompt`
4. `execute`
5. `collect result`
6. `verify`
7. `classify outcome`
8. `persist state`
9. `decide whether to continue`

The control plane stays deterministic:

- prompt kinds are `bootstrap`, `iteration`, `replenish-backlog`, `fix-failure`, `continue-progress`, and `human-review-handoff`
- when the durable backlog is exhausted, Ralph may run a dedicated replenishment prompt that updates `.ralph/tasks.json`; it must still leave the task file explicit, flat, and version 2
- during normal CLI task execution, Ralph reconciles the model's structured completion report locally; the model does not directly persist `.ralph/tasks.json` or `.ralph/progress.md`
- prompt generation may differ by `cliExec` versus `ideHandoff`, but the underlying loop model must not change
- the loop coordinates one selected task and one Codex execution at a time; broad multi-agent orchestration remains deferred until nested root policy stays deterministic, test-backed, and persisted in durable evidence
- prompt context stays compact; no raw transcript dumping and no full-repo enumeration
- execution must bind to persisted artifacts before launch
- machine-readable results must keep selected task, execution status, verification status, classification, stop reason, timestamps, and artifact references
- machine-readable results must also record completion-report reconciliation status and warnings when that contract applies
- status surfaces must remain readable without forcing users to inspect raw JSON

Selected-task completion is not the same as backlog completion. Summaries and status surfaces must keep remaining backlog explicit.

## Artifact Model Invariants

Each iteration directory is predictable and should include the artifacts that apply to that path:

- `preflight-report.json`
- `preflight-summary.md`
- `prompt.md`
- `prompt-evidence.json`
- `execution-plan.json`
- `cli-invocation.json` for CLI runs
- `completion-report.json` for CLI runs
- `summary.md`
- `execution-summary.json`
- `verifier-summary.json`
- `iteration-result.json` when an iteration result exists

Run-level provenance bundles are first-class artifacts, not optional debugging leftovers. Each bundle should include:

- `provenance-bundle.json`
- `summary.md`
- copied preflight, prompt, evidence, and plan surfaces
- `provenance-failure.json` plus `provenance-failure-summary.md` when launch integrity blocks execution

Stable latest pointers are part of the operator interface and must stay current:

- `latest-summary.md` and `latest-result.json`
- `latest-preflight-report.json` and `latest-preflight-summary.md`
- `latest-prompt.md` and `latest-prompt-evidence.json`
- `latest-execution-plan.json` and `latest-cli-invocation.json`
- `latest-provenance-bundle.json` and `latest-provenance-summary.md`
- `latest-provenance-failure.json` when a blocked integrity artifact exists

Command behavior depends on those stable entry points:

- `Open Latest Ralph Summary` prefers `latest-summary.md`
- `Open Latest Provenance Bundle` prefers `latest-provenance-summary.md`
- `Reveal Latest Provenance Bundle Directory` reveals the newest run-bundle directory

## Retention And Cleanup Invariants

Run-bundle cleanup stays deterministic and file-based:

- keep the newest bundle plus the newest `N` bundles configured by retention
- never delete a bundle still referenced by any latest pointer
- allow `0` to disable automatic cleanup

Generated non-provenance artifact cleanup also stays deterministic and file-based:

- `ralphCodex.generatedArtifactRetentionCount` bounds `.ralph/prompts/`, `.ralph/runs/`, and `.ralph/artifacts/iteration-###/`
- cleanup keeps the newest `N` generated prompts, run artifact pairs, and iteration directories by parsed iteration number
- cleanup resolves each generated-artifact category independently: keep the newest `N` entries first, then union in any protected references, and report retained entries in newest-first iteration order
- when retention and protection conflict, protection only adds the referenced older entries; it does not evict or reorder the newer `N` entries already retained by iteration precedence
- cleanup summaries and logs must also report which retained entries were added only because of protected references, so precedence conflicts remain inspectable without re-deriving the set difference by hand
- cleanup only treats the following records as protected roots for generated artifacts:
- `.ralph/state.json`: `lastPromptPath`, `lastRun.promptPath`, `lastRun.transcriptPath`, `lastRun.lastMessagePath`, `lastIteration.artifactDir`, `lastIteration.promptPath`, `lastIteration.execution.transcriptPath`, `lastIteration.execution.lastMessagePath`, and the same prompt, transcript, last-message, and iteration-directory fields within every `runHistory[]` and `iterationHistory[]` entry
- those direct state path references stay protected even when an older raw state record omits the matching run `iteration`; iteration-directory protection is only derived when an iteration number is present
- when persisted state omits `lastIteration` or `iterationHistory[]`, cleanup derives the equivalent protected iteration-directory, prompt, transcript, and last-message references from the stored `lastRun` or `runHistory[]` iteration numbers
- stable latest-pointer JSON artifacts: `latest-result.json`, `latest-preflight-report.json`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-bundle.json`, and `latest-provenance-failure.json`
- stable latest-summary surfaces: `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` can each protect only the implied iteration directory when their persisted heading, iteration line, or artifact-path lines still point at an older retained iteration
- `latest-result.json` can independently protect an older iteration directory, prompt file, and transcript/last-message pair through its persisted `artifactDir`, `summaryPath`, `promptPath`, `promptArtifactPath`, `transcriptPath`, and `lastMessagePath`
- `latest-preflight-report.json` can independently protect an older iteration directory through its persisted `artifactDir`, `reportPath`, and `summaryPath`; it does not protect prompt or run artifacts by itself
- `latest-execution-plan.json` can independently protect an older iteration directory and prompt file through its persisted `artifactDir`, `promptPath`, `promptArtifactPath`, and `executionPlanPath`; `latest-cli-invocation.json` can independently protect an older iteration directory plus its transcript/last-message pair through `promptArtifactPath`, `cliInvocationPath`, `transcriptPath`, and `lastMessagePath`
- `latest-prompt-evidence.json` protects the prompt file and iteration directory implied by its persisted `kind` plus `iteration`; it does not protect transcript or last-message files by itself
- `latest-provenance-bundle.json` and `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths; they do not protect prompt files in `.ralph/prompts/` or transcript/last-message pairs in `.ralph/runs/`
- within those latest-pointer JSON artifacts, only the prompt, transcript/last-message, iteration-directory, preflight, summary, execution-plan, CLI-invocation, iteration-result, and provenance-failure path fields count as protected references
- cleanup runs after Ralph persists prompt or iteration provenance so prompt-only and executed paths converge on the same retention rule
- allow `0` to disable automatic cleanup

Git handling is detection/reporting only. Do not add branch orchestration, worktree orchestration, or destructive git behavior as part of the control plane.
