# Parallel Verification Gaps

This document catalogues verification challenges and race conditions that arise when multiple Ralph iterations run concurrently.

**Status:** Gaps 1 and 2 (CRITICAL) were fixed in `reconciliation.ts` by introducing `updateTaskFileWithVerification`. Gaps 3 and 4 (HIGH) were subsequently fixed. Gaps 5, 6, and 7 (MEDIUM) were fixed in the third tranche. Gaps 8–10 remain open.

---

## Shared State Inventory

| Resource | Lock mechanism | Risk level |
|---|---|---|
| `.ralph/tasks.json` | `withTaskFileLock()` — exclusive advisory lock | ~~TOCTOU window between ownership check and write~~ **Fixed** |
| `.ralph/claims.json` | `withClaimFileLock()` — write-then-verify pattern | Well protected |
| `.ralph/progress.md` | `withTaskFileLock()` via `updateTaskFileWithVerification` (main path) | ~~Unprotected read-modify-write~~ **Fixed** for main path; watchdog escalation still unprotected |
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

## Gap 2 — `progress.md` Writes Are Unprotected ~~(CRITICAL)~~ **Fixed (main path)**

**Location:** `src/ralph/reconciliation.ts` — fixed in main reconciliation path; watchdog path remains open

**Fix:** The `appendProgressBullet` call that followed `updateTaskFile` was moved inside the `updateTaskFileWithVerification` critical section. The progress.md write now happens under `withTaskFileLock`, so concurrent completions can no longer interleave or clobber each other's progress entries on the main path.

**Remaining exposure:** The `escalate_to_human` watchdog action (`reconciliation.ts:processWatchdogActions`) still calls `appendProgressBullet` outside any lock, so watchdog-originated progress notes are still vulnerable to concurrent overwrites. This is tracked under Gap 4.

---

## Gap 3 — Agent Identity Record Has No Lock ~~(HIGH)~~ **Fixed**

**Location:** `src/ralph/iterationEngine.ts` — `updateAgentIdentityRecord`

**Fix:** The entire read-compute-write cycle is now wrapped in `withTaskFileLock(recordPath, ...)`, which creates `.ralph/agents/tasks.lock` as an advisory lock (separate from `.ralph/tasks.lock`). Concurrent agents sharing the same `agentId` serialise on this lock; the temp-file rename is retained for crash safety.

~~`updateAgentIdentityRecord()` reads the existing record, computes the merged next record, writes a temp file, deletes the original, then renames the temp into place. This is not equivalent to an atomic locked update. Two agents writing simultaneously will both read the same original and the second rename overwrites the first, losing completed-task history.~~

---

## Gap 4 — Watchdog and Build Agents Race on Task Graph Mutations ~~(HIGH)~~ **Partially Fixed**

**Location:** `src/ralph/reconciliation.ts` — `processWatchdogActions`

**Fix (partial):** The `escalate_to_human` branch previously called `appendProgressBullet` (outside any lock) and then `updateTaskFile` as two separate operations. These are now a single `updateTaskFileWithProgress` call that writes both tasks.json and progress.md under one `withTaskFileLock` acquisition, eliminating the interleaved-write hazard for watchdog escalations.

**Remaining exposure:** The broader race between watchdog `decompose_task` / `resolve_stale_claim` actions and concurrent build-agent claim acquisition is not yet closed. Watchdog actions acquire the task-file lock and claim-file lock independently; there is no encompassing lock preventing a build agent from claiming a task that the watchdog is mid-decompose on. Closing this fully requires either a cross-file transaction guard or a cooperative protocol between build and watchdog agents.

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

## Gap 8 — Lock Files Accumulate on Process Crash (LOW)

**Location:** `src/ralph/taskFile.ts:382–428`

`tasks.lock` and `claims.lock` are exclusive-create advisory locks. If the process holding a lock crashes, the lock file persists on disk. The next agent retries for up to 1000 ms (40 retries × 25 ms) and then gives up with `lock_timeout`. There is no automatic stale-lock detection or cleanup; recovery requires manual deletion of the lock file.

---

## Gap 9 — No Hard Rejection Path in the Completion Report State Machine (LOW)

**Location:** `src/ralph/completionReportParser.ts:50–67`, `src/ralph/reconciliation.ts:110–127`

The `status: 'rejected'` value exists in the `RalphCompletionReportArtifact` type but is never emitted in practice. Divergence cases (AI reports 'done', verifier reports 'blocked') return `status: 'applied'` with warnings rather than `status: 'rejected'` with a hard stop. There is no configurable policy for how divergence should be handled, making enforcement dependent on future manual review.

---

## Gap 10 — No Version Numbers on `tasks.json` (LOW)

Concurrent writes to `tasks.json` are serialised by the task-file lock, but the file format contains no sequence number or vector clock. Conflicting parallel mutations are indistinguishable in git history and post-hoc debugging relies solely on log files rather than the file's own change record.

---

## Summary by Severity

| # | Gap | Severity | Key location |
|---|---|---|---|
| 1 | ~~TOCTOU between claim check and task-file write~~ **Fixed** | ~~CRITICAL~~ | `reconciliation.ts` → `updateTaskFileWithVerification` |
| 2 | ~~`progress.md` unprotected read-modify-write~~ **Fixed (main path)** | ~~CRITICAL~~ | `reconciliation.ts` → inside lock; watchdog path still open |
| 3 | ~~Agent identity record has no lock~~ **Fixed** | ~~HIGH~~ | `iterationEngine.ts` → `updateAgentIdentityRecord` now uses `withTaskFileLock` |
| 4 | ~~Watchdog escalation progress.md race~~ **Fixed**; broader watchdog/build race open | ~~HIGH~~ | `reconciliation.ts` → `updateTaskFileWithProgress` |
| 5 | ~~Validation execution unverified~~ **Fixed (observability)** | ~~MEDIUM~~ | `reconciliation.ts` → non-blocking `validationRan` warning |
| 6 | ~~Stale task context between prepare and execute~~ **Fixed** | ~~MEDIUM~~ | `iterationEngine.ts` → `StaleTaskContextError` guard |
| 7 | ~~Ledger drift detected one cycle too late~~ **Fixed** | ~~MEDIUM~~ | `loopLogic.ts` + `reconciliation.ts` → immediate `inspectTaskGraph` check |
| 8 | Lock files accumulate on process crash | LOW | `taskFile.ts:382–428` |
| 9 | No hard rejection in completion report state machine | LOW | `completionReportParser.ts:50–67` |
| 10 | No version numbers on `tasks.json` | LOW | `taskFile.ts` (file format) |
