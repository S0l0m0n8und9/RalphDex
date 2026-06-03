# Baking F5_content_engine iteration-failure resolutions into RalphDex

- **Date:** 2026-06-03
- **Status:** Approved (brainstorming) — pending implementation plan
- **Author:** Ben Jones (with Claude Code)

## Background

A RalphDex autonomous run on the `F5_content_engine` repository (16 iterations, all on
2026-06-02, extension **v1.2.0**) produced three distinct root-cause defects that, between
them, accounted for every failed or stalled iteration. They are documented as bug reports in
`F5_content_engine/.ralph/bug-reports/`:

| ID | Title | Severity | Iterations wasted |
|----|-------|----------|-------------------|
| BUG-001 | Misconfigured model ID `caude-opus-4-8` aborts execution | High | 1–3 |
| BUG-002 | Seed meta-task T2 has no acceptance criteria → planning-gate human-review loop | Medium | 4–7 |
| BUG-003 | T4 validation command uses bash quoting, fails on Windows shell | High | 10–16 |

All three were resolved *manually in the target repo* (config fix, backlog replenishment,
PowerShell rewrite). This spec bakes durable **prevention** into RalphDex itself so the same
classes of failure self-correct or escalate fast, instead of burning iterations.

### Shared meta-failure

The three bugs share one pattern: **the loop kept spending iterations on a failure it should
have recognized as terminal or had misattributed.** BUG-001 retried a hard config rejection
byte-for-byte; BUG-002 re-issued an identical human-review handoff four times; BUG-003 ran
seven iterations against a broken *verifier* while the actual work was correct. So the spine of
this work is **better failure attribution at the loop-decision layer**, fed by three sources.

### Current-state findings (code review)

The bug reports came from v1.2.0; the codebase has since evolved. Each prevention falls into
one of three buckets:

- **(A) Genuine gap** — no current handling.
- **(B) Partially handled** — the mechanism exists but its thresholds/triggers don't cover this case.
- **(C) Likely already fixed** — verify against current code; add a regression test rather than re-implement.

Notably **(C):** `captureGitStatus()` already runs `git status --porcelain=v1 -z
--untracked-files=all` (`src/ralph/verifier.ts:~390`), so untracked files *are* counted as
progress today — BUG-003 prevention #2 is already satisfied and only needs a regression test.

## Goals

