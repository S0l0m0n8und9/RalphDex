# Failure Diagnostics (T102) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add `FailureCategoryId` taxonomy, `failureDiagnostics` / `maxRecoveryAttempts` config fields, and a post-stop diagnostic invocation that classifies failure root causes and writes `failure-analysis.json`.

**Architecture:** Pure functions (`classifyTransientFailure`, `parseFailureDiagnosticResponse`, `buildFailureDiagnosticPrompt`, `getFailureAnalysisPath`) and the `writeFailureAnalysis` I/O helper live in a new `src/ralph/failureDiagnostics.ts` module. The trigger predicate (`shouldRunFailureDiagnostic`) is exported from `loopLogic.ts` to keep decision logic centralised. `IterationEngine` gains `maybeRunFailureDiagnostic` private method, mirroring the `runInlinePlanningPass` pattern (try-catch, best-effort, no-op on failure). Transient signals are classified without an LLM call. `failureDiagnostics='off'` suppresses everything.

**Tech Stack:** TypeScript, Node.js `fs/promises`, existing `CliExecCodexStrategy`, `hashText`/`utf8ByteLength` from `integrity.ts`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/ralph/types.ts` | Modify | Add `FailureCategoryId` union type |
| `src/config/types.ts` | Modify | Add `FailureDiagnosticsMode` + two config fields |
| `src/config/defaults.ts` | Modify | Add default values |
| `src/config/readConfig.ts` | Modify | Read new fields; import `FailureDiagnosticsMode` |
| `package.json` | Modify | Two VS Code configuration contributions |
| `src/ralph/loopLogic.ts` | Modify | Export `shouldRunFailureDiagnostic` pure function |
| `src/ralph/failureDiagnostics.ts` | Create | `FailureAnalysis` type + all helpers |
| `src/ralph/iterationEngine.ts` | Modify | Import helpers, add private method, call it after stop decision |
| `test/failureDiagnostics.test.ts` | Create | Unit tests for pure functions and file write |

---

## Task 1: FailureCategoryId and FailureDiagnosticsMode types

**Files:** `src/ralph/types.ts:15`, `src/config/types.ts:31`

- [ ] **Step 1:** In `src/ralph/types.ts`, after line 15 (`export type RalphTaskTier = ...`), insert:
  ```typescript
  export type FailureCategoryId = 'transient' | 'implementation_error' | 'task_ambiguity' | 'validation_mismatch' | 'dependency_missing' | 'environment_issue';
  ```

- [ ] **Step 2:** In `src/config/types.ts`, after line 31 (`export type MemoryStrategy = ...`), insert:
  ```typescript
  export type FailureDiagnosticsMode = 'auto' | 'off';
  ```

- [ ] **Step 3:** Run `npx tsc --noEmit -p ./` — confirm 0 errors.

---

## Task 2: Add config fields to RalphCodexConfig

**Files:** `src/config/types.ts:166`, `src/config/defaults.ts:80`, `src/config/readConfig.ts`

- [ ] **Step 1:** In `src/config/types.ts`, after `planningPass: RalphPlanningPassConfig;` (last field before `}`), append:
  ```typescript
    /** Failure diagnostics mode. 'auto': diagnostic LLM call on block/failed-verifier. 'off': suppress. */
    failureDiagnostics: FailureDiagnosticsMode;
    /** Max recovery attempts before falling back to standard remediation. Default: 3. */
    maxRecoveryAttempts: number;
  ```

- [ ] **Step 2:** In `src/config/defaults.ts`, after the `planningPass` entry (before closing `}`), append:
  ```typescript
    failureDiagnostics: 'auto',
    maxRecoveryAttempts: 3,
  ```

- [ ] **Step 3a:** In `src/config/readConfig.ts`, add `FailureDiagnosticsMode` to the existing import from `./types`.

- [ ] **Step 3b:** At the end of the `return { ... }` block in `readConfig` (after `planningPass: readPlanningPass(...)`), add:
  ```typescript
      failureDiagnostics: readEnum<FailureDiagnosticsMode>(
        config,
        'failureDiagnostics',
        ['auto', 'off'],
        DEFAULT_CONFIG.failureDiagnostics
      ),
      maxRecoveryAttempts: readNumber(config, 'maxRecoveryAttempts', DEFAULT_CONFIG.maxRecoveryAttempts, 1),
  ```

- [ ] **Step 4:** Run `npx tsc --noEmit -p ./` — confirm 0 errors.

---

## Task 3: package.json configuration contributions

**Files:** `package.json`

- [ ] **Step 1:** In `contributes.configuration.properties`, after the `"ralphCodex.planningPass"` block (line 743 `}`), add a comma and two new entries:
  ```json
        "ralphCodex.failureDiagnostics": {
          "type": "string",
          "enum": ["auto", "off"],
          "default": "auto",
          "description": "Failure diagnostics mode. 'auto' (default): Ralph runs a lightweight diagnostic LLM call to classify the root cause and write failure-analysis.json when a task blocks or the verifier fails. 'off': suppresses all diagnostic calls."
        },
        "ralphCodex.maxRecoveryAttempts": {
          "type": "number",
          "default": 3,
          "minimum": 1,
          "description": "Maximum recovery attempts for a failing task that has received a failure-analysis.json. After this many attempts the loop falls back to standard remediation. Default: 3."
        }
  ```

- [ ] **Step 2:** Verify with `node -e "require('./package.json'); console.log('ok')"` — confirm `ok`.

---

## Task 4: shouldRunFailureDiagnostic in loopLogic.ts

**Files:** `src/ralph/loopLogic.ts` (append at end of file)

- [ ] **Step 1:** After the closing `}` of `decideLoopContinuation`, append:

  ```typescript
  /**
   * Returns true when a failure-diagnostic LLM call should be triggered
   * for the current iteration result.
   * Runs when mode is 'auto' AND (task blocked OR verifier failed).
   * Never runs when mode is 'off'.
   */
  export function shouldRunFailureDiagnostic(
    completionClassification: RalphCompletionClassification,
    verificationStatus: RalphVerificationStatus,
    mode: 'auto' | 'off'
  ): boolean {
    if (mode === 'off') {
      return false;
    }

    return completionClassification === 'blocked' || verificationStatus === 'failed';
  }
  ```

- [ ] **Step 2:** Run `npx tsc --noEmit -p ./` — confirm 0 errors.

---

## Task 5: Create src/ralph/failureDiagnostics.ts

**Files:** `src/ralph/failureDiagnostics.ts` (new file)

This module is pure I/O + pure functions — no vscode imports.

- [ ] **Step 1:** Create the file with these exports (full content below the checklist).
- [ ] **Step 2:** Run `npx tsc --noEmit -p ./` — confirm 0 errors.

### Complete file content for src/ralph/failureDiagnostics.ts

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { FailureCategoryId } from './types';

export interface FailureAnalysis {
  schemaVersion: 1;
  kind: 'failureAnalysis';
  taskId: string;
  createdAt: string;
  rootCauseCategory: FailureCategoryId;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  suggestedAction: string;
  retryPromptAddendum?: string;
}

const TRANSIENT_PATTERNS: RegExp[] = [
  /network\s+error/i,
  /lock\s+contention/i,
  /process\s+timeout/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /socket\s+hang\s+up/i,
  /ECONNRESET/
];

export function classifyTransientFailure(signal: string): FailureCategoryId | null {
  return TRANSIENT_PATTERNS.some((p) => p.test(signal)) ? 'transient' : null;
}

const VALID_CATEGORIES = new Set<FailureCategoryId>([
  'transient', 'implementation_error', 'task_ambiguity',
  'validation_mismatch', 'dependency_missing', 'environment_issue'
]);

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

export function parseFailureDiagnosticResponse(text: string): Partial<FailureAnalysis> | null {
  const fencedMatch = /```json\s*([\s\S]*?)```/.exec(text);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : text.trim();
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return null; }
  const record = parsed as Record<string, unknown>;
  const rootCauseCategory =
    typeof record.rootCauseCategory === 'string' && VALID_CATEGORIES.has(record.rootCauseCategory as FailureCategoryId)
      ? (record.rootCauseCategory as FailureCategoryId)
      : null;
  if (!rootCauseCategory) { return null; }
  const confidence =
    typeof record.confidence === 'string' && VALID_CONFIDENCE.has(record.confidence)
      ? (record.confidence as 'high' | 'medium' | 'low')
      : 'low';
  const summary =
    typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : '';
  const suggestedAction =
    typeof record.suggestedAction === 'string' && record.suggestedAction.trim()
      ? record.suggestedAction.trim() : '';
  const retryPromptAddendum =
    typeof record.retryPromptAddendum === 'string' && record.retryPromptAddendum.trim()
      ? record.retryPromptAddendum.trim() : undefined;
  return { rootCauseCategory, confidence, summary, suggestedAction, retryPromptAddendum };
}

export function getFailureAnalysisPath(artifactRootDir: string, taskId: string): string {
  return path.join(artifactRootDir, taskId, 'failure-analysis.json');
}

const MAX_EXCERPT_CHARS = 1500;

export function buildFailureDiagnosticPrompt(input: {
  taskId: string;
  taskTitle: string;
  completionClassification: string;
  stopReason: string | null;
  validationFailureSignature: string | null;
  noProgressSignals: string[];
  iterationSummaries: string[];
  lastIterationPromptExcerpt: string;
  lastResponseExcerpt: string;
}): string {
  const promptExcerpt = input.lastIterationPromptExcerpt.slice(0, MAX_EXCERPT_CHARS);
  const responseExcerpt = input.lastResponseExcerpt.slice(0, MAX_EXCERPT_CHARS);
  return [
    'You are a failure-analysis agent for an autonomous coding loop.',
    'Analyse the evidence below and return a JSON diagnostic artifact.',
    '',
    `Task: ${input.taskId} — ${input.taskTitle}`,
    `Classification: ${input.completionClassification}`,
    input.stopReason ? `Stop reason: ${input.stopReason}` : '',
    input.validationFailureSignature ? `Validation failure: ${input.validationFailureSignature}` : '',
    input.noProgressSignals.length > 0 ? `No-progress signals: ${input.noProgressSignals.join(', ')}` : '',
    '',
    '## Last 3 iteration summaries',
    ...input.iterationSummaries.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Last iteration prompt (truncated)',
    promptExcerpt,
    '',
    '## Last iteration response (truncated)',
    responseExcerpt,
    '',
    'Respond with ONLY a valid JSON object in a ```json fence:',
    '{ "rootCauseCategory": "transient"|"implementation_error"|"task_ambiguity"|"validation_mismatch"|"dependency_missing"|"environment_issue",',
    '  "confidence": "high"|"medium"|"low",',
    '  "summary": "<one sentence root cause>",',
    '  "suggestedAction": "<one sentence recommended next action>",',
    '  "retryPromptAddendum": "<optional short string>" }'
  ].filter(Boolean).join('\n');
}

