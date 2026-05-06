# RalphDex UX Improvement Roadmap

## Purpose

This roadmap defines the UX hardening body of work after the recent sidebar/dashboard/readiness/settings consolidation. It is evidence-based from the repository state reviewed on 2026-05-06 and extended through follow-on implementation slices completed on 2026-05-07.

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

- Dashboard copy still carries some implementation-centric wording in niche contexts (for example, older status/history phrases that are technically accurate but less operator-oriented).
- Fixture coverage is strong for readiness/recovery states, but some combinations are still implicit rather than explicitly named (for example specific stuck-agent plus recovery combinations).
- Deterministic HTML evidence is now exported and hash-tracked, but screenshot-based visual regression remains manual by design.
- Operator documentation now points to the evidence path, but the review ritual is still people-driven rather than enforced by a CI policy.

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

## Recommended Sequencing (Updated 2026-05-07)

1. Expand named fixture catalogue for remaining nuanced state combinations (stuck agents, mixed blocked/recovery, partial readiness).
2. Add lightweight copy-governance checks for newly introduced sidebar/dashboard labels to prevent terminology drift.
3. Keep deterministic fixture HTML evidence export in the normal UX review flow (`npm run evidence:ui-fixtures`) and require manifest review for UI-affecting changes.
4. Keep screenshot-based checks manual unless a bounded, deterministic screenshot harness is introduced without adding flaky host dependencies.

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

## Completed Follow-On Slices (2026-05-07)

- Sidebar compactness contract hardening:
  - Added fixture-wide assertions that sidebar remains run-focused and does not reintroduce dashboard-only controls.
  - Guardrails now verify compact sidebar behavior across every fixture state rather than only selected sidebar unit-test setups.
- UX evidence process hardening:
  - Added deterministic fixture HTML + hash export command and validated output path under `.ralph/artifacts/ui-fixtures/`.
  - Extended testing guidance to include evidence export as the expected review artifact for dashboard/sidebar UI changes.

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
