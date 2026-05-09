# UX Refresh — Dashboard & Sidebar React Implementation

**Date:** 2026-05-09  
**Source design:** `UXrefresh/Ralphdex Dashboard.html`  
**Status:** Approved, pending implementation plan

---

## Goal

Replace the current VS Code activity-bar sidebar (Dashboard webview + Tasks tree + Logs tree) and the main editor-area dashboard panel with a unified, richer React UI derived from the hi-fi design in `UXrefresh/`. All surfaces share a single component library. Anything not backed by real data is hidden and recorded in the deferred features register below.

---

## Section 1 — Architecture

### Surfaces

| Surface | VS Code API | Current shell | New shell |
|---|---|---|---|
| Activity bar sidebar | `WebviewViewProvider` (`ralphCodex.dashboard`) | `SidebarShell.tsx` | New `SidebarShell.tsx` — full tabbed design with internal left nav |
| Editor panel | `WebviewPanel` | `DashboardShell.tsx` | New `DashboardShell.tsx` — same components, no internal left nav (full-width content) |

### VS Code view registrations after this change

- `ralphCodex.dashboard` (webview) — **kept**, gets new shell
- `ralphCodex.tasks` (TreeView) — **removed** from `package.json`
- `ralphCodex.logs` (TreeView) — **removed** from `package.json`
- `src/ui/taskTreeView.ts` — left in place, unregistered (recoverable)

### Directory layout

```
src/webview-ui/
  components/
    SidebarShell.tsx          # replaces current — sidebar: mode toggle + left nav + content area
    DashboardShell.tsx        # replaces current — panel: full-width, no left nav
    primitives/
      Card.tsx                # card, status pill, btn, health pulse, icon set
    hero/
      HeroNow.tsx             # hero card + health strip + start/stop controls
      HealthCell.tsx          # single metric cell in health strip
      PhaseTracker.tsx        # 7-phase pipeline tracker
    panels/
      AgentLanes.tsx
      Timeline.tsx
      FailurePanel.tsx
      DiagnosticsPanel.tsx
    tasks/
      TaskPanel.tsx           # expandable task list (graph deferred)
    orchestration/
      Orchestration.tsx       # Advanced mode only; budget strip
    # settings/SettingsPanel.tsx — existing, unchanged
  styles/
    main.css                  # add new design tokens alongside existing vscode vars
```

### Mode toggle

Three modes: **Simple**, **Standard**, **Advanced**.

- Persisted in `vscodeApi().setState({ mode })` — pure UI preference, not written to VS Code settings.
- Defaults to `'standard'`.
- Controls which tabs are visible and which panel sections render.

### Tabs per mode

| Mode | Tabs |
|---|---|
| Simple | Overview, Tasks, Settings |
| Standard | Overview, Tasks, Diagnostics, Settings |
| Advanced | Overview, Tasks, Diagnostics, Orchestration, Settings |

The Pipelines tab is **deferred** (see deferred register).

---

## Section 2 — Data Mapping

All data flows from `RalphDashboardState` → `WebviewUiModel` → components. No component holds mutable domain state; all mutations go via `vscodeApi().postMessage()`.

### HeroNow

| UI field | Source | Notes |
|---|---|---|
| Loop state / status pill | `state.loopState` | `'idle' \| 'running' \| 'stopped'` |
| Plain-English status (Simple) | `viewModel.readiness.detail` | |
| Current task ID + title | `viewModel.currentTask` | `RalphDashboardTask \| null` |
| Phase tracker | `state.agentLanes[0].phase` | `RalphIterationPhase \| null`; null → hide tracker |
| Iteration current / cap | `state.nextIteration`, `state.iterationCap` | |
| Progress done / total | `viewModel.doneCount`, `viewModel.taskTotal` | |
| Attention count | `state.taskCounts.blocked` | 0 → green, >0 → warn |
| Cache | `snapshot.cost.promptCacheStats.staticPrefixBytes` formatted as KB | sub: "cache hit" / "cache miss" from `cacheHit`; cell hidden when `promptCacheStats === null` |
| Start loop | command `ralphCodex.runRalphLoop` | hidden when `loopState === 'running'` |
| Stop loop | command `ralphCodex.stopLoop` | hidden when `loopState !== 'running'` |
| Run one iteration | command `ralphCodex.runIteration` | Standard + Advanced only |

### Agent Lanes

| UI field | Source |
|---|---|
| Agent ID | `state.agentLanes[].agentId` |
| Phase tracker | `state.agentLanes[].phase` |
| Iteration | `state.agentLanes[].iteration` |
| Message | `state.agentLanes[].message` |