export async function writeFailureAnalysis(
  artifactRootDir: string,
  taskId: string,
  analysis: FailureAnalysis
): Promise<string> {
  const taskArtifactDir = path.join(artifactRootDir, taskId);
  await fs.mkdir(taskArtifactDir, { recursive: true });
  const filePath = getFailureAnalysisPath(artifactRootDir, taskId);
  await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf8');
  return filePath;
}
```

---

## Task 6: Integrate into iterationEngine.ts

**Files:** `src/ralph/iterationEngine.ts`

- [ ] **Step 1:** Add `shouldRunFailureDiagnostic` to the loopLogic import line.

- [ ] **Step 2:** Add import alongside other ralph module imports:
  ```typescript
  import { buildFailureDiagnosticPrompt, classifyTransientFailure, FailureAnalysis, parseFailureDiagnosticResponse, writeFailureAnalysis } from './failureDiagnostics';
  ```

- [ ] **Step 3:** Add `maybeRunFailureDiagnostic` private method after `maybeRunInlinePlanningPass`.

  Full method signature:
  ```typescript
  private async maybeRunFailureDiagnostic(input: {
    taskId: string;
    taskTitle: string;
    result: RalphIterationResult;
    config: RalphCodexConfig;
    artifactRootDir: string;
    iterationHistory: RalphIterationResult[];
    workspaceRoot: string;
    lastIterationPrompt: string;
    lastMessage: string;
  }): Promise<void>
  ```

  Method body — all logic inside a try-catch that logs warn and returns on any error:
  1. Call `shouldRunFailureDiagnostic(result.completionClassification, result.verificationStatus, config.failureDiagnostics)` — return early if false.
  2. Build `combinedSignal` by joining `result.verification.validationFailureSignature`, `result.errors`, and `result.noProgressSignals`.
  3. Call `classifyTransientFailure(combinedSignal)` — if truthy, write a `FailureAnalysis` with `rootCauseCategory: 'transient'`, `confidence: 'high'`, summary and suggestedAction, then return (no LLM call).
  4. Get strategy via `this.strategies.getCliExecStrategyForProvider()`. If `runExec` is unavailable, log warn and return.
  5. Compute `iterationSummaries` from `iterationHistory.slice(-3).map(r => r.summary)`.
  6. Call `buildFailureDiagnosticPrompt` with taskId, taskTitle, completionClassification, stopReason, validationFailureSignature, noProgressSignals, iterationSummaries, and both excerpt parameters.
  7. Create `taskArtifactDir = path.join(artifactRootDir, taskId)`, mkdir it, write `failure-diagnostic-prompt.md`.
  8. Invoke the CLI strategy with `commandPath = getCliCommandPath(config)`, `workspaceRoot`, `executionRoot: workspaceRoot`, `prompt`, `promptHash: hashText(prompt)`, `promptByteLength: utf8ByteLength(prompt)`, `transcriptPath`, `lastMessagePath`, `model`, `reasoningEffort`, `sandboxMode`, `approvalMode`, `timeoutMs` (from `cliExecutionTimeoutMs` if > 0), `promptCaching`.
  9. Call `parseFailureDiagnosticResponse(execResult.lastMessage)` — if null, log warn and return.
  10. Build `FailureAnalysis` from parsed fields, call `writeFailureAnalysis(artifactRootDir, taskId, analysis)`, log info with `rootCauseCategory`.

- [ ] **Step 4:** After the stop-decision if/else chain (before `let _effectiveTaskFile = afterCoreState.taskFile;`), insert:
  ```typescript
    // Best-effort failure diagnostic: classify root cause and write failure-analysis.json.
    if (!loopDecision.shouldContinue && result.selectedTaskId) {
      await this.maybeRunFailureDiagnostic({
        taskId: result.selectedTaskId,
        taskTitle: prepared.selectedTask?.title ?? result.selectedTaskId,
        result,
        config: prepared.config,
        artifactRootDir: prepared.paths.artifactDir,
        iterationHistory: prepared.state.iterationHistory,
        workspaceRoot: prepared.rootPath,
        lastIterationPrompt: prepared.prompt,
        lastMessage
      });
    }
  ```

- [ ] **Step 5:** Run `npx tsc --noEmit -p ./` — confirm 0 errors.

---

## Task 7: Unit tests (test/failureDiagnostics.test.ts)

All tests use `node:test` + `node:assert/strict`. No mocking framework.

Imports needed: `classifyTransientFailure`, `getFailureAnalysisPath`, `parseFailureDiagnosticResponse`, `writeFailureAnalysis`, `FailureAnalysis` from `../src/ralph/failureDiagnostics`; `shouldRunFailureDiagnostic` from `../src/ralph/loopLogic`.

### classifyTransientFailure (criterion 9 — no LLM call for transient)

- [ ] `'FATAL network error connecting to registry'` → `'transient'`
- [ ] `'lock contention on .ralph/tasks.json'` → `'transient'`
- [ ] `'process timeout after 30000ms'` → `'transient'`
- [ ] `'Error: ECONNREFUSED 127.0.0.1:3000'` → `'transient'`
- [ ] `'Cannot find name x at line 42'` → `null`
- [ ] `''` → `null`

### shouldRunFailureDiagnostic (criterion 10 — mode=off skips LLM)

- [ ] mode `'off'` returns `false` for `blocked/failed`, `failed/failed`, `no_progress/passed`
- [ ] mode `'auto'` + `blocked` classification → `true`
- [ ] mode `'auto'` + `verificationStatus='failed'` → `true`
- [ ] mode `'auto'` + `complete/passed` → `false`
- [ ] mode `'auto'` + `no_progress/passed` → `false`

### parseFailureDiagnosticResponse (criterion 11 — malformed handled gracefully)

- [ ] empty string → `null`
- [ ] `'not json'` → `null`
- [ ] `'{ bad }'` → `null`
- [ ] JSON with missing `rootCauseCategory` → `null`
- [ ] JSON with unrecognised `rootCauseCategory` value → `null`
- [ ] Valid fenced JSON → parses `rootCauseCategory`, `confidence`, `summary`
- [ ] Valid bare JSON → parses correctly
- [ ] `retryPromptAddendum` included when present
- [ ] Unrecognised `confidence` value → defaults to `'low'`

### getFailureAnalysisPath

- [ ] Returns `path.join(artifactRootDir, 'T42', 'failure-analysis.json')`

### writeFailureAnalysis (criterion 12 — correct artifact path on blocked task)

- [ ] Use `fs.mkdtemp` for `tmpDir`; write analysis for `taskId='T99'` with `rootCauseCategory='implementation_error'`; assert returned path equals `path.join(tmpDir, 'T99', 'failure-analysis.json')`; read back and verify `schemaVersion`, `kind`, `taskId`, `rootCauseCategory`; cleanup `tmpDir` in `finally`.

The test file boilerplate (complete implementation):

```typescript
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  classifyTransientFailure,
  getFailureAnalysisPath,
  parseFailureDiagnosticResponse,
  writeFailureAnalysis
} from '../src/ralph/failureDiagnostics';
import type { FailureAnalysis } from '../src/ralph/failureDiagnostics';
import { shouldRunFailureDiagnostic } from '../src/ralph/loopLogic';

