# RalphDex UX Improvement Roadmap

## Purpose

This roadmap defines the next body of UX work after the recent sidebar/dashboard/readiness/settings consolidation. It is evidence-based from the current repository state as of 2026-05-06 and is scoped to operator clarity, safety, and recovery usability.

## Evidence Baseline

- `git log --oneline --decorate --since="2026-04-25"` on `main` (head `586c715`, merge PR #62).
- Key landed commits reviewed:
  - `42a7ef7`, `2ac934f`, `80114ff` (Issue #37 UX contract audit and terminology map)
  - `384c9f6`, `d3b0a8c` (sidebar/dashboard simplification for #38/#41)
  - `e673be0`, `2e1fc84`, `e9d17b3`, `358675d`, `83ca68c` (#39 no-PRD/readiness routing and tests)
  - `6d30386`, `dc4f7c4`, `28ccc77`, `6739774`, `586c715` (#40 settings regrouping + PR #62 follow-up settings map UI)
  - `716dab5` (#55 latest artifact consistency)
  - `078de18`, `9861696`, `e90370d` (#56 offline eval harness/reporting)
  - `25f8b52`, `56a1a94` (#57 dogfooding runbook/evidence)
  - `b5f3a4e` (#58 settings discovery + UI fixture harness)
  - `d38073c`, `6a05713`, `5cd0b40` (#59 execution profile visibility/evidence)
  - `9ebf4a4` and docs validation rules in `src/validation/docsValidator.ts` (#60 docs/security guardrails)
- Current surfaces reviewed:
  - `docs/issue-37-ux-surface-contract-audit.md`
  - `package.json`
  - `src/ui/sidebarHtml.ts`
  - `src/ui/sidebarViewProvider.ts`
  - `src/ui/panelHtml.ts`
  - `src/ui/dashboardPanel.ts`
  - `src/webview/dashboardHost.ts`
  - `src/ui/prdCreationWizardPanel.ts`
  - `src/webview/prdCreationWizardHost.ts`
  - `src/ui/taskTreeView.ts`
  - `src/config/settingsSurface.ts`
  - `src/commands/registerCommands.ts`
- Current test/evidence harness reviewed:
  - `test/readinessCommandGuards.test.ts`
  - `test/ui/panelReadinessHtml.test.ts`
  - `test/ui/sidebarHtml.test.ts`
  - `test/ui/panelHtml.test.ts`
  - `test/ui/uiFixtureHarness.test.ts`
  - `test/settingsSurface.test.ts`
  - `test/dashboardSnapshot.test.ts`
  - `test/offlineEvalHarness.test.ts`
  - `scripts/check-docs.js` and `src/validation/docsValidator.ts`

## Current State Summary

RalphDex already has the intended structural split:

- Sidebar is compact and run-oriented (`src/ui/sidebarHtml.ts`), with no heavy settings or diagnostics ownership.
- Dashboard is the rich control plane (`src/ui/panelHtml.ts`, `src/webview/dashboardHost.ts`) with readiness cards, diagnostics, settings, seeding, and artifact access.
- No-PRD/default-PRD command-entry guards are active in `src/commands/registerCommands.ts` via `ensureRealPrdOrOpenWizard(...)`, with coverage in `test/readinessCommandGuards.test.ts`.
- PRD wizard is the first-run primary path (`src/ui/prdCreationWizardPanel.ts`, `src/webview/prdCreationWizardHost.ts`).
- Settings are regrouped by operator intent in `src/config/settingsSurface.ts`, with metadata/snapshot tests.
- UI fixtures and offline eval harness exist and are wired into test scripts.

## Recently Landed UX Capabilities

- UX surface contract and command-home mapping are documented (`docs/issue-37-ux-surface-contract-audit.md`).
- Compact sidebar plus richer dashboard separation is implemented.
- First-run and no-real-PRD paths route to PRD wizard instead of provider execution.
- Settings surface is grouped and discoverable, including new-setting highlighting.
- Latest artifact/report opening commands are present and integrated.
- Execution profile visibility and diagnostics are surfaced in dashboard/status.
- Offline evaluation and dogfood evidence paths are available and tested.
- Docs guardrails enforce key terminology and architecture/testing invariants.

## Remaining UX Gaps

- User-facing terminology is not fully consistent in dashboard copy:
  - `dead-letter` wording still appears in some visible panel strings.
  - `Run Pipeline` and `Latest Pipeline Run` still appear in panel copy in places where the command surface already moved to `Run Full Workflow` / `Run Report`.
- Latest-run/report affordances are present but not uniformly labeled across dashboard sections.
- Some operator copy is still implementation-centric (`pipeline` wording in seeding guidance).
- Visual/a11y evidence remains mostly contract/test based; screenshot-level evidence is still manual unless added per change.

## Surface Ownership Model

- Compact sidebar:
  - Fast operator actions only (run/stop, basic readiness message, jump to dashboard).
  - No duplication of full diagnostics/settings controls.
- Rich dashboard:
  - Readiness, diagnostics, recovery controls, run/evidence links, and settings.
  - Primary surface for advanced operator tasks.
- PRD wizard:
  - Primary first-run and no-real-PRD authoring flow.
  - Owns PRD/backlog generation and confirmation writes.
- Task tree:
  - Canonical task browsing/triage (`todo`, `in_progress`, `blocked`, `done`, `Recovery Queue`).
- Command palette:
  - Compatibility/stability surface; keep command IDs stable.
  - Advanced fallback entrypoint for all commands.
- Settings:
  - Intent-grouped view, with dashboard as discovery path and native settings UI as full editor.
- Artifact/evidence documents:
  - Authoritative run evidence remains file-backed under `.ralph/artifacts/` with latest-pointer commands.

## Recommended Sequencing

1. Terminology completion and copy consistency in dashboard panel and tests.
2. Latest-run/report affordance consistency across all dashboard sections.
3. State-copy consistency sweep for empty/blocked/running/recovery strings.
4. Additional fixture-backed coverage for any newly introduced state variants.
5. Optional visual/a11y harness hardening (only if bounded and deterministic).

## Completed Follow-On Slices (2026-05-06)

- Dashboard terminology completion:
  - User-facing dashboard copy now consistently uses `Recovery Queue`, `Run Full Workflow`, and `Latest Run Report`.
- Latest artifact affordance consistency:
  - Dashboard now renders latest artifact actions from one shared renderer to prevent copy/order drift.
- Fixture coverage expansion:
  - Added nuanced snapshot-backed fixtures for blocked+recovery-queue and human-review+requeue states.
- Deterministic UI evidence hook:
  - Added `npm run evidence:ui-fixtures` to export panel/sidebar fixture HTML and a hash manifest under `.ralph/artifacts/ui-fixtures/`.
  - Added `renderUiFixtureEvidence(...)` and test coverage to keep exported evidence deterministic and reviewable.

## Explicit Non-Goals

- No command ID migrations.
- No provider behavior changes.
- No network calls.
- No secret storage/read-path changes.
- No sidebar expansion into a second dashboard.
- No redesign-from-scratch visual rewrite.

## Test And Evidence Expectations For Future UX Changes

- Every UI change must include deterministic tests in `test/ui/*` and/or `test/webview/*`.
- Use fixture-backed state coverage when possible (`test/ui/fixtures/uiStateFixtures.ts`).
- Keep no-PRD/readiness guards intact:
  - no real PRD must route to PRD wizard
  - run-entry commands must not invoke provider execution from missing/default PRD paths
  - empty backlog and blocked preflight states must remain explicit
- Run and report:
  - `npm run check:docs`
  - `npm run validate`
- If `npm run validate` fails, record the exact command, failing test, and blocker in the completion report.
