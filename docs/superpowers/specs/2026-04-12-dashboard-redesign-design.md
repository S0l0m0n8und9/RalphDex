# Ralphdex Dashboard Tabbed Redesign Design

**Date:** 2026-04-12  
**Status:** Approved

## Problem

The current Ralphdex dashboard panel mixes monitoring, command execution, diagnostics, and full configuration editing into one dense two-column surface. This creates three practical problems:

1. The primary operator question, "what is happening now and what should I do next?", competes with low-frequency controls and deep detail.
2. Important interactions are harder to trust than they should be. The iteration history advertises row-level drill-in but routes to a generic latest summary, and several clickable surfaces rely on mouse-only `div` interactions.
3. The panel does not clearly distinguish loading, refresh failure, partial data, and true empty state. Combined with a rigid fixed-width layout, this makes the dashboard feel brittle under real operational use.

The redesign should improve clarity and resilience without changing the underlying Ralph workflows, command IDs, snapshot sources, or settings persistence semantics.

## Goals

- Make the dashboard panel status-first while keeping high-frequency actions close at hand.
- Break the current single-screen surface into tabs so overview, work inspection, diagnostics, and configuration do not compete equally.
- Preserve all current capabilities and command entry points, even when controls move to different tabs.
- Add explicit state handling for loading, refreshing, error, empty, disabled, and partial-data scenarios.
- Improve keyboard accessibility and interaction semantics for task and history drill-in.
- Preserve current extension behavior unless a change is necessary to fix a misleading or broken interaction.

## Non-Goals

- No redesign of the sidebar launcher in this change.
- No command or workflow removals.
- No changes to command IDs contributed by `package.json`.
- No changes to business logic in loop orchestration, artifact generation, provenance, or settings persistence beyond what is needed to surface clearer UI state.
- No unsupported Codex or VS Code integration changes.

## Current Constraints

- The authoritative dashboard panel renderer is `src/ui/panelHtml.ts`.
- Shared task rows, iteration rows, phase lanes, progress bar, and base CSS live in `src/ui/htmlHelpers.ts`.
- The panel and sidebar share state assembly through `src/webview/dashboardHost.ts`.
- Durable dashboard sections are populated through `src/webview/dashboardSnapshot.ts` and `src/webview/dashboardDataLoader.ts`.
- Current inline settings persistence uses the existing webview message bridge and `WebviewConfigSync`; that behavior should remain intact.

## Solution Summary

Replace the single-screen panel layout with a tabbed dashboard containing four tabs:

- `Overview`: primary landing tab with high-level health, selected work, recent activity, and the most common operator actions
- `Work`: task board, task drill-in, and iteration history
- `Diagnostics`: pipeline, failure feed, agent grid, dead-letter, cost, and preflight
- `Settings`: the existing configuration editor and project/admin controls

This is an information architecture refactor first, not a workflow rewrite. Existing commands remain reachable. The redesign removes duplicated action clusters, moves deep detail off the primary tab, and adds explicit UI state semantics so the panel can represent refreshing and failure conditions honestly.

## Information Architecture

### 1. Overview Tab

**Purpose:** Answer "what is Ralph doing, what needs attention, and what should I do next?"

**Content:**

- Header with workspace name, loop state, and active role
- Active phase lanes / run state summary
- Compact health strip with task progress, selected task ID, next iteration, and preflight status
- `Attention` card for the highest-priority interruption:
  - failure feed highlights
  - dead-letter presence
  - human review needed
  - blocked-task warning
- `Current Work` card:
  - selected task title
  - selected task status
  - blocker or validation summary when present
  - next likely operator step
- `Recent Activity` card:
  - last 3-5 iterations with classification and selected task
- `Common Actions` card with only the most frequent safe actions:
  - `ralphCodex.runRalphLoop`
  - `ralphCodex.runMultiAgentLoop`
  - `ralphCodex.runRalphIteration`
  - `ralphCodex.generatePrompt`
  - `ralphCodex.resumePipeline` when relevant
  - `ralphCodex.approveHumanReview` when relevant

**Rules:**

- No full settings editor on this tab
- No duplicated symbolic-vs-text button pairs for the same command
- No deep pipeline metadata unless it directly informs the next action

### 2. Work Tab

**Purpose:** Inspect and manage task execution details.

**Content:**

- Full task board summary
- Active task list
- Completed-task disclosure
- Task details as semantic expand/collapse controls
- Full iteration history

**Interaction Rules:**

- Task rows become semantic controls with visible focus, keyboard activation, and explicit expanded/collapsed state
- Iteration history rows must open the row-specific artifact destination rather than a generic latest summary
- The task list remains the primary work-inspection surface; global command clutter stays off this tab

### 3. Diagnostics Tab

**Purpose:** Investigate stalls, anomalies, and operational risk.

**Content:**

- Expanded pipeline status card
- Failure feed
- Dead-letter section
- Agent grid
- Cost ticker
- Preflight diagnostics

**Rules:**

- Remediation actions stay adjacent to the relevant diagnostic signal
- This tab may be denser than Overview
- Each section must distinguish between "no data yet", "refresh failed", and "feature unavailable"

### 4. Settings Tab

**Purpose:** Configure Ralph and manage low-frequency admin/project actions.

**Content:**

- Existing settings editor, largely preserved
- Project-level actions:
  - `ralphCodex.initializeWorkspace`
  - `ralphCodex.newProject`
  - `ralphCodex.switchProject`
