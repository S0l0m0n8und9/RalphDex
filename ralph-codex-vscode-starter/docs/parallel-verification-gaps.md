# Parallel Verification Gaps

This document catalogues verification challenges and race conditions that arise when multiple Ralph iterations run concurrently.

**Status:** Gaps 1 and 2 (CRITICAL) were fixed in `reconciliation.ts` by introducing `updateTaskFileWithVerification`. Gaps 3 and 4 (HIGH) were subsequently fixed. Gaps 5, 6, and 7 (MEDIUM) were fixed in the third tranche. Gaps 8, 9, and 10 (LOW) were fixed in the fourth tranche.

---

## Shared State Inventory

| Resource | Lock mechanism | Risk level |
|---|---|---|
| `.ralph/tasks.json` | `withTaskFileLock()` — exclusive advisory lock | ~~TOCTOU window between ownership check and write~~ **Fixed** |
| `.ralph/claims.json` | `withClaimFileLock()` — write-then-verify pattern | Well protected |
| `.ralph/progress.md` | `withTaskFileLock()` via `updateTaskFileWithVerification` (main path) and `updateTaskFileWithProgress` (watchdog path) | ~~Unprotected read-modify-write~~ **Fixed** |
| `.ralph/agents/{id}.json` | `withTaskFileLock()` on record path → `.ralph/agents/tasks.lock` | ~~HIGH — last-writer-wins data loss~~ **Fixed** |
| `.ralph/state.json` | None | Low — overwrite is idempotent |

---

## Gap 1 — TOCTOU Race in Completion Reconciliation ~~(CRITICAL)~~ **Fixed**

**Location:** `src/ralph/reconciliation.ts` — replaced by `updateTaskFileWithVerification`

**Fix:** The standalone `inspectClaimOwnership` call and the subsequent `updateTaskFile` call were replaced by a single `updateTaskFileWithVerification` call that re-checks claim ownership inside the `withTaskFileLock` callback. Claim check, task write, and progress.md append now execute inside the same critical section.

~~`inspectClaimOwnership()` checks whether the agent holds the active claim (line 148). `updateTaskFile()` then writes the new task status (line 176). These two operations are separated by approximately 28 lines of synchronous logic and are **not wrapped in a single atomic critical section**.~~

**Original failure scenario (no longer possible):**
1. Agent A holds claim for Task T; passes ownership check.
2. Agent B steals or re-acquires the claim between the check and the write.
3. Agent A proceeds to write 'done' under the task-file lock without re-verifying ownership.
4. Task T is marked done by an agent that no longer owns it.

---

## Gap 2 — `progress.md` Writes Are Unprotected ~~(CRITICAL)~~ **Fixed**

**Location:** `src/ralph/reconciliation.ts` — fixed in main reconciliation path and watchdog path

**Fix:** The `appendProgressBullet` call that followed `updateTaskFile` was moved inside the `updateTaskFileWithVerification` critical section. The progress.md write now happens under `withTaskFileLock`, so concurrent completions can no longer interleave or clobber each other's progress entries on the main path.

**Remaining exposure:** The `escalate_to_human` watchdog action now uses `updateTaskFileWithProgress` (which holds `withTaskFileLock`), so the original unprotected `appendProgressBullet` race is closed. The remaining open race is the broader `decompose_task` / `resolve_stale_claim` vs concurrent build-agent claim acquisition described in Gap 4.

---

## Gap 3 — Agent Identity Record Has No Lock ~~(HIGH)~~ **Fixed**

**Location:** `src/ralph/iterationEngine.ts` — `updateAgentIdentityRecord`

**Fix:** The entire read-compute-write cycle is now wrapped in `withTaskFileLock(recordPath, ...)`, which creates `.ralph/agents/tasks.lock` as an advisory lock (separate from `.ralph/tasks.lock`). Concurrent agents sharing the same `agentId` serialise on this lock; the temp-file rename is retained for crash safety.

~~`updateAgentIdentityRecord()` reads the existing record, computes the merged next record, writes a temp file, deletes the original, then renames the temp into place. This is not equivalent to an atomic locked update. Two agents writing simultaneously will both read the same original and the second rename overwrites the first, losing completed-task history.~~

---

## Gap 4 — Watchdog and Build Agents Race on Task Graph Mutations ~~(HIGH)~~ **Fixed**

