# F5 Iteration-Failure Resolution Bake-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake durable prevention for the three root-cause defects observed on the `F5_content_engine` run (BUG-001 model-ID typo, BUG-002 seed-task planning-gate loop, BUG-003 Windows validation command) into RalphDex so the same failure classes self-correct or escalate fast instead of burning iterations.

**Architecture:** A small pure failure-classification seam (`classifyProviderError`) feeds the loop-decision layer. Three independently-shippable workstreams build on it: WS1 (non-retryable provider errors), WS2 (seed-task routing + identical-handoff guard), WS3 (Windows shell preflight + generation guidance + verifier-suspect detection + an untracked-file regression test). All new type fields are optional/additive; no state-schema break.

**Tech Stack:** TypeScript (VS Code extension), `node:test` + `node:assert/strict`, compiled to `out-test/` and run via `npm test`. Validation gate: `npm run validate` (compile → check:docs → check:ledger → check:prompt-budget → lint → test).

**Spec:** `docs/superpowers/specs/2026-06-03-bug-resolution-bakein-design.md`

---

## Conventions for every task

- **Run a single test file** (fast loop): `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/<name>.test.js`
- If a prior branch left a stale `out-test/`, remove it first: `rm -rf out-test` (known local-flake source).
- **Commit** after each green task. Stage specific files (`git add <file>`), never `git add .`. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Branch is already `bug-resolution-bakein` (off `origin/main`).

## File-structure map

| File | Responsibility | Change |
|---|---|---|
| `src/ralph/failureDiagnostics.ts` | Pure failure classifiers | **Add** `classifyProviderError()` + patterns |
| `src/ralph/types.ts` | Shared types | **Add** `providerErrorKind` to exec summary; 2 stop reasons; `requiresReplacement` on `RalphTask` |
| `src/ralph/iteration/IterationExecutor.ts` | Runs the provider, builds `IterationExecutionResult` | **Add** `providerErrorKind` field, compute at status assignment |
| `src/ralph/iteration/OutcomeClassifier.ts` | Builds `RalphIterationResult.execution` summary | **Thread** `providerErrorKind` into the summary |
| `src/ralph/iterationEngine.ts` | Alternate execution-summary assembly | **Thread** `providerErrorKind` into the summary |
| `src/ralph/loopLogic.ts` | Outcome classification + stop decisions | **Add** non-retryable stop branch; verifier-suspect signal + stop |
| `src/prompt/promptBuilder.ts` | Prompt-kind selection; validation-authoring guidance | **Guard** fix-failure on non-retryable; **inject** host-shell guidance |
| `src/ralph/taskFile.ts` | Task schema support + default seed file | **Register** `requiresReplacement`; set it on seed tasks |
| `src/ralph/preflight.ts` | Preflight diagnostics | **Add** shell-compatibility diagnostic |
| `test/failureDiagnostics.test.ts` | Classifier unit tests | **Add** provider-error cases |
| `test/loopLogic.test.ts` | Loop-decision tests | **Add** non-retryable + verifier-suspect cases |
| `test/taskFile.test.ts` | Task-file tests | **Add** `requiresReplacement` round-trip + seed cases |
| `test/preflight.shellCompat.test.ts` | New preflight test | **Create** |
| `test/verifier.test.ts` | Verifier tests | **Add** untracked-only regression |

---

# Workstream 1 — BUG-001: non-retryable provider errors

### Task 1.1: `classifyProviderError()` classifier

**Files:**
- Modify: `src/ralph/failureDiagnostics.ts` (after `classifyTransientFailure`, ~`:33`)
- Test: `test/failureDiagnostics.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/failureDiagnostics.test.ts` (and add `classifyProviderError` to the import from `../src/ralph/failureDiagnostics` at the top):

```typescript
test('classifyProviderError flags an unknown/typo model ID as non_retryable', () => {
  const out = classifyProviderError({
    exitCode: 1,
    message: "claude exited with code 1: There's an issue with the selected model (caude-opus-4-8). It may not exist or you may not have access to it."
  });
  assert.equal(out.kind, 'non_retryable');
  assert.match(out.reason, /model/i);
});

test('classifyProviderError flags an auth rejection as non_retryable', () => {
  const out = classifyProviderError({ exitCode: 1, message: 'Error: invalid api key / authentication failed' });
  assert.equal(out.kind, 'non_retryable');
});

test('classifyProviderError leaves a transient network failure as retryable', () => {
  const out = classifyProviderError({ exitCode: 1, message: 'connect ECONNREFUSED 127.0.0.1:443' });
  assert.equal(out.kind, 'retryable');
});

test('classifyProviderError returns unknown for an unrecognized non-zero failure', () => {
  const out = classifyProviderError({ exitCode: 1, message: 'TypeScript compile error TS2345' });
  assert.equal(out.kind, 'unknown');
});

test('classifyProviderError returns unknown for a clean exit', () => {
  const out = classifyProviderError({ exitCode: 0, message: 'done' });
  assert.equal(out.kind, 'unknown');
});
```