test('classifyTransientFailure: network error -> transient', () => {
  assert.equal(classifyTransientFailure('FATAL network error connecting to registry'), 'transient');
});
test('classifyTransientFailure: lock contention -> transient', () => {
  assert.equal(classifyTransientFailure('lock contention on .ralph/tasks.json'), 'transient');
});
test('classifyTransientFailure: process timeout -> transient', () => {
  assert.equal(classifyTransientFailure('process timeout after 30000ms'), 'transient');
});
test('classifyTransientFailure: ECONNREFUSED -> transient', () => {
  assert.equal(classifyTransientFailure('Error: ECONNREFUSED 127.0.0.1:3000'), 'transient');
});
test('classifyTransientFailure: non-transient -> null', () => {
  assert.equal(classifyTransientFailure('Cannot find name x at line 42'), null);
});
test('classifyTransientFailure: empty string -> null', () => {
  assert.equal(classifyTransientFailure(''), null);
});

test('shouldRunFailureDiagnostic: mode=off always false', () => {
  assert.equal(shouldRunFailureDiagnostic('blocked', 'failed', 'off'), false);
  assert.equal(shouldRunFailureDiagnostic('failed', 'failed', 'off'), false);
  assert.equal(shouldRunFailureDiagnostic('no_progress', 'passed', 'off'), false);
});
test('shouldRunFailureDiagnostic: blocked+auto -> true', () => {
  assert.equal(shouldRunFailureDiagnostic('blocked', 'passed', 'auto'), true);
});
test('shouldRunFailureDiagnostic: verificationStatus=failed+auto -> true', () => {
  assert.equal(shouldRunFailureDiagnostic('partial_progress', 'failed', 'auto'), true);
});
test('shouldRunFailureDiagnostic: complete+passed+auto -> false', () => {
  assert.equal(shouldRunFailureDiagnostic('complete', 'passed', 'auto'), false);
});
test('shouldRunFailureDiagnostic: no_progress+passed+auto -> false', () => {
  assert.equal(shouldRunFailureDiagnostic('no_progress', 'passed', 'auto'), false);
});