**Location:** `src/ralph/reconciliation.ts` — `processWatchdogActions`

**Fix:** The `escalate_to_human` branch now uses `updateTaskFileWithProgress` under `withTaskFileLock`. The `resolve_stale_claim` branch now uses `resolveStaleClaimByTask` which performs the canonical-claim lookup and resolution inside a single `withClaimFileLock` acquisition, closing the TOCTOU window where a build agent could acquire the task's claim between an unlocked graph read and the locked resolution. The `decompose_task` branch writes under `withTaskFileLock`.

**Remaining exposure:** The broader race between watchdog `decompose_task` and concurrent build-agent claim acquisition still involves two separate lock domains (task-file lock and claim-file lock). A build agent could claim a task while the watchdog is mid-decompose. The failure mode is safe (the decomposition adds child tasks but does not invalidate an existing claim), but the two operations are not transactionally atomic.

---

## Gap 5 — Validation Command Execution Is Unverified ~~(MEDIUM)~~ **Fixed (observability)**

**Location:** `src/ralph/reconciliation.ts` — `reconcileCompletionReport`

**Fix:** After the hard-block guard that already rejects 'done' reports when `verificationStatus !== 'passed'`, a non-blocking warning is now appended to the artifact when `requestedStatus === 'done'` and a validation command is configured (`prepared.validationCommand`) but the completion report omits `validationRan`. This makes silent validation skips visible in provenance bundles and iteration logs without blocking valid completions where the agent simply forgot the field.

**Remaining gap:** Ralph's `verificationStatus === 'passed'` gate does not require that the validation-command verifier specifically ran — a passing file-change verifier is sufficient. Agents that made file changes but never ran `npm test` can still mark tasks done if the file-change verifier passes. Closing this fully would require making the validation-command verifier mandatory when a command is configured.

---

## Gap 6 — Stale Task Context Between Prepare and Execute ~~(MEDIUM)~~ **Fixed**

**Location:** `src/ralph/iterationEngine.ts` — `runCliIteration`, inner exec try/catch

**Fix:** After the prompt-artifact integrity check and immediately before `execStrategy.runExec`, the selected task is re-read from a fresh `tasks.json`. If the task status is `'done'` (completed by a concurrent agent), a `StaleTaskContextError` is thrown and caught by the surrounding catch block, which converts it into a clean `executionStatus: 'skipped'` result with a warning rather than wasting CLI compute or propagating an error to the caller.

---

## Gap 7 — Ledger Drift Detection Is Deferred ~~(MEDIUM)~~ **Fixed**

**Location:** `src/ralph/loopLogic.ts` and `src/ralph/reconciliation.ts`

**Fix (two parts):**

1. `loopLogic.ts` — `BACKLOG_REPLENISHMENT_DRIFT_CODES` contained `done_parent_unfinished_descendants` but `inspectTaskGraph` actually emits `completed_parent_with_incomplete_descendants`. The correct code was added to the set so the backlog-replenishment trigger now fires when the drift is detected at preflight time.

2. `reconciliation.ts` — After `updateTaskFileWithVerification` and watchdog actions complete, `inspectTaskGraph` is run on the post-reconciliation task file and any `completed_parent_with_incomplete_descendants` diagnostics are immediately appended to the artifact warnings. Drift is now surfaced in the same iteration that caused it rather than being deferred to the next preflight cycle.

---

## Gap 8 — Lock Files Accumulate on Process Crash ~~(LOW)~~ **Fixed**

**Location:** `src/ralph/taskFile.ts` — `withTaskFileLock` and `withClaimFileLock`

**Fix:** Both lock functions now perform stale-lock detection on EEXIST. After the exclusive-create fails, `fs.stat()` is called on the lock file. If `Date.now() - mtimeMs > STALE_LOCK_THRESHOLD_MS` (5 minutes), the lock file is removed with `fs.rm(..., { force: true })` and the loop continues immediately without sleeping. If the stat itself throws (the lock was already removed by a concurrent agent between EEXIST and stat), the loop falls through to the normal retry sleep. This eliminates the need for manual operator cleanup after process crashes.

~~`tasks.lock` and `claims.lock` are exclusive-create advisory locks. If the process holding a lock crashes, the lock file persists on disk. The next agent retries for up to 1000 ms (40 retries × 25 ms) and then gives up with `lock_timeout`. There is no automatic stale-lock detection or cleanup; recovery requires manual deletion of the lock file.~~

