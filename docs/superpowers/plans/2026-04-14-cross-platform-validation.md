# Cross-Platform Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ralphdex validation commands execute portably across Windows, Linux, and macOS by extracting leading env assignments into structured verifier process env overrides.

**Architecture:** Keep task validation strings backward-compatible, but normalize leading `KEY=value` prefixes before readiness checks and verifier execution. This limits the change to `src/ralph/verifier.ts`, preserves existing task metadata, and upgrades docs plus tests around the new contract.

**Tech Stack:** TypeScript, Node.js child-process execution, node:test, VS Code extension docs

---

### Task 1: Add failing verifier coverage

**Files:**
- Modify: `test/verifier.test.ts`
- Modify: `src/ralph/verifier.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that assert:

- `extractValidationExecution`-style behavior splits `RALPH_E2E=1 npm run test:e2e-pipeline` into env `{ RALPH_E2E: '1' }` plus command `npm run test:e2e-pipeline`
- readiness resolves `npm`, not the raw prefixed string
- verifier execution passes parsed env overrides to `runProcess`

- [ ] **Step 2: Run the verifier test file to verify it fails**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/verifier.test.js`

Expected: FAIL because the new parsing helpers and env-aware expectations do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add parsing helpers in `src/ralph/verifier.ts`, then thread normalized command text plus env overrides into readiness and verifier execution.

- [ ] **Step 4: Run the verifier test file to verify it passes**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/verifier.test.js`

Expected: PASS

### Task 2: Update operator-facing docs and task metadata

**Files:**
- Modify: `docs/testing.md`
- Modify: `docs/verifier.md`
- Modify: `.ralph/tasks.json`

- [ ] **Step 1: Update docs to describe the portable contract**

Explain that Ralph supports leading `KEY=value` env prefixes portably by lifting them into process env overrides, instead of documenting OS-specific shell forms.

- [ ] **Step 2: Update T122 validation metadata**

Keep the same task goal, but update the blocker wording so it points at Ralph’s portable validation handling rather than a Windows-only workaround.

- [ ] **Step 3: Run focused docs/task sanity checks**

Run: `npm run check:docs`

Expected: PASS

### Task 3: Verify the integrated change

**Files:**
- Modify: `src/ralph/verifier.ts`
- Modify: `test/verifier.test.ts`
- Modify: `docs/testing.md`
- Modify: `docs/verifier.md`
- Modify: `.ralph/tasks.json`

- [ ] **Step 1: Run the targeted test command**

Run: `npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/verifier.test.js`

Expected: PASS

- [ ] **Step 2: Run the broader validation gate**

Run: `npm run validate`

Expected: PASS, or a clearly reported unrelated failure if pre-existing issues remain.