- Recognize **non-retryable provider errors** (e.g. unknown/typo'd model ID) and escalate
  immediately instead of issuing byte-identical `fix-failure` retries.
- Prevent unactionable **seed/placeholder tasks** from entering the planning-gate
  human-review loop; route them to backlog replenishment.
- Stop re-issuing **identical human-review handoffs** for the same task + same reason.
- Catch **Windows/bash shell mismatches** in validation commands — both before the run
  (preflight) and at authoring time (prompt guidance).
- Detect a **suspect verifier** early (execution succeeds, validation fails identically while
  files change) instead of burning the full repeated-failure budget.
- Lock in the already-correct **untracked-file progress** behavior with a regression test.

## Non-goals

- No maintained "known model list" / allowlist (model IDs churn; we classify the provider's
  runtime rejection instead).
- No new operator CLI, GitHub Actions, dashboard, or multi-agent orchestration (out of scope
  per `.ralph/prd.md` and `docs/boundaries.md`).
- No change to the provider execution strategies themselves.

## Design

### Shared seam: `classifyProviderError()`

Extend `src/ralph/failureDiagnostics.ts` (which already has `classifyTransientFailure()`) with a
pure classifier:

```
classifyProviderError({ exitCode, message }) ->
  { kind: 'retryable' | 'non_retryable' | 'unknown', reason, matchedPattern }
```

- **Pure** — string/exit-code matching only; unit-testable in isolation, no new deps.
- **Conservative** — patterns start narrow and named: model rejections
  (`issue with the selected model`, `may not exist or you may not have access`),
  auth/credential rejections. Everything unmatched stays `unknown`, preserving current behavior.
- **Two consumers:**
  1. `IterationExecutor` stamps a new `providerErrorKind` field onto
     `RalphIterationExecutionSummary` (`src/ralph/types.ts`) where `executionStatus` is set.
  2. `loopLogic.decideLoopContinuation()` reads it; on `non_retryable` it stops with a new
     stop reason and a human-escalation message, short-circuiting the `fix-failure` retry.

### Workstream 1 — BUG-001: non-retryable provider errors (bucket A)

- **1a.** `classifyProviderError()` (shared seam above).
- **1b.** `providerErrorKind?: 'retryable' | 'non_retryable' | 'unknown'` on
  `RalphIterationExecutionSummary`; stamped in `src/ralph/iteration/IterationExecutor.ts`
  (~`:232`, where `executionStatus`/`executionErrors` are computed).
- **1c.** `src/ralph/loopLogic.ts` `decideLoopContinuation()`: on a `non_retryable` current
  result, return `shouldContinue: false` with new stop reason `non_retryable_provider_error`
  and a message surfacing the matched cause (e.g. *"Provider rejected the selected model —
  check the model ID for typos."*). This prevents `promptBuilder.decidePromptKind()` from
  selecting `fix-failure` and re-sending identical provider config.

### Workstream 2 — BUG-002: seed-task planning-gate loop (buckets A + B)

- **2a. (A)** Add optional `requiresReplacement?: boolean` to `RalphTask` (`src/ralph/types.ts`);
  register in `SUPPORTED_TASK_FIELDS` (`src/ralph/taskFile.ts:~30`); set it `true` on the seed
  tasks in `createDefaultTaskFile()` (`src/ralph/taskFile.ts:~767`).
- **2b. (A)** Loop/selection routing: when the only actionable task(s) are
  `requiresReplacement`, route straight to `replenish-backlog` rather than the planning gate, so
  a seed task can never reach the human-review-handoff path.
- **2c. (B)** Loop guard: when the planning gate escalates the **same task with the same
  normalized reason** ≥ N times, stop re-issuing identical handoffs. If the task is
  seed/`requiresReplacement`, auto-trigger `replenish-backlog`; otherwise hard-stop for the
  human. Reuses `countTrailingSameTaskClassifications(['needs_human_review'])`; requires
  capturing the human-review *reason* for comparison, normalized via the existing
  `normalizeFailureMessage()`.

### Workstream 3 — BUG-003: Windows validation + verifier-suspect (buckets A + B + C)

- **3a. (A) Preflight guard:** new `collectValidationCommandShellCompatibilityDiagnostics()` in
  `src/ralph/preflight.ts`, invoked from `buildPreflightReport()`. On `win32`, flag a stored
  `validation` string using bash idioms — `node -e "…"` with an outer double-quote wrapping the
  whole command, `$VAR` expansion, `| grep`, single-quote-wrapped inline scripts. Emits a
  `validationVerifier` **warning** (not a hard error — heuristic, must not false-fail legitimate
  cross-platform commands) naming the host shell and the working
  `pwsh -NoProfile -Command "…"` pattern.
- **3b. (A) Generation guidance:** inject the host shell into the prompt's validation-authoring
  instruction (`src/prompt/promptBuilder.ts` / `prompt-templates/`) so agent-authored commands
  target PowerShell on Windows up front. Upstream half of the defense-at-both-ends approach.
- **3c. (B) Verifier-suspect early detection:** add a no-progress signal
  `validation_failed_despite_execution_success` (execution succeeded **and** validation failed
  with an identical signature **and** relevant file changes present). On recurrence (threshold
  2), stop with a `verifier_suspect` reason whose message points the human at the validation
  command itself — well before the 7-iteration churn the F5 run suffered.
- **3d. (C) Regression only:** `captureGitStatus()` already includes untracked files. Add a
  regression test asserting an untracked-only change yields `gitDiff: passed` /
  `partial_progress`, locking in the v1.2.0-missing behavior.

### Cross-cutting: stop reasons & types

- New `RalphStopReason` values: `non_retryable_provider_error`, `verifier_suspect`.
- New optional fields: `RalphIterationExecutionSummary.providerErrorKind`;
  a captured human-review reason on the iteration result; `RalphTask.requiresReplacement`.
- Surface the new stop reasons wherever existing stop reasons are rendered (trust timeline /
  reconciliation summary) — minimal additive changes, no schema break (all fields optional).

## Error handling

- The classifier defaults to `unknown` on any unmatched failure, so behavior is unchanged for
  failures we don't explicitly recognize — no risk of mis-escalating transient errors.
- Preflight shell-mismatch is a **warning**, never a hard error; a false positive degrades to a
  visible note, not a blocked run.
- New stop reasons are additive enum members; older state files (which never contain them)
  continue to load.

## Testing strategy

- **Unit:** `classifyProviderError()` — model-typo signature, auth rejection, generic/unknown
  (stays `unknown`); shell-mismatch heuristic — bash idioms on win32 flagged, native pwsh and
  legitimate cross-platform commands not flagged.
- **loopLogic:** non-retryable result stops on iteration 1 (no 3× retry); repeated identical
  human-review reason auto-replenishes (seed) / hard-stops (non-seed); verifier-suspect signal
  stops at threshold 2 with execution-succeeded + identical-validation-failure + file changes.
- **taskFile:** `requiresReplacement` round-trips through normalization and is set on seed tasks.
- **Regression:** untracked-only change is counted as relevant progress.
- All changes gated by `npm run validate` (compile → check:docs → lint → tests).

## Rollout

Three independently-shippable workstreams. Suggested order: WS1 (highest severity, smallest
surface, establishes the shared seam) → WS3 (high severity) → WS2 (medium). Each is its own
commit/PR per repo git conventions.