Note: `RalphAgentLaneState` has no `role` or `model` fields. Role colour is derived by matching `agentId` string (same pattern as `getRoleBorderColor` in `src/ui/htmlHelpers.ts`: contains `reviewer` → ok/green, `watchdog` → warn/amber, `scm` → cyan, otherwise → accent). Model labels are deferred.

### Timeline (Iteration History)

| UI column | Source |
|---|---|
| `#n` | `state.recentIterations[].iteration` |
| Task ID | `state.recentIterations[].taskId` |
| Task title | `state.recentIterations[].taskTitle` |
| Classification | `state.recentIterations[].classification` (colour-coded) |
| Stop reason | `state.recentIterations[].stopReason` (dimmed, omit null) |
| Agent | `state.recentIterations[].agentId` |
| Model / tier | `state.recentIterations[].effectiveTier` |
| Click | `postMessage({ type: 'open-iteration-artifact', artifactDir })` |

Duration and cost columns are **deferred** (no data).

### Failure Panel

Renders only when `snapshot.diagnosis !== null`.

| UI field | Source |
|---|---|
| Task ID + title | `snapshot.diagnosis.taskId`, `.taskTitle` |
| Category | `snapshot.diagnosis.category` |
| Confidence pill | `snapshot.diagnosis.confidence` |
| Attempt count | `snapshot.diagnosis.recoveryAttemptCount` |
| What went wrong | `snapshot.diagnosis.summary` |
| Suggested fix | `snapshot.diagnosis.suggestedAction` |
| "Open failure artifact" | `snapshot.diagnosis.failureAnalysisPath` — hidden when null |
| "Skip task" | **deferred** — command existence unverified |
| "Send to dead-letter" | **deferred** — command existence unverified |

### Diagnostics Panel

| UI field | Source |
|---|---|
| Rows | `state.diagnostics[]` — severity + message |

### Task Panel

| UI field | Source |
|---|---|
| Active list | `state.tasks.filter(t => t.status !== 'done')` |
| Completed (collapsed) | `state.tasks.filter(t => t.status === 'done')` |
| Expand detail | notes, blocker, validation, parentId, childIds, dependsOn, priority |

SVG task graph is **deferred** (no dynamic layout solver).

### Orchestration (Advanced)

| UI field | Source |
|---|---|
| Prompt prefix size | `snapshot.cost.promptCacheStats.staticPrefixBytes` formatted as KB |
| Cache hit | `snapshot.cost.promptCacheStats.cacheHit` — "hit" / "miss" / "—" |

Entire section hidden when `snapshot.cost.promptCacheStats === null`. Cost figures, policy rules, model routing table, and raw iteration log are **deferred** (no backing data in state).

### Settings

Existing `SettingsPanel` component, wired to `state.settingsSurface`. **Unchanged.**

---

## Section 3 — Component Behaviour Details

### Primitives (`src/webview-ui/components/primitives/Card.tsx`)

Shared across all panels. Exposes:
- `Card` — surface + border + optional accent top border + optional header
- `StatusPill` — coloured pill for `running | idle | stopped | warn | bad | ok | accent | neutral`
- `Btn` — `primary | secondary | ghost | danger` × `sm | md | lg`
- `HealthPulse` — animated dot for loop state
- `Icon` — inline SVG set (play, pause, stop, check, warn, x, bolt, clock, arrow, dot, cog, graph, plus, ask)

Tokens map to existing VS Code CSS vars:
```css
--rdx-ok:     var(--vscode-testing-iconPassed)
--rdx-warn:   var(--vscode-editorWarning-foreground)
--rdx-bad:    var(--vscode-errorForeground)
--rdx-accent: var(--vscode-button-background)
--rdx-dim:    var(--vscode-descriptionForeground)
--rdx-mono:   var(--vscode-editor-font-family, ui-monospace)
```

### SidebarShell layout

```
┌────────────────────────────────────────────────┐
│ 240px sidebar │ flex-1 main content             │
│               │                                  │
│ [Ralphdex]    │ <active tab content>             │
│ workspace     │                                  │
│ provider·role │                                  │
│               │                                  │
│ MODE          │                                  │
│ ○ Simple      │                                  │
│ ● Standard    │                                  │
│ ○ Advanced    │                                  │
│               │                                  │
│ NAV           │                                  │
│ > Overview    │                                  │
│   Tasks       │                                  │
│   Diagnostics │                                  │
│   Settings    │                                  │
│               │                                  │
│ [current task │                                  │
│  sticky card] │                                  │
└────────────────────────────────────────────────┘
```

### DashboardShell layout

Full-width. Tab bar at top (same tabs as mode dictates), content below. No internal left nav.

### HeroNow

