# PRD Wizard vNext Design

Date: 2026-04-23
Status: approved for implementation

## Goal

Finish the RalphDex PRD Wizard as a narrow authoring workflow for producing a strong durable PRD at `.ralph/prd.md` and a credible starter backlog at `.ralph/tasks.json`.

The wizard should improve authoring quality and operator confidence before the first loop run or before a PRD rewrite. It should not act as a settings console, provider preset surface, or general workspace bootstrap shell.

## Product Boundaries

The finished wizard owns:

- structured intake for PRD and task generation
- generated or fallback PRD draft review
- generated starter task review
- explicit confirm-write of `.ralph/prd.md` and `.ralph/tasks.json`

The finished wizard does not own:

- `operatorMode`, `cliProvider`, or any unrelated workspace setting persistence
- skill generation or skill recommendations
- runtime inspection, dashboard responsibilities, or status surfaces
- multi-project management or project switching
- silent mutation of unrelated control-plane configuration

## Final Flow

The wizard uses a fixed five-step flow for both new and regenerate modes:

1. `Project Shape`
2. `Draft Generation`
3. `PRD Review`
4. `Task Review`
5. `Confirm Write`

Regenerate mode uses the same shell and same navigation model. It does not become a separate product surface. Instead, regenerate-specific comparison and rewrite guidance appears inside `PRD Review` and `Confirm Write`.

## Step Design

### 1. Project Shape

Collect only generation-relevant inputs:

- `projectType`
- `objective`
- `techStack`
- `nonGoals`
- `existingConventions`

This step keeps the current structured intake model and project-type-specific examples. Input must persist while moving between steps, hiding the panel, and reopening the same panel instance.

### 2. Draft Generation

This step is a narrow action surface with one clear outcome: generate a PRD draft and starter task list.

The step must show:

- generation action
- draft status: `Generated`, `Weak draft`, or `Fallback draft`
- inline generation warnings
- task-count or draft-quality warnings

If provider-backed generation fails, the wizard falls back to a bootstrap draft and must clearly label the output as fallback content that needs operator refinement before write.

### 3. PRD Review

This is the strongest screen in the wizard and carries the main review burden.

The step must show:

- editable PRD draft text
- explicit generation state badge (`Generated`, `Weak draft`, `Fallback draft`)
- PRD findings panel with structural and editorial warnings
- regenerate comparison summary against the current PRD when the wizard is in regenerate mode

The comparison should help the operator decide whether the rewrite is better without leaving the wizard. The intent is reviewable rewriting, not blind regeneration.

### 4. Task Review

This step remains editable but becomes more review-oriented than generation-oriented.

Operator capabilities:

- reorder tasks
- edit task titles
- edit task tier
- delete tasks
- inspect notes, acceptance, validation, and dependencies before write

The step must surface warnings for:

- duplicate or near-duplicate tasks
- vague task titles
- weak validation detail
- weak dependency detail

These findings are warnings, not confirm-write blockers. Hard blockers remain limited to invalid durable output such as missing task ids, blank titles, or an empty task list.

### 5. Confirm Write

This step stays intentionally small and explicit.

It must state:

- `.ralph/prd.md` will be written
- `.ralph/tasks.json` will be replaced
- no unrelated workspace settings will be changed

After success, RalphDex should open both written files and show a compact change summary.

## State Model

The wizard state should become PRD-and-backlog-authoring-specific instead of carrying legacy config-selection state.

Remove:

- `PrdWizardConfigSelection`
- config-toggle messages and rendering
- settings-oriented write summaries

The authoring draft contract becomes:

- `prdText`
- reviewed `tasks`

The host should track review metadata separately from generic warning strings:

- `generationState`: `idle | generated | weak | fallback`
- `prdFindings`: structured PRD review warnings
- `taskFindings`: structured task review warnings
- `comparisonSummary`: regenerate-focused comparison summary
- `writeSummary`: file-oriented result only

This keeps the model aligned with the product boundary: authoring durable inputs, reviewing them, and writing only the PRD and task files.

## PRD Review Checks

PRD checks are structural and editorial. They should not pretend to validate domain truth.

Required checks:

- title exists
- `overview`, `goals`, `scope`, and `non-goals` sections are present
- obvious placeholders are flagged, such as `TODO`, `TBD`, `lorem`, `fill in`, or empty stub content
- thin required sections are flagged when present but insubstantial
- vague wording is flagged heuristically for low-information phrases without concrete detail

PRD findings are warnings intended to improve authoring quality before the first iteration loop.

## Task Review Checks

Task review balances correctness and operator control.

Hard blockers:

- every task has a non-empty id
- every task has a non-empty title
- reviewed task list is not empty

Warnings:

- duplicate or near-duplicate task titles
- vague task titles
- missing or weak validation detail
- missing or weak dependency detail

Task review must preserve rich task shape on write. The wizard must not collapse reviewed tasks to title-only entries.

## Regenerate Mode

Regenerate mode becomes a first-class review workflow without introducing a separate wizard architecture.

Supported behaviors:

- rewrite the whole PRD
- preserve structure while improving wording
- regenerate starter tasks from the current PRD context
- highlight meaningful differences from current durable text
- help the operator evaluate whether the rewrite is actually better

Minimum acceptance:

- operators can understand what changed
- operators can decide whether to accept the rewrite without leaving the wizard

## Write Contract

`writePrdWizardDraft` must become a narrow file-write operation.

It writes only:

- `.ralph/prd.md`
- `.ralph/tasks.json`

It must not:

- update `workspace.getConfiguration(...).update(...)`
- persist `cliProvider`
- persist any other unrelated workspace setting

The returned write summary must be file-oriented and explicit.

## UI Direction

The wizard should feel tighter than the current seven-step flow. Most of the value should live in the two review steps, not in intake or settings.

Design priorities:

- preserve retained context and panel reuse behavior
- show warnings and errors inline
- clearly differentiate `Generated`, `Weak draft`, and `Fallback draft`
- keep confirm-write explicit and low-noise

## Implementation Slices

1. Remove config-selection state, messages, rendering, and persistence from the wizard host and command wiring.
2. Collapse the wizard from seven steps to five and rebuild labels and content accordingly.
3. Add PRD findings utilities and inline review presentation.
4. Add task findings utilities and inline review presentation.
5. Tighten regenerate comparison UX inside `PRD Review`.
6. Narrow the confirm-write path so it writes only `.ralph/prd.md` and `.ralph/tasks.json`.
7. Open the written PRD and task files after success.
8. Update tests to cover the narrowed write contract, findings model, and five-step flow.
9. Update docs so the wizard is described as an authoring workflow rather than a settings surface.

## Acceptance Criteria

The work is complete when:

- the wizard is clearly positioned as a PRD and backlog authoring surface
- it no longer writes `operatorMode`, `cliProvider`, or any unrelated workspace setting during confirm-write
- the stale `Config & Skills` step is removed
- regenerate mode provides clear comparison and review support
- PRD review catches missing structure and placeholder-quality issues
- task review catches duplicate and vague tasks before write as warnings
- fallback generation is explicitly labeled as fallback output
- confirm-write only affects `.ralph/prd.md` and `.ralph/tasks.json`
- tests cover the narrowed contract and reduced scope
- docs reflect the narrowed ownership and authoring-first workflow

## Scope Check

This design intentionally makes the wizard smaller and sharper instead of broader. It does not introduce a settings sidebar, a richer project bootstrap surface, or additional control-plane abstractions. The review quality improves, but ownership narrows.