- [ ] **Step 2: Run the tests; verify they fail**

Run: `npm run compile:tests` — Expected: a TypeScript error that `classifyProviderError` is not exported (compile fails). That is the red state.

- [ ] **Step 3: Implement the classifier**

In `src/ralph/failureDiagnostics.ts`, immediately after `classifyTransientFailure` (~`:33`), add:

```typescript
export type ProviderErrorKind = 'retryable' | 'non_retryable' | 'unknown';

export interface ProviderErrorClassification {
  kind: ProviderErrorKind;
  reason: string;
  matchedPattern: string | null;
}

/**
 * Patterns that indicate a *configuration / authorization* rejection by the
 * provider CLI. These never succeed on a byte-identical retry — the operator
 * must change config — so they are classified non_retryable and escalated.
 */
const NON_RETRYABLE_PROVIDER_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /issue with the selected model/i, reason: 'Provider rejected the selected model — check the model ID for typos.' },
  { re: /model.*(may not exist|do(?:es)?n'?t exist|not found|invalid)/i, reason: 'Provider reported an unknown or invalid model ID.' },
  { re: /(unauthor|forbidden|invalid api key|authentication failed|not logged in|permission denied)/i, reason: 'Provider rejected the request for authentication/authorization reasons.' }
];

/**
 * Classifies a provider CLI failure into retryable / non_retryable / unknown.
 * Pure: matches on exit code + message only. Defaults to `unknown` so that
 * unrecognized failures preserve the existing retry behavior.
 */
export function classifyProviderError(input: { exitCode: number | null; message: string }): ProviderErrorClassification {
  if (input.exitCode === 0 || input.exitCode === null) {
    return { kind: 'unknown', reason: 'No non-zero provider exit code.', matchedPattern: null };
  }
  const message = input.message ?? '';
  for (const pattern of NON_RETRYABLE_PROVIDER_PATTERNS) {
    if (pattern.re.test(message)) {
      return { kind: 'non_retryable', reason: pattern.reason, matchedPattern: pattern.re.source };
    }
  }
  if (classifyTransientFailure(message) === 'transient') {
    return { kind: 'retryable', reason: 'Transient provider failure; a retry may succeed.', matchedPattern: null };
  }
  return { kind: 'unknown', reason: 'Unrecognized provider failure.', matchedPattern: null };
}
```

- [ ] **Step 4: Run the tests; verify they pass**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/failureDiagnostics.test.js`
Expected: all `classifyProviderError` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ralph/failureDiagnostics.ts test/failureDiagnostics.test.ts
git commit -m "Add classifyProviderError for non-retryable provider failures (BUG-001)"
```

---

### Task 1.2: Thread `providerErrorKind` through the execution summary

**Files:**
- Modify: `src/ralph/types.ts:550-557` (`RalphIterationExecutionSummary`)
- Modify: `src/ralph/iteration/IterationExecutor.ts:35-53` (result type) and `:234`
- Modify: `src/ralph/iteration/OutcomeClassifier.ts:205` (execution summary literal)
- Modify: `src/ralph/iterationEngine.ts:422` (execution summary literal)

- [ ] **Step 1: Add the optional field to the summary type**

In `src/ralph/types.ts`, inside `RalphIterationExecutionSummary` (`:550`), add after `message?: string;`:

```typescript
  /** Classification of a non-zero provider exit. Absent on success/skip. */
  providerErrorKind?: import('./failureDiagnostics').ProviderErrorKind;
```

- [ ] **Step 2: Add the field to the executor result and compute it**

In `src/ralph/iteration/IterationExecutor.ts`, add to `IterationExecutionResult` (after `exitCode` at `:42`):

```typescript
  providerErrorKind: import('../failureDiagnostics').ProviderErrorKind;
```

Declare a default near the other `let` declarations (after `:69`):

```typescript
    let providerErrorKind: import('../failureDiagnostics').ProviderErrorKind = 'unknown';
```

At `:234`, just after `executionErrors = ...`, add:

```typescript
      providerErrorKind = execResult.exitCode === 0
        ? 'unknown'
        : classifyProviderError({ exitCode: execResult.exitCode, message: execResult.message }).kind;
```

Add `providerErrorKind` to **both** `return { ... }` objects in this method (the early skip-return ~`:91` returns `'unknown'`; the main return ~`:296` returns the computed value). Import at the top of the file: `import { classifyProviderError } from '../failureDiagnostics';`.