test('parseFailureDiagnosticResponse: empty string -> null', () => {
  assert.equal(parseFailureDiagnosticResponse(''), null);
});
test('parseFailureDiagnosticResponse: non-JSON -> null', () => {
  assert.equal(parseFailureDiagnosticResponse('not json'), null);
});
test('parseFailureDiagnosticResponse: invalid JSON structure -> null', () => {
  assert.equal(parseFailureDiagnosticResponse('{ bad }'), null);
});
test('parseFailureDiagnosticResponse: missing rootCauseCategory -> null', () => {
  assert.equal(parseFailureDiagnosticResponse('{"summary":"x","suggestedAction":"y"}'), null);
});
test('parseFailureDiagnosticResponse: invalid rootCauseCategory -> null', () => {
  assert.equal(parseFailureDiagnosticResponse('{"rootCauseCategory":"unknown","summary":"x","suggestedAction":"y"}'), null);
});
test('parseFailureDiagnosticResponse: valid fenced JSON', () => {
  const text = '```json\n{"rootCauseCategory":"implementation_error","confidence":"high","summary":"Type mismatch","suggestedAction":"Fix it"}\n```';
  const result = parseFailureDiagnosticResponse(text);
  assert.ok(result);
  assert.equal(result.rootCauseCategory, 'implementation_error');
  assert.equal(result.confidence, 'high');
  assert.equal(result.summary, 'Type mismatch');
});
test('parseFailureDiagnosticResponse: valid bare JSON', () => {
  const result = parseFailureDiagnosticResponse('{"rootCauseCategory":"task_ambiguity","confidence":"low","summary":"Unclear","suggestedAction":"Reframe"}');
  assert.ok(result);
  assert.equal(result.rootCauseCategory, 'task_ambiguity');
});
test('parseFailureDiagnosticResponse: retryPromptAddendum included', () => {
  const result = parseFailureDiagnosticResponse('{"rootCauseCategory":"validation_mismatch","confidence":"medium","summary":"Docs","suggestedAction":"Update","retryPromptAddendum":"Check docs first"}');
  assert.ok(result);
  assert.equal(result.retryPromptAddendum, 'Check docs first');
});
test('parseFailureDiagnosticResponse: unrecognised confidence -> low', () => {
  const result = parseFailureDiagnosticResponse('{"rootCauseCategory":"dependency_missing","confidence":"very_high","summary":"Missing","suggestedAction":"Install"}');
  assert.ok(result);
  assert.equal(result.confidence, 'low');
});