- Accent top border on Card
- Left: HealthPulse + status label + StatusPill + iteration counter
- Simple mode: large plain-English `h2` from `viewModel.readiness`
- Standard/Advanced: task ID badge (mono) + title + PhaseTracker
- Right: action buttons (Start/Stop, Run one iteration)
- Bottom: 3–4 cell HealthStrip grid (Progress, Iteration, Attention, Cache) — Cache cell hidden when `promptCacheStats === null`

### PhaseTracker

Phases: `inspect → select → prompt → execute → verify → classify → persist`

Maps `RalphIterationPhase` values to these labels. Active phase highlighted with accent + blink animation. Completed phases show check mark. Hidden entirely when `phase === null`.

### AgentLanes

One row per `agentLanes[]` entry. Left-border accent colour is uniform (role colouring deferred). Shows agentId, compact PhaseTracker, iteration number, message (truncated).

Hidden entirely when `agentLanes.length === 0`.

### Timeline

Compact grid rows. Classification colour map:
- `complete` → ok (green)
- `partial_progress` → accent (amber)
- `no_progress` → dim
- `blocked` → warn (orange)
- `failed` → bad (red)
- `needs_human_review` → cyan

Hidden when `recentIterations.length === 0`.

### Overview tab content (per mode)

**Simple:** HeroNow → FailurePanel (if present) → Timeline  
**Standard:** HeroNow → FailurePanel (if present) → AgentLanes + Timeline (side by side)  
**Advanced:** HeroNow → FailurePanel (if present) → AgentLanes + Timeline (side by side)  

---

## Section 4 — Deferred Features Register

These features are **not implemented** in this pass. Each should become a backlog task when its prerequisite data or command is available.

| Feature | Reason deferred | File/component to update |
|---|---|---|
| Pipelines tab | No named-pipeline data structure in `RalphDashboardState` | New `PipelinesTab.tsx` |
| SVG task dependency graph | No dynamic layout solver; hardcoded positions not viable for real tasks | `TaskPanel.tsx` |
| Agent lane model labels | `RalphAgentLaneState` has no `model` field | `AgentLanes.tsx` |
| Timeline duration column | `RalphDashboardIteration` has no duration field | `Timeline.tsx` |
| Timeline per-iteration token counts | `RalphDashboardIteration` has no token fields; requires provider to surface input/output/cache token counts in iteration artifacts and propagate to state | `Timeline.tsx`, `RalphDashboardIteration` type, `dashboardDataLoader` |
| Cache cell: per-iteration token breakdown | `PromptCacheStats` only has `staticPrefixBytes` + `cacheHit`; full counts (input, output, cache-read tokens) require provider-level token reporting | `HealthCell.tsx`, `PromptCacheStats` type |
| Failure panel "Auto-recover" | No command registered | `FailurePanel.tsx` |
| Failure panel "Apply & retry" | No command registered | `FailurePanel.tsx` |
| Failure panel "Skip task" | Command existence unverified — audit before enabling | `FailurePanel.tsx` |
| Failure panel "Send to dead-letter" | Command existence unverified — audit before enabling | `FailurePanel.tsx` |
| Pause loop button | `RalphUiLoopState` has no `paused` state | `HeroNow.tsx` |
| Orchestration: policy rules panel | No policy data in `RalphDashboardState` | `Orchestration.tsx` |
| Orchestration: model routing table | No routing data in `RalphDashboardState` | `Orchestration.tsx` |
| Orchestration: raw iteration log | No log stream in `RalphDashboardState` | `Orchestration.tsx` |
| Orchestration: budget cap / soft cap | No costCap policy in state | `Orchestration.tsx` |
| Preset chooser | No preset management in extension | New `PresetChooser.tsx` |
| "New preset from current" | Depends on preset management | New `PresetChooser.tsx` |
| Quick actions keyboard shortcuts | Not wired to VS Code keybindings | `SidebarShell.tsx` |

---

## Section 5 — Testing

- **Unit tests:** Each new component gets a snapshot test using the existing fixture states in `.ralph/artifacts/ui-fixtures/`. New fixtures added for mode=simple, mode=advanced.
- **Existing snapshot tests:** `test/dashboardSnapshot.test.ts` and `test/promptBuilder.test.ts` are unaffected (no prompt or snapshot logic changes).
- **HTML fixtures:** Existing `.ralph/artifacts/ui-fixtures/panel-*.html` and `sidebar-*.html` are regenerated as part of the build — update after implementation.
- **Validation gate:** `npm run validate` must pass before any task is marked done.

---

## Out of Scope

- No changes to `src/ralph/`, `src/codex/`, `src/prompt/`, or any backend logic.
- No changes to `DashboardHost`, `dashboardDataLoader`, or message protocol.
- No new VS Code commands in this pass.
- No GitHub Actions or operator CLI features.
