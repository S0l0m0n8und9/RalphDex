# PRD Wizard Progressive Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the PRD wizard with the dashboard design language, convert it into a progressive-disclosure flow, and show richer task fields during task review.

**Architecture:** Keep the existing single-file wizard host, but tighten its HTML/CSS/JS render structure so the active step is emphasized while completed and future steps collapse into summaries or locked previews. Extend the wizard task-edit message contract so task review cards can render and persist dependencies, notes, and acceptance details alongside the existing title, tier, and ordering controls.

**Tech Stack:** TypeScript, VS Code webviews, node:test, shared webview CSS tokens

---

### Task 1: Progressive Disclosure Rendering

**Files:**
- Modify: `src/webview/prdCreationWizardHost.ts`
- Test: `test/webview/prdCreationWizardHost.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that asserts the wizard HTML/state supports an active step treatment plus collapsed review/confirm summaries rather than rendering all sections as equal-weight long-form content.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/webview/prdCreationWizardHost.test.ts`
Expected: FAIL because the current wizard still renders every step as a full section without the new progressive-disclosure markers.

- [ ] **Step 3: Write minimal implementation**

Update the wizard render function and inline CSS so:
- the current step is the primary panel
- completed steps render as compact summaries
- future steps render as locked previews/guidance
- confirm remains visible as a compact side summary, expanding when active or after write

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/webview/prdCreationWizardHost.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/webview/prdCreationWizardHost.test.ts src/webview/prdCreationWizardHost.ts docs/superpowers/plans/2026-04-23-prd-wizard-progressive-disclosure.md
git commit -m "feat: improve prd wizard progressive disclosure"
```

### Task 2: Richer Task Review Fields

**Files:**
- Modify: `src/webview/prdCreationWizardHost.ts`
- Test: `test/webview/prdCreationWizardHost.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that edits reviewed task `dependencies`, `notes`, and `acceptance`, then confirms those fields are passed through to `writeDraft`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/webview/prdCreationWizardHost.test.ts`
Expected: FAIL because the current task review UI/message contract only updates titles and tiers.

- [ ] **Step 3: Write minimal implementation**

Extend the inbound message union, host message handling, and task review card markup/event wiring so operators can edit and persist `dependencies`, `notes`, and `acceptance`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/webview/prdCreationWizardHost.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/webview/prdCreationWizardHost.test.ts src/webview/prdCreationWizardHost.ts
git commit -m "feat: expand prd wizard task review details"
```

### Task 3: Final Verification

**Files:**
- Modify: `src/webview/prdCreationWizardHost.ts`
- Test: `test/webview/prdCreationWizardHost.test.ts`

- [ ] **Step 1: Run targeted verification**

Run: `npm test -- test/webview/prdCreationWizardHost.test.ts`
Expected: PASS with the updated wizard tests green.

- [ ] **Step 2: Run broader validation**

Run: `npm run validate`
Expected: PASS with compile, type-check, and test gates green.

- [ ] **Step 3: Review scope**

Confirm the change is limited to the PRD wizard experience and task-review persistence surface, with no unrelated command or runtime behavior changes.

- [ ] **Step 4: Commit**

```bash
git add src/webview/prdCreationWizardHost.ts test/webview/prdCreationWizardHost.test.ts docs/superpowers/plans/2026-04-23-prd-wizard-progressive-disclosure.md
git commit -m "feat: refresh prd wizard review flow"
```