test('getFailureAnalysisPath: returns correct path', () => {
  const artifactRootDir = path.join('.ralph', 'artifacts');
  assert.equal(getFailureAnalysisPath(artifactRootDir, 'T42'), path.join(artifactRootDir, 'T42', 'failure-analysis.json'));
});

test('writeFailureAnalysis: writes to correct artifact path on blocked task', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-failure-analysis-'));
  try {
    const analysis: FailureAnalysis = {
      schemaVersion: 1,
      kind: 'failureAnalysis',
      taskId: 'T99',
      createdAt: '2026-04-11T00:00:00.000Z',
      rootCauseCategory: 'implementation_error',
      confidence: 'high',
      summary: 'Type error in validation.',
      suggestedAction: 'Fix the type mismatch.'
    };
    const writtenPath = await writeFailureAnalysis(tmpDir, 'T99', analysis);
    const expectedPath = path.join(tmpDir, 'T99', 'failure-analysis.json');
    assert.equal(writtenPath, expectedPath);
    const content = await fs.readFile(writtenPath, 'utf8');
    const parsed = JSON.parse(content) as FailureAnalysis;
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.kind, 'failureAnalysis');
    assert.equal(parsed.taskId, 'T99');
    assert.equal(parsed.rootCauseCategory, 'implementation_error');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});