- [ ] **Step 3: Thread it into the execution summaries**

In `src/ralph/iteration/OutcomeClassifier.ts` at the `execution: { ... }` literal (`:205`), add `providerErrorKind: <executorResult>.providerErrorKind,` (use the same source variable that supplies `exitCode`/`message` there). Do the same in `src/ralph/iterationEngine.ts` at the `execution: { ... }` literal (`:422`).

- [ ] **Step 4: Compile to verify wiring**

Run: `npm run compile` — Expected: clean compile (no TS errors). If a summary literal is missed, the optional field simply stays absent — confirm by grepping both literals include `providerErrorKind`.

- [ ] **Step 5: Commit**

```bash
git add src/ralph/types.ts src/ralph/iteration/IterationExecutor.ts src/ralph/iteration/OutcomeClassifier.ts src/ralph/iterationEngine.ts
git commit -m "Stamp providerErrorKind onto the iteration execution summary (BUG-001)"
```

---

### Task 1.3: Stop on non-retryable provider errors instead of retrying

**Files:**
- Modify: `src/ralph/types.ts:216-229` (`RalphStopReason`)
- Modify: `src/ralph/loopLogic.ts:508-514` (execution-failed branch)
- Modify: `src/prompt/promptBuilder.ts:1285-1296` (fix-failure guard)
- Test: `test/loopLogic.test.ts`

- [ ] **Step 1: Add the stop reason**

In `src/ralph/types.ts`, add to the `RalphStopReason` union (after `'execution_failed'`, `:227`):

```typescript
  | 'non_retryable_provider_error'
```

- [ ] **Step 2: Write the failing loop test**

In `test/loopLogic.test.ts`, follow the existing pattern for building a `RalphStopDecisionInput` (copy the helper/fixture used by the nearest `decideLoopContinuation` test in that file). Add:

```typescript
test('decideLoopContinuation stops with non_retryable_provider_error on a non-retryable failure', () => {
  const current = makeIterationResult({
    executionStatus: 'failed',
    execution: { exitCode: 1, message: "There's an issue with the selected model (caude-opus-4-8)", providerErrorKind: 'non_retryable' }
  });
  const decision = decideLoopContinuation(makeStopInput({ currentResult: current, hasActionableTask: true }));
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'non_retryable_provider_error');
});
```

(If no `makeIterationResult`/`makeStopInput` helper exists, build the objects inline matching the shapes in `src/ralph/types.ts` `RalphIterationResult` / `loopLogic.ts` `RalphStopDecisionInput`. The `execution` field needs at minimum `exitCode` and `providerErrorKind`.)

- [ ] **Step 3: Run the test; verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: FAIL — `stopReason` is `'execution_failed'`, not `'non_retryable_provider_error'`.

- [ ] **Step 4: Implement the branch**

In `src/ralph/loopLogic.ts`, **replace** the execution-failed branch at `:508-514` with:

```typescript
  if (input.currentResult.executionStatus === 'failed') {
    if (input.currentResult.execution.providerErrorKind === 'non_retryable') {
      return {
        shouldContinue: false,
        stopReason: 'non_retryable_provider_error',
        message: 'Provider rejected the request with a non-retryable error (e.g. unknown model ID or auth failure); escalating to human instead of retrying identical config.'
      };
    }
    return {
      shouldContinue: false,
      stopReason: 'execution_failed',
      message: 'Codex execution failed for the current iteration.'
    };
  }
```

- [ ] **Step 5: Guard the fix-failure prompt selection**

In `src/prompt/promptBuilder.ts`, add this branch **before** the fix-failure block at `:1285` so a subsequent run does not re-issue an identical retry prompt:

```typescript
  if (lastIteration?.stopReason === 'non_retryable_provider_error') {
    return {
      kind: 'human-review-handoff',
      reason: 'The previous iteration failed with a non-retryable provider error (e.g. unknown model ID or auth failure); a byte-identical retry cannot succeed, so the next prompt must surface the blocker for human action.'
    };
  }
```

- [ ] **Step 6: Run the test; verify it passes**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: PASS.

- [ ] **Step 7: Update stop-reason presentation if enumerated**

Run: `npm run check:docs && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/stopReasonPresentation.test.js` (after compiling tests). If either fails because the new stop reason is unmapped, add a presentation entry/label for `non_retryable_provider_error` wherever `RalphStopReason` values are exhaustively switched (the failing test/message will name the file).

- [ ] **Step 8: Commit**