- Lower-frequency artifact/admin actions that do not belong in the common-operations path

**Rules:**

- Inline settings edits continue to use the current config sync path
- Advanced settings remain progressively disclosed
- The tab is explicitly secondary to the operational tabs

## Action Consolidation

Current `Quick Actions`, `Agents`, `Actions`, and `Projects` sections are consolidated into a smaller set of role-appropriate action groups:

- `Overview` contains common operational actions
- `Work` contains work-contextual drill-in only
- `Diagnostics` contains remediation/recovery actions scoped to the signal they address
- `Settings` contains admin and project maintenance controls

No command disappears. The redesign removes duplication and competing visual weight, not functionality.

## State Model

The new panel should explicitly model state for each tab and each major section when relevant.

### Loading

- Show skeleton or muted placeholder content while the durable snapshot is being fetched
- Do not present loading as a true empty state

### Refreshing

- Keep the last successful content visible
- Show an inline "Refreshing…" indicator at the tab or section level
- Avoid blanking the panel between refreshes

### Error

- Render a scoped error state such as "Diagnostics could not refresh"
- Preserve unaffected tabs/sections when possible
- Offer a clear retry path through refresh or an existing dashboard/status command

### Empty

- Reserve empty states for genuine absence of data:
  - no iterations yet
  - no dead-letter entries
  - no cost reported by the provider

### Partial Data

- If one durable section fails or is unavailable, render the remaining sections normally
- The panel must not collapse all snapshot sections back to generic empties because one data path failed

### Disabled Actions

- Disabled buttons should communicate why they are unavailable:
  - loop already running
  - no selected task
  - no dead-letter entries
  - no human review pending

## Accessibility

The redesign must treat semantics as part of the design, not cleanup work.

### Required Improvements

- Tabs must be keyboard reachable and expose selected state
- Task expansion must use semantic controls with `aria-expanded` and `aria-controls`
- Iteration-history navigation must be keyboard-operable
- Focus styling must be visible on tab controls, task rows, history rows, and buttons
- Meaning must not depend on color alone
- Status and refresh/error messaging should be written in plain language

### Specific Fixes

- Replace mouse-only clickable `div` rows with semantic `button` or disclosure patterns
- Keep labels explicit and stable across tabs
- Preserve inline settings input focus behavior during state updates

## Responsive Behavior

The full dashboard panel must support narrower editor widths more deliberately than the current fixed two-column grid.

### Narrow-Width Strategy

- Tabs remain visible and wrap or horizontally scroll as needed
- Main content collapses to one column
- Overview cards stack vertically
- Diagnostics grids become stacked cards
- Critical labels wrap instead of disappearing behind overflow clipping
- The layout must avoid hidden horizontal overflow for important content

This redesign targets the editor panel, not a mobile web experience, but it must remain usable in split editors and narrower VS Code columns.

## Behavioral Compatibility

The redesign must preserve current behavior unless the current behavior is misleading or broken.

### Preserve

- Existing command IDs
- Existing webview message types for command execution and setting updates
- Existing snapshot loader inputs unless additional UI state metadata is needed
- Existing settings write path and debounce/focus-preservation behavior
- Existing durable dashboard sections and data sources

### Fix

- Iteration history should no longer route every row to `ralphCodex.openLatestRalphSummary`
- Snapshot-driven sections should no longer silently collapse refresh failure into generic empty copy
- Interaction semantics should no longer depend on mouse-only containers

## Implementation Notes

The redesign should follow the current module boundaries rather than inventing a parallel UI stack.

### Primary Code Areas

- `src/ui/panelHtml.ts`
  - add tab shell
  - split section rendering by tab
  - collapse duplicated action groups
- `src/ui/htmlHelpers.ts`
  - provide accessible task-row and iteration-row builders
  - add reusable tab, button, and focus styles used by the panel
- `src/webview/dashboardHost.ts`
  - preserve current state assembly
  - add explicit snapshot load, refresh, and error state
  - persist selected tab in webview state
- `src/webview/dashboardSnapshot.ts`
  - only extend if additional UI metadata is needed for state clarity
- `test/ui/panelHtml.test.ts`
  - update for tabbed output and new section placement
- `test/webview/dashboardHost.test.ts`
  - add state tests for refresh, error, and tab-persistence behavior

## Test Expectations

The redesign should add or update tests for:

- default selected tab
- persisted selected tab across rerenders
- Overview tab rendering with common actions
- Work tab rendering for tasks and iteration history
- Diagnostics tab rendering for pipeline/failure/dead-letter/cost/preflight
- Settings tab rendering with current config controls
- row-specific iteration drill-in behavior
- loading, refreshing, error, empty, and partial-data rendering
- keyboard-oriented semantics in generated HTML
- narrow-width-friendly structure where HTML/CSS tests can enforce it

## Rollout Strategy

Implement in one behavior-preserving slice rather than a long-lived partial redesign.

Recommended order:

1. Introduce tab shell and move existing sections behind tabs without changing behavior
2. Consolidate duplicated action groups
3. Fix semantic interactions for task/history controls
4. Introduce explicit loading/refresh/error/partial-data UI states
5. Add responsive layout adjustments
6. Update tests and docs

This order keeps the system working while progressively improving clarity.

## Out of Scope

- Sidebar redesign
- New commands or new extension activation behaviors
- Changes to Ralph task selection logic, verifier logic, provenance, or pipeline orchestration
- Reworking the durable artifact schema beyond narrowly scoped UI-state needs