```

- [ ] **Step 1:** Write the test file.
- [ ] **Step 2:** Run `npm run test` — confirm all tests pass.

---

## Task 8: Full validation and commit

- [ ] **Step 1:** Run `npm run validate` — compile, check:docs, check:ledger, check:prompt-budget, lint, test all pass, exit 0.

- [ ] **Step 2:** Commit:
  ```bash
  git add src/ralph/types.ts src/config/types.ts src/config/defaults.ts src/config/readConfig.ts package.json src/ralph/loopLogic.ts src/ralph/failureDiagnostics.ts src/ralph/iterationEngine.ts test/failureDiagnostics.test.ts
  git commit -m "feat(T102): intelligent failure recovery Phase 1 — FailureCategoryId taxonomy and diagnostic pass artifact"
  ```

---

## Self-Review: Spec Coverage

| Criterion | Covered by |
|---|---|
| (1) FailureCategoryId in types.ts | Task 1 |
| (2) failureDiagnostics config ('auto'\|'off', default 'auto') | Task 2 |
| (3) maxRecoveryAttempts config (number, default 3) | Task 2 |
| (4) loopLogic triggers diagnostic on blocked/verifier-exhausted | Task 4 (shouldRunFailureDiagnostic) + Task 6 Step 4 (call site) |
| (5) Diagnostic prompt with task def, prompt excerpt, failure output, 3 history entries | Task 5 buildFailureDiagnosticPrompt |
| (6) failure-analysis.json at .ralph/artifacts/taskId/failure-analysis.json | Task 5 writeFailureAnalysis |
| (7) Transient signals classified without LLM call | Task 5 classifyTransientFailure + Task 6 Step 3 logic |
| (8) failureDiagnostics='off' suppresses invocation | Task 4 shouldRunFailureDiagnostic returns false |
| (9) Unit test: transient category without LLM call | Task 7 classifyTransientFailure tests |
| (10) Unit test: LLM call skipped when mode=off | Task 7 shouldRunFailureDiagnostic tests |
| (11) Unit test: malformed response handled gracefully | Task 7 parseFailureDiagnosticResponse tests |
| (12) Unit test: failure-analysis.json at correct path on blocked task | Task 7 writeFailureAnalysis test |
| (13) npm run validate passes | Task 8 |

All 13 criteria covered. No placeholders.