---

## Gap 9 — No Hard Rejection Path in the Completion Report State Machine ~~(LOW)~~ **Fixed**

**Location:** `src/ralph/completionReportParser.ts`, `src/ralph/reconciliation.ts`

**Fix:** A `rejectionReason: string | null` field was added to `CompletionReportArtifact`. Each early-return rejection path in `reconcileCompletionReport` now sets a machine-readable reason code: `'task_id_mismatch'`, `'verification_failed'`, `'needs_human_review_with_done'`, `'blocked_overrides_complete'`, or `'claim_contested'`. The `artifactBase` initialises `rejectionReason` to `null`; the final `status: 'applied'` path leaves it null. This makes divergence cases self-documenting in provenance artefacts without requiring log file archaeology.

~~The `status: 'rejected'` value exists in the `RalphCompletionReportArtifact` type but is never emitted in practice. Divergence cases (AI reports 'done', verifier reports 'blocked') return `status: 'applied'` with warnings rather than `status: 'rejected'` with a hard stop. There is no configurable policy for how divergence should be handled, making enforcement dependent on future manual review.~~

---

## Gap 10 — No Version Numbers on `tasks.json` ~~(LOW)~~ **Fixed**

**Location:** `src/ralph/types.ts`, `src/ralph/taskFile.ts`, `src/ralph/reconciliation.ts`

**Fix:** A `mutationCount?: number` field was added to `RalphTaskFile`. `inspectTaskFileText` parses it from the JSON (accepting non-negative integers, ignoring absent or invalid values). `stringifyTaskFile` serialises it when present. A `bumpMutationCount` helper increments it (defaulting from 0). All three write paths — `updateTaskFile`, `updateTaskFileWithProgress`, and `updateTaskFileWithVerification` — call `bumpMutationCount` on the transformed task file before writing. Concurrent writes are now distinguishable in git history by their monotonically increasing counter, and post-hoc debugging no longer relies solely on external log files.

~~Concurrent writes to `tasks.json` are serialised by the task-file lock, but the file format contains no sequence number or vector clock. Conflicting parallel mutations are indistinguishable in git history and post-hoc debugging relies solely on log files rather than the file's own change record.~~

---

## Summary by Severity

| # | Gap | Severity | Key location |
|---|---|---|---|
| 1 | ~~TOCTOU between claim check and task-file write~~ **Fixed** | ~~CRITICAL~~ | `reconciliation.ts` → `updateTaskFileWithVerification` |
| 2 | ~~`progress.md` unprotected read-modify-write~~ **Fixed** | ~~CRITICAL~~ | `reconciliation.ts` → inside lock; watchdog path now uses `updateTaskFileWithProgress` |
| 3 | ~~Agent identity record has no lock~~ **Fixed** | ~~HIGH~~ | `iterationEngine.ts` → `updateAgentIdentityRecord` now uses `withTaskFileLock` |
| 4 | ~~Watchdog and build agents race on task graph mutations~~ **Fixed** | ~~HIGH~~ | `reconciliation.ts` → `resolveStaleClaimByTask` + `updateTaskFileWithProgress` |
| 5 | ~~Validation execution unverified~~ **Fixed (observability)** | ~~MEDIUM~~ | `reconciliation.ts` → non-blocking `validationRan` warning |
| 6 | ~~Stale task context between prepare and execute~~ **Fixed** | ~~MEDIUM~~ | `iterationEngine.ts` → `StaleTaskContextError` guard |
| 7 | ~~Ledger drift detected one cycle too late~~ **Fixed** | ~~MEDIUM~~ | `loopLogic.ts` + `reconciliation.ts` → immediate `inspectTaskGraph` check |
| 8 | ~~Lock files accumulate on process crash~~ **Fixed** | ~~LOW~~ | `taskFile.ts` → stale-lock detection in both lock functions |
| 9 | ~~No hard rejection in completion report state machine~~ **Fixed** | ~~LOW~~ | `completionReportParser.ts` → `rejectionReason` field; `reconciliation.ts` → reason codes |
| 10 | ~~No version numbers on `tasks.json`~~ **Fixed** | ~~LOW~~ | `types.ts` + `taskFile.ts` → `mutationCount`; `reconciliation.ts` → `bumpMutationCount` |