```bash
git add src/ralph/types.ts src/ralph/loopLogic.ts src/prompt/promptBuilder.ts test/loopLogic.test.ts
git commit -m "Escalate non-retryable provider errors instead of retrying (BUG-001)"
```

---

# Workstream 2 — BUG-002: seed-task planning-gate loop

### Task 2.1: Add `requiresReplacement` to the task schema and seed file

**Files:**
- Modify: `src/ralph/types.ts:41-78` (`RalphTask`)
- Modify: `src/ralph/taskFile.ts:30-48` (`SUPPORTED_TASK_FIELDS`) and `:767-785` (`createDefaultTaskFile`)
- Test: `test/taskFile.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/taskFile.test.ts`, add (matching the file's existing `parseTaskFile`/serialize idiom):

```typescript
test('createDefaultTaskFile marks the seed tasks requiresReplacement', () => {
  const file = createDefaultTaskFile();
  assert.equal(file.tasks.every((t) => t.requiresReplacement === true), true);
});

test('requiresReplacement round-trips through parse and serialize', () => {
  const text = JSON.stringify({ version: 2, tasks: [{ id: 'T1', title: 'x', status: 'todo', requiresReplacement: true }] });
  const parsed = parseTaskFile(text);
  assert.equal(parsed.tasks[0].requiresReplacement, true);
});
```

Ensure `createDefaultTaskFile` and `parseTaskFile` are imported from `../src/ralph/taskFile`.

- [ ] **Step 2: Run; verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/taskFile.test.js`
Expected: FAIL — `requiresReplacement` is `undefined` on the seed tasks and is dropped on parse (unsupported field).

- [ ] **Step 3: Add the field, register it, set it on seeds**

In `src/ralph/types.ts` `RalphTask` (after `lastReconciliationWarning?`, `:75`):

```typescript
  /** leave-absent. True for non-executable seed/placeholder tasks that must be replaced before real work begins. Routes the loop to backlog replenishment instead of the planning gate. */
  requiresReplacement?: boolean;
```

In `src/ralph/taskFile.ts`, add `'requiresReplacement'` to `SUPPORTED_TASK_FIELDS` (`:30`). Then in `createDefaultTaskFile` (`:767`), add `requiresReplacement: true` to both seed task objects (T1 and T2).

- [ ] **Step 4: Run; verify it passes**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/taskFile.test.js`
Expected: PASS. If the round-trip test still drops the field, confirm `normalizeNewTask` / serialization in `taskNormalization.ts` copies it (add it alongside the other optional booleans there if needed).

- [ ] **Step 5: Commit**

```bash
git add src/ralph/types.ts src/ralph/taskFile.ts test/taskFile.test.ts
git commit -m "Add requiresReplacement flag and mark seed tasks (BUG-002)"
```

---

### Task 2.2: Route `requiresReplacement` tasks to replenishment, not the planning gate

**Files:**
- Modify: `src/ralph/loopLogic.ts:486-506` (no-actionable / replenishment branch)
- Test: `test/loopLogic.test.ts`

**Context:** Today the `autoReplenishBacklog` continuation only fires when the backlog is empty. When the *only* actionable tasks are seed placeholders, the loop instead reaches the planning gate and spins on human-review handoffs. The fix: treat an all-`requiresReplacement` actionable set as "no real work available" and continue into replenishment (when `autoReplenishBacklog`), else hard-stop with a clear reason.

- [ ] **Step 1: Write the failing test**

```typescript
test('decideLoopContinuation routes a seed-only backlog into replenishment when auto-replenish is on', () => {
  const current = makeIterationResult({
    selectedTaskId: 'T2',
    completionClassification: 'needs_human_review',
    backlog: { remainingTaskCount: 1, actionableTaskAvailable: true }
  });
  const decision = decideLoopContinuation(makeStopInput({
    currentResult: current,
    hasActionableTask: true,
    autoReplenishBacklog: true,
    onlyActionableTasksRequireReplacement: true
  }));
  assert.equal(decision.shouldContinue, true);
  assert.match(decision.message, /replenish/i);
});
```

- [ ] **Step 2: Add the input field**

In `src/ralph/loopLogic.ts` `RalphStopDecisionInput` (`:52`), add:

```typescript
  /** True when every currently-actionable task is a requiresReplacement seed placeholder. */
  onlyActionableTasksRequireReplacement?: boolean;
```

The caller (`LoopDecisionService` / `iterationEngine`) computes this from the live task list: `tasks.filter(isActionable).length > 0 && tasks.filter(isActionable).every(t => t.requiresReplacement === true)`. Add that computation where `RalphStopDecisionInput` is constructed and pass it through. (Grep for `hasActionableTask:` to find the construction site.)

- [ ] **Step 3: Run; verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: FAIL — currently continues toward the gate / does not return a replenish message.

- [ ] **Step 4: Implement the branch**

In `src/ralph/loopLogic.ts`, add immediately after the `if (!input.hasActionableTask) { ... }` block (after `:506`):

```typescript
  if (input.onlyActionableTasksRequireReplacement) {
    if (input.autoReplenishBacklog && input.currentResult.executionStatus !== 'failed') {
      return {
        shouldContinue: true,
        stopReason: null,
        message: 'Only seed/placeholder tasks remain; continuing into backlog replenishment instead of the planning gate.'
      };
    }
    return {
      shouldContinue: false,
      stopReason: 'no_actionable_task',
      message: 'Only seed/placeholder tasks remain and auto-replenishment is disabled; replace the seed backlog with real work.'
    };
  }
```

- [ ] **Step 5: Run; verify it passes**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ralph/loopLogic.ts test/loopLogic.test.ts
git commit -m "Route seed-only backlog into replenishment, not the planning gate (BUG-002)"
```

---

### Task 2.3: Stop re-issuing identical human-review handoffs

**Files:**
- Modify: `src/ralph/loopLogic.ts:563-583` (terminal-review repeated branch)
- Test: `test/loopLogic.test.ts`

**Context:** `countTrailingSameTaskClassifications([...])` already counts repeated `needs_human_review` classifications and stops at `repeatedFailureThreshold` with `repeated_identical_failure`. The gap from BUG-002: when the repeated task is a seed/`requiresReplacement`, the better action is to auto-replenish rather than stop with a generic repeat reason. Tighten the existing branch.

- [ ] **Step 1: Write the failing test**

```typescript
test('repeated human-review on a seed task auto-replenishes rather than hard-stopping', () => {
  const prior = makeIterationResult({ selectedTaskId: 'T2', completionClassification: 'needs_human_review' });
  const current = makeIterationResult({ selectedTaskId: 'T2', completionClassification: 'needs_human_review' });
  const decision = decideLoopContinuation(makeStopInput({
    currentResult: current,
    previousIterations: [prior, prior],   // threshold reached
    repeatedFailureThreshold: 2,
    autoReplenishBacklog: true,
    onlyActionableTasksRequireReplacement: true
  }));
  // The seed-only branch (Task 2.2) handles this first.
  assert.equal(decision.shouldContinue, true);
  assert.match(decision.message, /replenish/i);
});
```

- [ ] **Step 2: Run; verify behavior**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: PASS already if Task 2.2 is in place (the seed-only branch precedes the terminal-review branch). If it FAILS, it means ordering is wrong — proceed to Step 3.

- [ ] **Step 3: Confirm branch ordering (no new code unless Step 2 failed)**

The seed-only branch from Task 2.2 sits near the top of `decideLoopContinuation` and therefore short-circuits before the `repeatedTerminalReviewCount` branch at `:570`. If Step 2 failed, move the `onlyActionableTasksRequireReplacement` block above any earlier branch that returned first. For non-seed tasks, the existing `repeated_identical_failure` stop at `:576-582` is the correct terminal behavior — leave it unchanged.

- [ ] **Step 4: Add a non-seed assertion to lock the contract**

```typescript
test('repeated human-review on a NON-seed task hard-stops with repeated_identical_failure', () => {
  const prior = makeIterationResult({ selectedTaskId: 'T9', completionClassification: 'needs_human_review' });
  const current = makeIterationResult({ selectedTaskId: 'T9', completionClassification: 'needs_human_review' });
  const decision = decideLoopContinuation(makeStopInput({
    currentResult: current,
    previousIterations: [prior, prior],
    repeatedFailureThreshold: 2,
    onlyActionableTasksRequireReplacement: false
  }));
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_identical_failure');
});
```

Run the file again; expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ralph/loopLogic.ts test/loopLogic.test.ts
git commit -m "Auto-replenish seed-task review loop; keep hard-stop for real tasks (BUG-002)"
```

---

# Workstream 3 — BUG-003: Windows validation + verifier-suspect

### Task 3.1: Preflight shell-compatibility diagnostic

**Files:**
- Modify: `src/ralph/preflight.ts` (new collector function + call site in `buildPreflightReport` near `:1385-1430`)
- Test: `test/preflight.shellCompat.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `test/preflight.shellCompat.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { detectShellMismatchDiagnostic } from '../src/ralph/preflight';

test('flags a bash-style node -e command on win32', () => {
  const d = detectShellMismatchDiagnostic('node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1]))"', 'win32');
  assert.ok(d);
  assert.equal(d!.severity, 'warning');
  assert.equal(d!.code, 'validation_command_shell_mismatch');
});

test('does not flag a native pwsh command on win32', () => {
  const d = detectShellMismatchDiagnostic('pwsh -NoProfile -Command "$f=\'a.json\'; Get-Content $f"', 'win32');
  assert.equal(d, null);
});

test('does not flag a bash-style command on linux', () => {
  const d = detectShellMismatchDiagnostic('node -e "console.log(1)"', 'linux');
  assert.equal(d, null);
});

test('does not flag a plain npm command on win32', () => {
  const d = detectShellMismatchDiagnostic('npm run validate', 'win32');
  assert.equal(d, null);
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `npm run compile:tests` — Expected: compile error, `detectShellMismatchDiagnostic` not exported.

- [ ] **Step 3: Implement the detector + wire it in**

In `src/ralph/preflight.ts`, add an exported pure helper (place it near the other module-level helpers, e.g. after `hasUntrackedProjectBaseline`):

```typescript
/**
 * Detects a validation command that uses POSIX/bash idioms while the host shell
 * is Windows. Returns a warning diagnostic, or null when the command looks
 * shell-appropriate. Heuristic and conservative — only well-known bash idioms
 * trip it, so legitimate cross-platform commands (npm, git, pwsh) pass clean.
 */
export function detectShellMismatchDiagnostic(
  command: string | null | undefined,
  platform: NodeJS.Platform = process.platform
): RalphPreflightDiagnostic | null {
  if (!command || platform !== 'win32') {
    return null;
  }
  const trimmed = command.trim();
  if (/^pwsh\b|^powershell\b/i.test(trimmed)) {
    return null;
  }
  const bashIdioms: RegExp[] = [
    /\bnode\s+-e\s+"/,          // node -e with an outer double-quote (BUG-003 signature)
    /'[^']*\$\([^)]*\)[^']*'/,   // single-quoted command substitution
    /\$\{?\w+\}?/,               // $VAR / ${VAR} POSIX expansion
    /\|\s*grep\b/,               // pipe to grep
    /\bsh\s+-c\b/                // sh -c wrapper
  ];
  if (bashIdioms.some((re) => re.test(trimmed))) {
    return createDiagnostic(
      'validationVerifier',
      'warning',
      'validation_command_shell_mismatch',
      `Validation command appears to use bash/POSIX syntax but the host shell is Windows PowerShell. Prefer the pwsh pattern, e.g. pwsh -NoProfile -Command "...". Command: ${trimmed}`
    );
  }
  return null;
}
```

Then in `buildPreflightReport`, inside the `validationVerifier` section (the `if (input.config.verifierModes.includes('validationCommand'))` block, ~`:1385`), after the existing readiness diagnostics push:

```typescript
    const shellMismatch = detectShellMismatchDiagnostic(input.validationCommand);
    if (shellMismatch) {
      diagnostics.push(shellMismatch);
    }
```

(Confirm the local array variable name used for diagnostics in that function — it is the array later sorted by `sortDiagnostics`. Use that same variable.)

- [ ] **Step 4: Run; verify it passes**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/preflight.shellCompat.test.js`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/ralph/preflight.ts test/preflight.shellCompat.test.ts
git commit -m "Warn on bash-style validation commands on Windows (BUG-003)"
```

---

### Task 3.2: Host-shell guidance in validation-authoring prompt

**Files:**
- Modify: `src/prompt/promptBuilder.ts` (validation-authoring guidance) and/or `prompt-templates/`
- Test: `test/promptBuilder.content.test.ts`

- [ ] **Step 1: Locate the validation-authoring instruction**

Run: `grep -n "validation" src/prompt/promptBuilder.ts` and inspect `prompt-templates/` for the section that instructs the agent how to author a `validation` command. Identify whether the host OS/shell is already injected into the prompt context.

- [ ] **Step 2: Write the failing content test**

In `test/promptBuilder.content.test.ts` (matching its existing build-and-assert idiom), add a test that builds a prompt on a simulated Windows host and asserts the rendered prompt contains a PowerShell-authoring instruction, e.g.:

```typescript
assert.match(promptText, /PowerShell|pwsh -NoProfile -Command/);
```

Use the same host/platform injection seam the builder already exposes (look for where `process.platform` or an environment/profile string is threaded into prompt context; if none exists, add an explicit `hostShell` field to the prompt context type and default it from `process.platform`).

- [ ] **Step 3: Run; verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/promptBuilder.content.test.js`
Expected: FAIL — no PowerShell guidance present.

- [ ] **Step 4: Implement the guidance**

Add a single conditional line to the validation-authoring section: when the host shell is Windows, instruct the agent to author validation commands as `pwsh -NoProfile -Command "..."` and avoid bash idioms (`node -e "..."` with an outer double-quote, `$VAR`, single-quoted inline scripts). Keep it one or two sentences to respect the prompt budget.

- [ ] **Step 5: Run content + snapshot tests**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/promptBuilder.content.test.js ./out-test/test/promptBuilder.snapshot.test.js ./out-test/test/promptBudget.golden.test.js`
Expected: content test PASS. If the snapshot or prompt-budget golden tests fail because the rendered prompt changed, update the snapshot fixtures intentionally (`test/fixtures/snapshots/`) and re-run `npm run check:prompt-budget`. Confirm the budget still passes.

- [ ] **Step 6: Commit**

```bash
git add src/prompt/promptBuilder.ts prompt-templates test/promptBuilder.content.test.ts test/fixtures/snapshots
git commit -m "Inject host-shell guidance into validation-command authoring (BUG-003)"
```

---

### Task 3.3: Verifier-suspect early detection

**Files:**
- Modify: `src/ralph/loopLogic.ts:209-237` (`detectNoProgressSignals`) and `:532-561` (stop decision)
- Modify: `src/ralph/types.ts:216-229` (`RalphStopReason`)
- Test: `test/loopLogic.test.ts`

**Context:** When execution **succeeds** but validation **fails with an identical signature** while **relevant files changed**, the work is likely correct and the *verifier* is broken (the exact BUG-003 shape). Today this is consumed as `partial_progress` across the full repeated-failure budget. Add an explicit signal and an earlier stop.

- [ ] **Step 1: Add the stop reason**

In `src/ralph/types.ts` `RalphStopReason`, add:

```typescript
  | 'verifier_suspect'
```

- [ ] **Step 2: Write the failing test**

```typescript
test('detectNoProgressSignals flags validation_failed_despite_execution_success', () => {
  const previous = makeIterationResult({
    selectedTaskId: 'T4', executionStatus: 'succeeded', verificationStatus: 'failed',
    verification: { validationFailureSignature: 'validation::exit:1::is not recognized' }
  });
  const signals = detectNoProgressSignals(makeOutcomeInput({
    selectedTaskId: 'T4',
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    validationFailureSignature: 'validation::exit:1::is not recognized',
    relevantFileChanges: ['Schemas/antecedent.schema.json'],
    previousIterations: [previous]
  }), 'partial_progress');
  assert.ok(signals.includes('validation_failed_despite_execution_success'));
});
```

- [ ] **Step 3: Run; verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: FAIL — signal not present.

- [ ] **Step 4: Add the signal**

In `src/ralph/loopLogic.ts` `detectNoProgressSignals` (before the final `return uniqueOrdered(signals);` at `:236`):

```typescript
  if (input.executionStatus === 'succeeded'
    && input.verificationStatus === 'failed'
    && input.relevantFileChanges.length > 0
    && previous?.executionStatus === 'succeeded'
    && previous?.verificationStatus === 'failed'
    && input.validationFailureSignature
    && previous?.verification.validationFailureSignature != null
    && normalizeFailureMessage(previous.verification.validationFailureSignature)
      === normalizeFailureMessage(input.validationFailureSignature)) {
    signals.push('validation_failed_despite_execution_success');
  }
```

- [ ] **Step 5: Add the early stop**

In `decideLoopContinuation`, add **before** the `repeated_identical_failure` signature branch (`:546`):

```typescript
  const verifierSuspectCount = countTrailingSameTaskClassifications(
    history,
    input.currentResult.selectedTaskId,
    agentId,
    ['partial_progress']
  );
  const currentSignalsVerifierSuspect = input.currentResult.noProgressSignals.includes('validation_failed_despite_execution_success');
  if (currentSignalsVerifierSuspect && verifierSuspectCount >= 2) {
    return {
      shouldContinue: false,
      stopReason: 'verifier_suspect',
      message: 'Execution succeeded and files changed, but validation failed identically across iterations. The validation command itself is the likely culprit — review it before retrying.'
    };
  }
```

Note: `noProgressSignals` is already persisted on `RalphIterationResult` (`:656`), so the trailing history carries the signal. Confirm `classifyIterationOutcome` writes `detectNoProgressSignals` output into the result (it does, via `RalphOutcomeDecision.noProgressSignals`).

- [ ] **Step 6: Write the stop test and run**

```typescript
test('decideLoopContinuation stops with verifier_suspect after repeated success+identical-validation-failure', () => {
  const sig = 'validation::exit:1::is not recognized';
  const prior = makeIterationResult({
    selectedTaskId: 'T4', executionStatus: 'succeeded', verificationStatus: 'failed',
    completionClassification: 'partial_progress',
    noProgressSignals: ['validation_failed_despite_execution_success'],
    verification: { validationFailureSignature: sig }
  });
  const current = makeIterationResult({
    selectedTaskId: 'T4', executionStatus: 'succeeded', verificationStatus: 'failed',
    completionClassification: 'partial_progress',
    noProgressSignals: ['validation_failed_despite_execution_success'],
    verification: { validationFailureSignature: sig }
  });
  const decision = decideLoopContinuation(makeStopInput({
    currentResult: current, previousIterations: [prior, prior], hasActionableTask: true
  }));
  assert.equal(decision.stopReason, 'verifier_suspect');
});
```

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/loopLogic.test.js`
Expected: PASS.

- [ ] **Step 7: Map the stop reason for presentation**

As in Task 1.3 Step 7, add a presentation entry for `verifier_suspect` if `stopReasonPresentation.test.ts` fails.

- [ ] **Step 8: Commit**

```bash
git add src/ralph/types.ts src/ralph/loopLogic.ts test/loopLogic.test.ts
git commit -m "Detect a suspect verifier early when execution succeeds but validation fails identically (BUG-003)"
```

---

### Task 3.4: Regression — untracked-only changes count as progress

**Files:**
- Test: `test/verifier.test.ts`

**Context:** BUG-003 prevention #2 (untracked files not counted) is already satisfied — `captureGitStatus()` runs `git status --porcelain=v1 -z --untracked-files=all`. This task locks that behavior with a regression test so it cannot silently regress.

- [ ] **Step 1: Write the regression test**

In `test/verifier.test.ts`, follow the file's existing pattern (it likely creates a temp git repo and invokes the file-change verifier / `collectRelevantWorkspaceChanges` / `runFileChangeVerifier`). Add a test that: initializes a temp git repo with a committed baseline, writes a NEW untracked file (e.g. `Schemas/antecedent.schema.json`), captures before/after status, and asserts the new file is reported as a relevant change and the `gitDiff` verifier status is `passed`:

```typescript
test('an untracked-only new file is counted as relevant workspace progress', async () => {
  // ...arrange a temp repo with a committed baseline (reuse the file's existing helper)...
  await fs.writeFile(path.join(repo, 'Schemas', 'antecedent.schema.json'), '{"type":"object"}', 'utf8');
  const after = await captureGitStatus(repo);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.ok(changes.some((c) => c.endsWith('antecedent.schema.json')));
});
```

Import `captureGitStatus` and `collectRelevantWorkspaceChanges` from `../src/ralph/verifier`. If `collectRelevantWorkspaceChanges` is not exported, assert via `runFileChangeVerifier`'s returned `status === 'passed'` instead.

- [ ] **Step 2: Run; verify it passes immediately (behavior already correct)**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/verifier.test.js`
Expected: PASS. (If it FAILS, the behavior regressed since the spec review — investigate `captureGitStatus`'s `--untracked-files` flag before changing the test.)

- [ ] **Step 3: Commit**

```bash
git add test/verifier.test.ts
git commit -m "Regression: untracked-only file counts as workspace progress (BUG-003)"
```

---

## Final verification

- [ ] **Full validation gate**

Run: `rm -rf out-test && npm run validate`
Expected: PASS through compile → check:docs → check:ledger → check:prompt-budget → lint → test.

- [ ] **Push and open PR**

```bash
git push -u origin bug-resolution-bakein
```

Open a PR summarizing the three workstreams and linking the spec. Per repo convention, rebase onto `origin/main` before merge and delete the branch after.

---

## Self-review notes (author)

- **Spec coverage:** WS1 = BUG-001 prev #1 (runtime classification, chosen over allowlist) + #2 (no identical retry). WS2 = BUG-002 prev #1 (`requiresReplacement`) + #2 (no identical handoff spin). WS3 = BUG-003 prev #1 (preflight 3.1 + generation 3.2), prev #3 (verifier-suspect 3.3), prev #2 (regression 3.4). All spec requirements mapped.
- **Type consistency:** `providerErrorKind` / `ProviderErrorKind` used uniformly; new stop reasons `non_retryable_provider_error`, `verifier_suspect` added to the union before use; `requiresReplacement` added to `RalphTask` before seeding/routing; `onlyActionableTasksRequireReplacement` added to `RalphStopDecisionInput` before use.
- **Known open verifications (flagged inline, not placeholders):** exact diagnostics-array variable name in `buildPreflightReport`; presence of `makeIterationResult`/`makeStopInput` test helpers in `test/loopLogic.test.ts`; the host-shell injection seam in `promptBuilder`; export status of `collectRelevantWorkspaceChanges`. Each step says how to confirm and what to do either way.
