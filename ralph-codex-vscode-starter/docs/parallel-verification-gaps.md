# Parallel Verification Gaps

This document catalogues verification challenges and race conditions that arise when multiple Ralph iterations run concurrently. It is scoped to the current control-plane implementation and does not include fixes.

---

## Shared State Inventory

| Resource | Lock mechanism | Risk level |
|---|---|---|
| `.ralph/tasks.json` | `withTaskFileLock()` — exclusive advisory lock | TOCTOU window between ownership check and write |
| `.ralph/claims.json` | `withClaimFileLock()` — write-then-verify pattern | Well protected |
| `.ralph/progress.md` | **None** | HIGH — unprotected read-modify-write |
| `.ralph/agents/{id}.json` | **None** — temp-file + rename only | HIGH — last-writer-wins data loss |
| `.ralph/state.json` | None | Low — overwrite is idempotent |

---

## Gap 1 — TOCTOU Race in Completion Reconciliation (CRITICAL)

**Location:** `src/ralph/reconciliation.ts:148–176`

`inspectClaimOwnership()` checks whether the agent holds the active claim (line 148). `updateTaskFile()` then writes the new task status (line 176). These two operations are separated by approximately 28 lines of synchronous logic and are **not wrapped in a single atomic critical section**.

**Failure scenario:**
1. Agent A holds claim for Task T; passes ownership check at line 148.
2. Agent B steals or re-acquires the claim between lines 148 and 176.
3. Agent A proceeds to write 'done' for Task T under the task-file lock, which does not re-verify claim ownership.
4. Task T is now marked done by an agent that no longer owns it; Agent B's execution continues on a task the ledger already considers finished.

**Why existing locks don't prevent it:** `withTaskFileLock()` serialises file writes but does not keep the claim checked-out across the lock boundary. The claim check and the write are two separate I/O operations with no encompassing mutex.

---

## Gap 2 — `progress.md` Writes Are Unprotected (CRITICAL)

**Location:** `src/ralph/reconciliation.ts:265–274`

`appendProgressBullet()` performs a read-modify-write on `.ralph/progress.md` with no lock:

```
read current content → append bullet → write full file
```

Two agents completing at the same time will both read the same file content, both compute an updated string, and the later write will silently overwrite the earlier one. Progress entries are lost with no error.

The same pattern is used by the `escalate_to_human` watchdog action (`reconciliation.ts:332`), creating the same hazard for watchdog-originated notes.

---

## Gap 3 — Agent Identity Record Has No Lock (HIGH)

**Location:** `src/ralph/iterationEngine.ts:701–743`

`updateAgentIdentityRecord()` reads the existing record, computes the merged next record, writes a temp file, deletes the original, then renames the temp into place:

```
read record → compute update → write .tmp → rm original → rename .tmp → original
```

This is not equivalent to an atomic locked update. Two agents with the same `agentId` writing simultaneously will both read the same original, compute independent updates, and the second rename will overwrite the first, losing the first agent's completed-task history.

The temp-file name includes `process.pid` and `Date.now()` but both can collide at millisecond granularity on a single machine.

---

## Gap 4 — Watchdog and Build Agents Race on Task Graph Mutations (HIGH)

**Location:** `src/ralph/reconciliation.ts:222–355`

Watchdog actions (`decompose_task`, `resolve_stale_claim`) acquire the task-file lock and the claim-file lock independently and sequentially. There is no encompassing lock that prevents a build agent from:

1. Claiming a task while the watchdog is mid-decompose of that same task.
2. Reading a claim as valid while the watchdog is resolving it as stale.

The watchdog re-checks claim ownership before each action but does not hold a claim lock across the full mutation window, leaving gaps between the per-action checks.

---

## Gap 5 — Validation Command Execution Is Unverified (MEDIUM)

**Location:** `src/prompt/promptBuilder.ts` (validation hint), `src/ralph/reconciliation.ts:110–127`

The iteration prompt tells the agent which validation command to run (e.g. `npm run validate`). The completion report's `validationRan` field is **optional** and **purely informational**. Reconciliation generates a warning when `verificationStatus !== 'passed'` for a 'done' report but does **not block or reject** the status update.

Consequence: an agent can mark a task 'done' without ever running validation, and the ledger will accept it. In parallel runs, multiple agents doing this simultaneously can leave the build in a broken state while tasks.json shows all green.

---

## Gap 6 — Stale Task Context Between Prepare and Execute (MEDIUM)

**Location:** `src/ralph/iterationEngine.ts:1071–1140`

The iteration cycle has two distinct phases: **prepare** (builds prompt, writes plan artifact, hashes it) and **execute** (shells out to the CLI). Another agent can mutate `tasks.json` between these phases. The pre-execute integrity check (`iterationEngine.ts:1132–1140`) validates the plan-artifact hash and the prompt-artifact hash but does **not re-read or re-hash the task graph content**. An agent therefore executes with a prompt whose task context may describe a task that another agent already completed or decomposed.

---

## Gap 7 — Ledger Drift Detection Is Deferred (MEDIUM)

**Location:** `src/ralph/loopLogic.ts:52–61`

`done_parent_unfinished_descendants` drift is only detected at loop-decision time (next preflight). `autoCompleteSatisfiedAncestors()` (called inside `reconcileCompletionReport()`) can mark ancestor tasks done, but if a sibling child is still open, the resulting drift is not detected until the **following iteration's** preflight. In parallel execution, this window can span multiple simultaneous reconciliations, accumulating drift that is only caught one cycle later.

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
| 1 | TOCTOU between claim check and task-file write | CRITICAL | `reconciliation.ts:148–176` |
| 2 | `progress.md` unprotected read-modify-write | CRITICAL | `reconciliation.ts:265–274` |
| 3 | Agent identity record has no lock | HIGH | `iterationEngine.ts:701–743` |
| 4 | Watchdog + build agent race on task graph | HIGH | `reconciliation.ts:222–355` |
| 5 | Validation execution is unverified | MEDIUM | `reconciliation.ts:110–127` |
| 6 | Stale task context between prepare and execute | MEDIUM | `iterationEngine.ts:1071–1140` |
| 7 | Ledger drift detected one cycle too late | MEDIUM | `loopLogic.ts:52–61` |
| 8 | Lock files accumulate on process crash | LOW | `taskFile.ts:382–428` |
| 9 | No hard rejection in completion report state machine | LOW | `completionReportParser.ts:50–67` |
| 10 | No version numbers on `tasks.json` | LOW | `taskFile.ts` (file format) |
