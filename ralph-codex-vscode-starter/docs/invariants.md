# Invariants

This document owns what must remain true in the Ralph control plane and artifact model.

Related docs:

- [Architecture](architecture.md) for module layout
- [Provenance](provenance.md) for trust-chain details
- [Verifier](verifier.md) for verifier and stop semantics
- [Boundaries](boundaries.md) for explicit non-goals

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
- Parent-versus-descendant completion must stay monotonic: a task may be `done` only when every explicit descendant is also `done`.
- If a parent still has unfinished descendants, reopen the parent or complete/block the descendants explicitly; do not hide remaining work by leaving the parent `done`.
- Do not reintroduce implicit subtask inference as the main task model.
- `remainingSubtasks` and backlog logic must use explicit descendants and dependencies, not task-id prefix guesses.

Legacy normalization is allowed for simple older task files, but persisted output should still end as version 2.

Task claims are a separate, file-backed coordination surface:

- claim records live in a version `1` JSON file with an append-only `claims` array
- active ownership for a task is the canonical latest active claim for that `taskId`
- acquisition must not overwrite an existing canonical holder; it returns a contested result instead
- acquisition writes the new active claim, rereads the file, and only succeeds if that reread still shows the same canonical holder
- release is idempotent and only marks the canonical active claim held by the requesting agent as `released`
- stale claims are detectable from `claimedAt` plus a configurable TTL, but Ralph must not auto-release them without an operator decision
- preflight and `Show Status` must surface claim-graph state separately from task-graph drift, including contested active claims, stale active claims, and canonical claims whose `provenanceId` differs from the current iteration provenance
- `Prepare Prompt` and `Open Codex IDE` must not acquire durable active claims; only the CLI execution path may hold a blocking task claim because it also owns reconciliation and release
- when CLI selection encounters legacy active claims held by Ralph with an `-ide-` provenance id, it must release those non-blocking handoff claims and replace them with a fresh CLI claim so abandoned IDE handoffs cannot strand later selection
- operator stale-claim recovery is explicit: `Resolve Stale Task Claim` may mark only the canonical stale active claim as `stale`, must record `resolvedAt`, `resolvedBy`, and `resolutionReason`, and must return that task to the normal CLI selection pool instead of silently reassigning it
- status wording must keep the lifecycle explicit: CLI iterations own blocking claim acquire/release, IDE prompt preparation does not, and stale canonical claims require the operator recovery command rather than manual `claims.json` edits

## Task Graph Write Serialisation

All `tasks.json` mutation paths must acquire `tasks.lock` (a sibling file in the same directory) before reading, modifying, and writing the task file. This includes task-status reconciliation, task-graph replenishment, and any other code that produces a new `tasks.json`.

Lock mechanics:

- The lock file is `<dir>/tasks.lock` where `<dir>` is the directory containing `tasks.json`.
- Acquisition uses an exclusive `wx` open, which atomically fails if the file already exists.
- The lock is held only for the duration of the read–modify–write cycle; it is not a long-lived lease.
- Maximum hold duration is bounded by the operation itself. The default retry budget is `lockRetryCount × lockRetryDelayMs` (default `10 × 25 ms = 250 ms`). Any caller that needs a longer window must pass explicit options.
- On timeout, `withTaskFileLock` returns `{ outcome: 'lock_timeout', lockPath, attempts }` without throwing. The caller is responsible for surfacing this as a preflight failure.
- The lock file is always removed in a `finally` block, so normal exits and in-process exceptions both clean up correctly.
- An abrupt process termination (SIGKILL, power loss) will leave the lock file on disk. Operators must remove a stale `tasks.lock` manually before the next iteration can proceed. Ralph preflight should detect an unexpectedly old lock file and surface it as a warning so operators know to intervene.

## Preflight Invariants

Before CLI execution starts, preflight must run and remain deterministic.

It must detect:

- duplicate ids
- orphaned parents
- invalid dependencies
- dependency cycles
- done parents with unfinished descendants
- impossible done-with-incomplete-dependencies states
- likely schema drift such as `dependencies` instead of `dependsOn`

Task diagnostics should preserve lightweight source metadata from the raw task file so messages can cite array index plus line/column when feasible.

Severe preflight findings must block CLI execution before `codex exec` starts.

Task-ledger drift is one of those blocking findings. When a persisted parent is `done` while any descendant remains `todo`, `in_progress`, or `blocked`, Ralph must treat the backlog as inconsistent rather than exhausted. In that state, status and preflight surfaces should keep the drift explicit with messages like `No task selected because task-ledger drift blocks safe selection: ...` and `Task-ledger drift: ...` so operators repair the ledger instead of assuming Ralph needs new work.

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
- when the durable backlog is exhausted and the task ledger is internally consistent, Ralph may run a dedicated replenishment prompt that updates `.ralph/tasks.json`; it must still leave the task file explicit, flat, and version 2
- when the task ledger is inconsistent, replenish-backlog context must preserve that distinction and direct the operator or model to repair `.ralph/tasks.json` before adding new tasks
- during normal CLI task execution, Ralph reconciles the model's structured completion report locally; the model does not directly persist `.ralph/tasks.json` or `.ralph/progress.md`
- prompt generation may differ by `cliExec` versus `ideHandoff`, but the underlying loop model must not change
- the loop coordinates one selected task and one Codex execution at a time; multi-agent orchestration acceptance criteria were satisfied on 2026-03-17 (see docs/multi-agent-readiness.md), but coordinating multiple concurrent agents remains an operator concern outside the built-in loop
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
- `task-remediation.json` when repeated-stop remediation is emitted for that iteration
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
- `latest-remediation.json` when repeated-stop remediation exists for the latest applicable iteration
- `latest-provenance-bundle.json` and `latest-provenance-summary.md`
- `latest-provenance-failure.json` when a blocked integrity artifact exists

Command behavior depends on those stable entry points:

- `Open Latest Ralph Summary` prefers `latest-summary.md`
- when a latest summary Markdown surface is manually deleted, Ralph should deterministically recreate it from the surviving latest JSON artifact before treating it as absent
- `Open Latest Provenance Bundle` prefers `latest-provenance-summary.md`
- `Open Latest Prompt Evidence` opens `latest-prompt-evidence.json`
- `Open Latest CLI Transcript` prefers the transcript path referenced by `latest-cli-invocation.json` and falls back to the newest last-message artifact
- `Show Status` should surface the newest remediation summary from `latest-remediation.json` when repeated-stop guidance exists, even if the latest iteration state is stale
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
- manual maintenance cleanup may prune older generated prompts, runs, and iteration directories more aggressively than on-write retention, but it must still preserve the current state roots (`lastPromptPath`, `lastRun.*`, `lastIteration.*`), the stable latest-pointer artifacts, and the stable latest summary surfaces
- `latest-provenance-bundle.json` and `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths; they do not protect prompt files in `.ralph/prompts/` or transcript/last-message pairs in `.ralph/runs/`
- within those latest-pointer JSON artifacts, only the prompt, transcript/last-message, iteration-directory, preflight, summary, execution-plan, CLI-invocation, iteration-result, and provenance-failure path fields count as protected references
- cleanup runs after Ralph persists prompt or iteration provenance so prompt-only and executed paths converge on the same retention rule
- allow `0` to disable automatic cleanup

Git handling is detection/reporting only. Do not add branch orchestration, worktree orchestration, or destructive git behavior as part of the control plane.
