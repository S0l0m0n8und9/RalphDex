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
      "status": "in_progress",
      "acceptance": ["All child tasks are complete", "Validation passes"],
      "constraints": ["Do not change the task file schema"],
      "context": ["src/ralph/taskFile.ts", "src/ralph/types.ts"]
    },
    {
      "id": "T1.1",
      "title": "Child task",
      "status": "todo",
      "parentId": "T1",
      "dependsOn": ["T1"],
      "tier": "simple"
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
- stale claims are detectable from `claimedAt` plus a configurable TTL, but Ralph must not silently reassign or release them outside a bounded recovery path
- preflight and `Show Status` must surface claim-graph state separately from task-graph drift, including contested active claims, stale active claims, and canonical claims whose `provenanceId` differs from the current iteration provenance
- `Prepare Prompt` and `Open Codex IDE` must not acquire durable active claims; only the CLI execution path may hold a blocking task claim because it also owns reconciliation and release
- when CLI selection encounters legacy active claims held by Ralph with an `-ide-` provenance id, it must release those non-blocking handoff claims and replace them with a fresh CLI claim so abandoned IDE handoffs cannot strand later selection
- operator stale-claim recovery is explicit: `Resolve Stale Task Claim` may mark only the canonical stale active claim as `stale`, must record `resolvedAt`, `resolvedBy`, and `resolutionReason`, and must return that task to the normal CLI selection pool instead of silently reassigning it
- watchdog stale-claim recovery is also explicit: the watchdog role may mark only a canonical stale active claim as `stale`, must persist the same recovery fields plus the watchdog identity, and must stay limited to durable evidence surfaced through preflight and iteration history instead of speculative reassignment
- status wording must keep the lifecycle explicit: CLI iterations own blocking claim acquire/release, IDE prompt preparation does not, and stale canonical claims are recoverable only through the operator command or the dedicated watchdog reconciliation path rather than manual `claims.json` edits

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

## State File Write Serialisation

All `state.json` mutation paths must acquire `state.lock` (a sibling file in the same directory) before writing. Every call to `saveState` in `stateManager.ts` must hold this lock for the duration of its write.

Lock mechanics:

- The lock file is `<dir>/state.lock` where `<dir>` is the directory containing `state.json`.
- Acquisition uses an exclusive `wx` open, which atomically fails if the file already exists.
- The lock is held only for the duration of the write cycle; it is not a long-lived lease.
- Maximum hold duration is bounded by the write operation itself. The default retry budget is `lockRetryCount × lockRetryDelayMs` (default `120 × 250 ms = 30 s`). Any caller that needs a longer window must pass explicit options.
- On timeout, `withStateLock` returns `{ outcome: 'lock_timeout', lockPath, attempts }` without throwing. `saveState` converts a timeout result to a thrown error so callers fail fast rather than silently skipping persistence.
- The lock file is always removed in a `finally` block, so normal exits and in-process exceptions both clean up correctly.
- An abrupt process termination (SIGKILL, power loss) will leave the lock file on disk. Operators must remove a stale `state.lock` manually if subsequent `saveState` calls time out.
- Preflight must detect an unexpectedly old `state.lock` file and surface it as a warning so operators know to intervene, matching the same check performed for `tasks.lock`.

### saveState vs allocateIteration

`saveState` and `allocateIteration` have different concurrency safety properties:

- `saveState` serializes individual writes: two concurrent callers cannot corrupt the file, but each writes the snapshot supplied by its caller. If they hold different snapshots, the last writer wins — no corruption, but the final value is the last-written snapshot.
- `allocateIteration` is safe for concurrent callers: it re-reads live `state.json` from disk inside the lock before computing and writing the updated counter. Two concurrent allocations will always produce distinct iteration numbers.

Use `allocateIteration` for any counter that must be unique across concurrent callers. Use `saveState` only when the caller already holds a serialized, canonical view of the state — the normal Ralph loop runs one iteration at a time, so this is safe.

`recordIteration` updates `nextIteration` directly as `result.iteration + 1` via `saveState` (without re-reading disk) because the loop model serializes iterations at the orchestration level. If the loop ever permits concurrent iterations, those paths must switch to `allocateIteration` instead.

### VS Code Memento Mirroring

`saveState` writes to both `state.json` on disk and VS Code `workspaceState` (Memento) within the same lock acquisition:

- The Memento write happens after the file write, inside the same `withStateLock` callback.
- If the process crashes between the two writes, disk and Memento can diverge.
- `loadState` reads disk first and falls back to Memento only when `state.json` is absent or unparseable.
- `allocateIteration` reads disk inside the lock, falling back to Memento only when the disk read fails.
- `state.json` is the canonical source of truth; Memento is a secondary fallback for recovery when the file is absent.
- Operators who reset state manually (by deleting `state.json`) should be aware that a stale Memento value may surface as the loaded state until a new `saveState` call overwrites it.

### nextIteration Allocation

`nextIteration` must be allocated atomically before any artifact paths are constructed for a new iteration. The allocation is performed by `stateManager.allocateIteration`, which:

1. Acquires `state.lock`.
2. Reads the live `state.json` from disk (not a cached snapshot).
3. Captures the current `nextIteration` as the allocated number.
4. Increments `nextIteration` by 1 and writes the minimal update back to `state.json`.
5. Releases the lock and returns the allocated number.

All iteration artifact paths (`resolveIterationArtifactPaths`, `resolvePreflightArtifactPaths`, etc.) must receive the value returned by `allocateIteration`, not the pre-lock snapshot value. This guarantees that two concurrent agents can never receive the same iteration number even if they read the workspace snapshot at the same instant.

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

## Agent Health Checks

Every preflight run executes `checkStaleState` in-process (no LLM, no external process) and appends its results to the preflight report under the **Agent Health** section. The check is mechanical-only — it detects stale signals and surfaces them as warnings; it does not take recovery actions.

`checkStaleState` detects four stale-state signals:

1. **Stale `state.lock`**: if `state.lock` is older than the configurable threshold (`ralphCodex.staleLockThresholdMinutes`, default 5 min), emit a `stale_state_lock` warning with the file age and an instruction to remove it manually if no iteration is in progress.
2. **Stale `tasks.lock`**: same pattern for `tasks.lock` — emit a `stale_tasks_lock` warning if older than the threshold.
3. **Active claim with no matching iteration result**: if an active claim in `claims.json` has a `claimedAt` older than the stale TTL and no matching `iteration-result.json` (same `provenanceId`, or same `taskId` for the same agent) exists after the claim time, emit a `stale_active_claim_no_result` warning per claim with agentId, taskId, and age.
4. **Active claim with no recent matching state run**: if an active claim is past the TTL with no matching finished run or iteration record in `state.json` after the claim time, emit a `stale_active_claim_agent_offline` warning indicating the agent may be offline.

Agent Health diagnostics appear in:

- The `preflight-report.json` artifact under the `agentHealth` category.
- The preflight summary rendered in `preflight-summary.md` under a dedicated Agent Health section.
- The `Show Status` command output, which includes the Agent Health summary line alongside Task graph, Claim graph, and other sections.

Recovery actions remain intentionally out of scope for `checkStaleState` itself. It only surfaces the stale signals. Claim recovery may then happen through `Resolve Stale Task Claim` or the dedicated watchdog reconciliation path, while lock-file removal still requires manual operator intervention.

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
- explicit model-claim versus verifier-evidence references when execution occurred, including the unverified `completion-report.json` path plus `execution-summary.json`, `verifier-summary.json`, and `iteration-result.json`
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

## Normalized Task Contract

This section defines the canonical shape and field-presence rules enforced by `normalizeTask` in `src/ralph/taskFile.ts`. Every newly created `RalphTask` — whether parsed from `tasks.json`, converted from a `RalphSuggestedChildTask`, or synthesized by any other producer — passes through normalization before it enters the in-memory task graph.

The canonical `RalphTask` interface lives in `src/ralph/types.ts`. The `SUPPORTED_TASK_FIELDS` set and normalization functions live in `src/ralph/taskFile.ts`. The shared producer-facing pipeline lives in `src/ralph/taskNormalization.ts`, and the shared persistence helpers used by command handlers and wizard writes live in `src/ralph/taskCreation.ts`.

### Shared Normalization Pipeline

`normalizeNewTask` in `src/ralph/taskNormalization.ts` is the single entry point that all task producers should use when creating new tasks. It applies alias mapping (`rationale` → `notes`, `suggestedValidationCommand` → `validation`), structured-dependency flattening (`{ taskId }[]` → `string[]`), `null` → `undefined` coercion, default status injection, field-name auto-correction, optional parent augmentation for derive-if-possible fields, and canonical normalization via `normalizeTask`. Producers that previously built raw task objects should call `normalizeNewTask` instead to guarantee consistent coercion and field preservation.

### Producer Entry Points

New tasks enter the system through one of these paths. Every path terminates in `normalizeTask` (directly or via `normalizeNewTask`), which enforces the rules below.

| Producer | Entry point | Notes |
|----------|-------------|-------|
| Manual edit of `tasks.json` | `parseTaskFileText` → `normalizeTask` | All fields come from the file author. The parser adds a `source` location for diagnostic reporting. |
| Task decomposition | `buildDecompositionProposal` → `applySuggestedChildTasks` → `normalizeNewTask` | Child IDs follow `${parentId}.${index}`. `dependsOn`, `validation`, `mode`, `tier`, and `acceptance` may be derived from the parent via `normalizeNewTask` augmentation. |
| Remediation (reframe / mark_blocked) | `remediationSuggestedChildTasks` → `applySuggestedChildTasks` → `normalizeNewTask` | Creates a single `.1` child scoped to the remediation action. |
| Pipeline root | `buildPipelineRootTask` → `normalizeNewTask` → write → `parseTaskFile` → `normalizeTask` | Minimal shape: only `id`, `title`, and `notes`. Status defaults to `'todo'`. |
| Pipeline children | `buildPipelineChildTasks` → `applySuggestedChildTasks` → `normalizeNewTask` | Children are derived from PRD sections with sequential dependencies. `validation: null` becomes `undefined` via `normalizeNewTask`. |
| PRD generation / bootstrap append | `generateProjectDraft` or command-local drafts → `appendNormalizedTasksToFile` → `normalizeNewTask` | Initialize Workspace, New Project, and Add Task append through the shared persistence helper so richer producer fields survive AI generation and fallback/bootstrap paths. |
| PRD wizard confirm-write | `writePrdWizardDraft` → `replaceTasksFileWithNormalizedTasks` → `normalizeNewTask` | Reviewed wizard tasks replace the target `tasks.json` through the same shared normalization/persistence boundary used by append flows. |

For paths that go through `applySuggestedChildTasks`, children are normalized at creation time via `normalizeNewTask` (which handles alias mapping, dependency flattening, parent augmentation, and canonical coercion). The subsequent write-then-read cycle via `applySuggestedChildTasksWithinLock` re-normalizes through `parseTaskFile` for consistency.

### Required Fields

These three fields must be present and valid on every task. Normalization throws if any is missing or has the wrong type.

| Field | Type | Validation |
|-------|------|------------|
| `id` | `string` | Must be a non-empty string. Trimmed of leading/trailing whitespace. |
| `title` | `string` | Must be a non-empty string. Trimmed of leading/trailing whitespace. |
| `status` | `RalphTaskStatus` | Must be one of `'todo'`, `'in_progress'`, `'blocked'`, `'done'`. |

### Optional Fields and Presence Categories

Optional fields follow one of three presence behaviors:

- **preserve-source**: kept exactly as the producer supplied it (after normalization coercion). The producer is the sole authority; the system never synthesizes or overrides this value.
- **derive-if-possible**: when the producer does not supply a value, a parent or context-aware path may derive one. The derived value is still subject to normalization coercion. During source parsing (reading `tasks.json`), no derivation occurs — the field survives only if the file author wrote it. Derivation happens exclusively in producer code paths like decomposition and pipeline construction.
- **leave-absent**: omitted from the normalized task unless the producer explicitly supplies a value. No automatic derivation, regardless of producer path.

| Field | Type | Category | Coercion Rules |
|-------|------|----------|----------------|
| `parentId` | `string?` | preserve-source | Trimmed. Returns `undefined` if empty or whitespace-only. |
| `dependsOn` | `string[]?` | derive-if-possible | Each entry trimmed, empties filtered, deduplicated via `Set`. Returns `undefined` if result array is empty. Decomposition derives sequential and inherited dependencies. |
| `notes` | `string?` | derive-if-possible | Trimmed. Returns `undefined` if empty or whitespace-only. Decomposition maps `rationale` → `notes`. |
| `validation` | `string?` | derive-if-possible | Trimmed. Returns `undefined` if empty or whitespace-only. Decomposition inherits parent's `validation`. `null` from suggested children becomes `undefined`. |
| `blocker` | `string?` | leave-absent | Trimmed. Returns `undefined` if empty or whitespace-only. |
| `priority` | `RalphTaskPriority?` | leave-absent | Must be `'low'`, `'normal'`, or `'high'`. Returns `undefined` if invalid or absent. Task selection treats absent as `'normal'` for ordering, but the stored value stays `undefined`. |
| `mode` | `RalphTaskMode?` | derive-if-possible | Must be `'default'` or `'documentation'`. Returns `undefined` if invalid. Decomposition inherits parent's `mode`. Runtime treats absent as `'default'`. |
| `tier` | `RalphTaskTier?` | derive-if-possible | Must be `'simple'`, `'medium'`, or `'complex'`. Returns `undefined` if invalid. Decomposition inherits parent's `tier` when present. When absent, runtime heuristic scoring determines complexity. |
| `acceptance` | `string[]?` | derive-if-possible | Each entry trimmed, empties filtered. Returns `undefined` if result array is empty. Decomposition derives acceptance from parent when possible. |
| `constraints` | `string[]?` | leave-absent | Each entry trimmed, empties filtered. Returns `undefined` if result array is empty. |
| `context` | `string[]?` | leave-absent | Each entry trimmed, empties filtered. Returns `undefined` if result array is empty. |
| `source` | `RalphTaskSourceLocation?` | preserve-source | Injected by the parser for diagnostic line/column reporting. Not persisted to disk; stripped during serialization. |

### Source Parsing vs Synthesis

When a task is read from `tasks.json` (source parsing), `normalizeTask` applies coercion but never invents field values. A field that is absent in the file stays absent after normalization. The derive-if-possible category only activates through explicit producer code in decomposition, remediation, or pipeline construction — not through `normalizeTask` itself.

This means:

- **acceptance**, **validation**, and **tier** written by a human in `tasks.json` survive normalization exactly as authored (after coercion). If the human omits them, they remain `undefined`.
- **constraints** and **context** are leave-absent: they survive only when a producer (human or code) explicitly sets them. Decomposition preserves these from `RalphSuggestedChildTask` when supplied but never synthesizes them.
- **mode** and **tier** are inherited from the parent during decomposition but left absent when parsing a manually authored `tasks.json` that omits them.

### Coercion Invariants

1. **String coercion**: optional string fields that contain only whitespace or are empty after trimming become `undefined`, not empty strings.
2. **Array coercion**: optional array fields filter out non-string entries and entries that are empty after trimming. If the resulting array is empty, the field becomes `undefined`, not `[]`.
3. **Dependency deduplication**: `dependsOn` passes through `Set` after trimming, so duplicate task IDs are silently collapsed.
4. **Enum rejection**: `priority`, `mode`, and `tier` silently become `undefined` when the supplied value is not a recognized enum member. They do not throw.
5. **Unknown-field drop**: only fields in `SUPPORTED_TASK_FIELDS` survive normalization. Any field not in that set is silently discarded. The supported set is: `id`, `title`, `status`, `parentId`, `dependsOn`, `notes`, `validation`, `blocker`, `priority`, `mode`, `tier`, `acceptance`, `constraints`, `context`.
6. **Auto-correction**: before normalization, commonly misspelled field names are auto-corrected with a diagnostic warning. The correction is applied before validation so the corrected field name enters normalization normally. See the auto-correction reference below.

### Auto-Correction Reference

The `LIKELY_TASK_FIELD_MISTAKES` map in `src/ralph/taskFile.ts` corrects these misspellings. Correction only applies when the target field is not already present on the task object.

| Misspelled name | Corrected to |
|-----------------|--------------|
| `dependencies`, `dependency`, `dependson`, `depends_on` | `dependsOn` |
| `acceptancecriteria`, `acceptance_criteria`, `donecriteria`, `done_criteria` | `acceptance` |
| `guardrails`, `guard_rails` | `constraints` |
| `files`, `relevantfiles`, `relevant_files` | `context` |
| `type`, `taskmode`, `task_mode`, `tasktype`, `task_type` | `mode` |

Field name comparison is case-insensitive and ignores non-alphanumeric characters (via `normalizedFieldKey`).

### Serialization and Persistence

`stringifyTaskFile` in `src/ralph/taskFile.ts` controls how the in-memory task graph is written back to `tasks.json`:

- The `source` field is stripped before serialization. It is diagnostic-only and never appears in the persisted file.
- Fields whose value is `undefined` are omitted from the JSON output (standard `JSON.stringify` behavior). This means optional fields that normalization set to `undefined` do not appear as `null` or empty in the file.
- The output is deterministic: `JSON.stringify(obj, null, 2)` with a trailing newline.
- The `mutationCount` field on the task file object is included only when present (non-`undefined`).

### Producer-Facing Type: `RalphSuggestedChildTask`

The `RalphSuggestedChildTask` interface in `src/ralph/types.ts` is the shape that decomposition, remediation, and pipeline code use to propose new child tasks before they are converted to persisted `RalphTask` entries.

| Field | Type | Required | Mapping to `RalphTask` |
|-------|------|----------|------------------------|
| `id` | `string` | yes | Direct. |
| `title` | `string` | yes | Direct. |
| `parentId` | `string` | yes | Direct. |
| `dependsOn` | `RalphSuggestedTaskDependency[]` | yes | Flattened to `string[]` via `.map(d => d.taskId)`. |
| `validation` | `string \| null` | yes | `null` becomes `undefined`. |
| `rationale` | `string` | yes | Maps to `notes`. |
| `acceptance` | `string[]?` | no | Preserved if supplied. |
| `constraints` | `string[]?` | no | Preserved if supplied. |
| `context` | `string[]?` | no | Preserved if supplied. |
| `tier` | `RalphTaskTier?` | no | Preserved if supplied. |

`RalphSuggestedTaskDependency` carries a `taskId` (string) and a `reason` (`'blocks_sequence'` or `'inherits_parent_dependency'`). Only `taskId` is persisted; the `reason` is used for proposal diagnostics.

### Child-Task Conversion Rules

When `applySuggestedChildTasks` converts a `RalphSuggestedChildTask` into a persisted `RalphTask`:

| Aspect | Rule |
|--------|------|
| `status` | Always forced to `'todo'` regardless of any suggested value. |
| `parentId` | Taken directly from the suggested child's `parentId`. |
| `dependsOn` | Extracted from `RalphSuggestedTaskDependency[].taskId`. |
| `validation` | `null` from the suggestion becomes `undefined` in the persisted task. |
| `notes` | Mapped from the suggestion's `rationale` field. |
| `mode` | Inherited from the parent task's `mode`, not from the suggestion. |
| `acceptance` | Preserved from the suggestion if supplied. |
| `constraints` | Preserved from the suggestion if supplied. |
| `context` | Preserved from the suggestion if supplied. |
| `tier` | Preserved from the suggestion if supplied. |
| Parent status | If the parent was `done` or `todo`, it is promoted to `'in_progress'`. |
| Parent `dependsOn` | Updated to include all new child IDs (deduplicated). |
