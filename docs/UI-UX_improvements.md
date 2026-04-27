# Dashboard & Sidebar UI/UX — Implementation Contract

> **Status:** Active implementation guide.
> **Scope:** Dashboard (editor panel) and sidebar (activity-bar view) refresh.
> **Live code:** `src/ui/panelHtml.ts`, `src/ui/sidebarHtml.ts`, `src/ui/dashboardPanel.ts`, `src/ui/sidebarViewProvider.ts`, `src/webview/`.

---

## Artifact & Reference Boundaries

| Path | Role |
|---|---|
| `src/ui/` | **Production** — dashboard panel and sidebar HTML, state, broadcasting |
| `src/webview/` | **Production** — shared webview infrastructure (WebviewPanelManager, MessageBridge, DashboardHost, styles) |
| `UXrefresh/` | **Reference only** — static HTML prototype captured during redesign; not shipped, not imported, not tested |
| Third generated design image | **Prompt-note / design-brief artifact** — captured as creative direction input; it is not a runtime interface and must not be implemented as a screen |

No production code may import from or depend on `UXrefresh/`.

---

## Current Implementation State

The dashboard and sidebar are production surfaces backed by shared infrastructure:

- **Dashboard** — four-tab editor panel (Overview / Work / Diagnostics / Settings) with a persistent sidebar rail. Managed as a singleton via `WebviewPanelManager` and controlled by `DashboardHost`.
- **Sidebar** — compact activity-bar view with Simple/Advanced mode switcher (Run / Agents / Seed tabs in advanced mode). Shares `DashboardHost` for message handling and state.
- **Task seeding** — exposed on both the dashboard Work tab (`buildTaskSeedingCard()`) and the sidebar Seed tab. Appends flat v2 backlog tasks through the shared normalization boundary. Seeding attempts write durable artifacts under `.ralph/artifacts/task-seeding/task-seeding-<timestamp>.json`.
- **Config sync** — `WebviewConfigSync` serializes inline setting writes, supporting both flat and dotted-nested keys.
- **Data loading** — `dashboardDataLoader.ts` assembles `DashboardSnapshot` from `collectStatusSnapshot()` and `readMultiAgentStatusSummaries()`.

---

## Design Directives

### 1. Progressive Disclosure

Advanced settings (memory-summary threshold, tier thresholds, hook scripts) are collapsed inside `<details>` elements, grouped into core and advanced sections. Core settings (provider, presets, agent count) remain visible by default.

**Gaps to close:**
- Verify every non-core setting defaults to collapsed on first open.
- Ensure new settings added in future work inherit the collapsed default.

### 2. Inline Validation

Model-tiering thresholds validate inline (`simpleThreshold >= complexThreshold` marks the control `.invalid` with error text). Provider selection surfaces preflight-level diagnostics in the Attention card.

**Gaps to close:**
- Extend inline validation to CLI-path settings, auth-mode mismatches, and workspace-root resolution failures.
- Surface preflight errors as inline guidance next to the responsible setting, not only in the Attention card.

### 3. Actionable Empty States

Empty states across the dashboard already include CTAs:
- No task selected → PRD wizard button.
- PRD exists, no tasks → generate-tasks button.
- No iterations → contextual guidance text.
- Dead-letter empty → informational text.

**Gaps to close:**
- Sidebar simple-mode empty state should include a CTA when no PRD exists (currently shows only "No task selected").
- Iteration history empty state should offer a "Run First Iteration" action.
- Dead-letter and agent-grid empty states should link to relevant docs or diagnostics.

### 4. Status Feedback

Loop state is reflected via a hero-card pill (running/idle/error), health-grid metric cells, and broadcast-driven re-renders on phase/iteration events. Active iteration rows signal clickability through artifact-link affordances.

**Gaps to close:**
- Add a visual busy indicator (CSS animation) on the hero pill when `state === 'running'`.
- Iteration and artifact rows should use consistent hover/focus affordances (pointer cursor, subtle highlight).

### 5. Dashboard Hierarchy

The four-tab layout separates concerns: Overview for at-a-glance health, Work for task and iteration detail, Diagnostics for deep inspection, Settings for configuration. The persistent sidebar rail provides workspace identity, tab navigation, quick actions, and current-task context.

**Gaps to close:**
- Overview Recent Activity currently shows last 5 iterations — ensure the count is configurable or includes a "show all" link to the Work tab.
- Current Work card on the sidebar rail should update within the same debounce window as the main panel content.

### 6. Sidebar Workflow

The sidebar provides a triage-oriented compact view:
- Simple mode: one-click loop start/stop, PRD wizard access.
- Advanced mode: granular run controls (loop, multi-agent, single iteration, prompt), agent-role buttons, task-seeding surface.

**Gaps to close:**
- Add search/filter behavior for the task list (filter by status, text search on title).
- Surface blocked-task count and dead-letter count as tappable badges that navigate to Diagnostics.
- Seed tab result feedback should persist across re-renders until explicitly dismissed.

---

## Acceptance Criteria

1. Advanced settings are collapsed by default; core settings (provider, presets, agent count) are immediately visible.
2. Provider and config issues surface inline guidance next to the responsible control.
3. Every empty state includes at least one CTA directing the user to the next logical action.
4. Iteration rows and artifact links have clear interactive affordances (cursor, hover state).
5. The sidebar supports useful triage behavior: status-based filtering, blocked/dead-letter badges, and persistent seed-result feedback.
6. No production code in `src/` imports from or references `UXrefresh/`.
7. The third generated design image is not represented as a runtime screen anywhere in the codebase.
8. Task seeding persists durable artifacts under `.ralph/artifacts/task-seeding/` and appends normalized v2 tasks.

---

## Implementation Sequencing

| Phase | Work |
|---|---|
| **1 — Docs cleanup** | This document. Align doc language to implementation state; remove exploratory/recommendation wording. |
| **2 — Dashboard gap hardening** | Close gaps listed under directives 1–5: collapsed-default audit, extended inline validation, busy indicator, iteration-row affordances, empty-state CTA completeness. |
| **3 — Sidebar triage work** | Close gaps listed under directive 6: status filter, blocked/dead-letter badges, persistent seed feedback, simple-mode empty-state CTA. |
| **4 — UI tests** | Extend `test/ui/panelHtml.test.ts`, `test/ui/sidebarHtml.test.ts`, and `test/webview/dashboardHost.test.ts` to cover new affordances, collapsed defaults, and empty-state CTAs. |
| **5 — Validate** | `npm run validate` (compile → check:docs → lint → tests) must pass green before any phase is considered done. |

---

## Non-Goals

- Implementing new runtime screens or adding generated images to the extension.
- Shipping UXrefresh/ content as production code.
- Treating the third design image as a UI specification.
- Claiming dashboard/sidebar completeness without source and test evidence.
