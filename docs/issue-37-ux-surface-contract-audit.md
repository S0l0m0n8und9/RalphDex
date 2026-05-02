# Issue #37 UX Surface Contract Audit

## 1) Surface inventory

| Surface | Current files / entry points | Current purpose | Actual user job | Problems | Recommended purpose | Keep/change/remove |
|---|---|---|---|---|---|---|
| Activity Bar container (`Ralphdex`) | `package.json` → `viewsContainers.activitybar` id `ralphCodex` | RalphDex root container | Open RalphDex control center | None severe | Keep as single extension root surface | Keep |
| Sidebar webview (`ralphCodex.dashboard`) | `package.json` view id `ralphCodex.dashboard`; `src/ui/sidebarViewProvider.ts`; `src/ui/sidebarHtml.ts`; shared `src/webview/dashboardHost.ts` | Compact + advanced launcher/triage | Quick status + start/stop + jump to detail | Duplicates rich dashboard actions and setup actions; advanced controls leak into compact surface | Compact surface only: live status, run/stop, selected task summary, open dashboard | Change |
| Dashboard editor panel | `src/ui/dashboardPanel.ts`; `src/ui/panelHtml.ts`; shared `src/webview/dashboardHost.ts` | Rich dashboard and operations | Diagnose, recover, inspect artifacts, tune settings | Repeated CTAs and overlaps with command palette/tree views | Single rich control plane UI for diagnostics/recovery/evidence/settings entry | Keep + tighten |
| Tasks tree (`ralphCodex.tasks`) | `package.json` tree view; `src/ui/taskTreeView.ts` | Task board and details via native tree | Browse/triage tasks in VS Code-native affordances | Jargon-heavy label `Dead-Letter Queue` | Keep as canonical task browsing surface; simplify user labels | Keep + rename labels |
| Logs tree (`ralphCodex.logs`) | `package.json` tree view | Log navigation | Open logs/transcripts fast | Role is unclear relative to output/document artifact commands | Make secondary/optional shortcuts; prefer output + open-document commands as primary log/evidence path | Change (de-emphasize) |
| Status bar actions | `src/ui/statusBarItem.ts` | Global quick actions | Run most common actions quickly | Elevates `Prepare Prompt` as top-level even for non-handoff users | Keep lightweight status + dashboard entry; remove non-primary actions from status bar | Change |
| PRD wizard panel | `src/ui/prdCreationWizardPanel.ts`; `src/webview/prdCreationWizardHost.ts` | Guided PRD/task generation | First-run setup and PRD lifecycle edits | Needs explicit primacy as first-run/no-PRD path | Keep as primary setup flow | Keep |
| Command palette | `package.json` `contributes.commands`; `src/commands/registerCommands.ts` | Full command access | Power-user fallback | Too many overlapping commands without clear home | Keep all IDs for compatibility; declare a single primary home per command | Keep + contract |
| VS Code settings | `ralphCodex.openSettings` command; `package.json` settings | Configure extension | Provider/model/run/security setup | Flat implementation-centric setting sprawl | Group by user intent and expose through dashboard settings entry | Change |
| Artifact documents / output | Commands such as latest summary/prompt evidence/transcript/provenance bundle | Read run evidence | Audit what happened | Competes with dashboard log chrome | Keep as primary detailed evidence surfaces | Keep |

## 2) Command placement matrix

Rule: every command has exactly one primary home; optional secondary homes are shortcuts.

| Command ID | Current title | Current surfaces | Recommended primary home | Secondary homes | User-facing label recommendation | Notes/risk |
|---|---|---|---|---|---|---|
| `ralphCodex.showSidebar` | Ralphdex: Show Sidebar | Palette | Palette | — | Keep | Utility navigation command |
| `ralphCodex.openDashboard` | Ralphdex: Open Dashboard | Sidebar/panel/palette | Sidebar compact CTA | Palette, status bar | Keep | Canonical transition to rich surface |
| `ralphCodex.showDashboard` | Ralphdex: Show Dashboard | Palette, links | Palette/internal focus alias | — | Rename to `Focus Dashboard` or hide | Duplicative with `openDashboard` |
| `ralphCodex.showRalphStatus` | Ralphdex: Show Status | Palette | Palette | Dashboard refresh affordance | Keep | Snapshot and audit entry |
| `ralphCodex.runRalphLoop` | Ralphdex: Run CLI Loop | Sidebar/panel/palette | Sidebar compact | Dashboard actions, palette | `Run Loop` | Primary execution button |
| `ralphCodex.stopLoop` | Ralphdex: Stop Loop | Sidebar/panel/palette | Sidebar compact | Dashboard, palette | Keep | Pair with run |
| `ralphCodex.runRalphIteration` | Ralphdex: Run CLI Iteration | Panel/palette | Dashboard | Palette | `Run Single Iteration` | Advanced |
| `ralphCodex.runMultiAgentLoop` | Ralphdex: Run Multi-Agent Loop | Sidebar/panel/palette | Dashboard | Palette | Keep (advanced) | Keep out compact sidebar |
| `ralphCodex.runPipeline` | Ralphdex: Run Pipeline | Panel/palette | Dashboard | Palette | Rename label to `Run End-to-End Flow` | Preserve ID for compatibility |
| `ralphCodex.generatePrompt` | Ralphdex: Prepare Prompt | Sidebar/panel/status/palette | Dashboard | Palette | `Prepare IDE Prompt` | Secondary workflow |
| `ralphCodex.openCodexAndCopyPrompt` | Ralphdex: Open Codex IDE | Palette | Dashboard | Palette | `Open IDE Chat with Prompt` | Clarify handoff intent |
| `ralphCodex.openPrdWizard` | Ralphdex: Open PRD Wizard | Sidebar/panel/palette | First-run setup state | Palette, dashboard setup | Keep | Primary no-PRD route |
| `ralphCodex.regeneratePrd` | Ralphdex: Regenerate PRD | Panel/palette | Dashboard setup section | Palette | Keep | Authoring action |
| `ralphCodex.showTasks` | Ralphdex: Show Tasks | Sidebar/panel/palette | Tasks tree | Palette | Keep | Navigation helper |
| `ralphCodex.addTask` | Ralphdex: Add Task | Palette | Tasks tree/header | Palette | Keep | Native task workflow |
| `ralphCodex.seedTasksFromFeatureRequest` | Ralphdex: Seed Tasks from Feature Request | Sidebar/panel/palette | Dashboard work tab | Palette | `Seed Backlog from Feature` | Avoid duplicate forms |
| `ralphCodex.requeueDeadLetterTask` | Ralphdex: Requeue Dead-Letter Task | Palette | Tasks recovery group | Dashboard diagnostics, palette | `Requeue Recovery Task` | Rename user-facing jargon |
| `ralphCodex.autoRecoverTask` | Ralphdex: Auto-Recover Task | Palette/dashboard | Dashboard diagnostics | Palette | Keep | Advanced recovery |
| `ralphCodex.skipTask` | Ralphdex: Skip Task | Palette/dashboard | Dashboard diagnostics | Palette | Consider `Mark Task Blocked` | High-impact action |
| `ralphCodex.openFailureDiagnosis` | Ralphdex: Open Failure Diagnosis | Palette/dashboard | Dashboard diagnostics | Task tree link | Keep | Deep diagnostics |
| `ralphCodex.openLatestRalphSummary` | Ralphdex: Open Latest Ralph Summary | Palette | Logs/artifacts section | Dashboard links | `Open Latest Run Summary` | Document-first surface |
| `ralphCodex.openLatestCliTranscript` | Ralphdex: Open Latest CLI Transcript | Palette | Logs/artifacts section | Dashboard links | Keep | Native document path |
| `ralphCodex.openLatestPromptEvidence` | Ralphdex: Open Latest Prompt Evidence | Palette | Logs/artifacts section | Dashboard links | Keep | Advanced evidence |
| `ralphCodex.openLatestProvenanceBundle` | Ralphdex: Open Latest Provenance Bundle | Palette | Dashboard diagnostics | Palette | Keep | Advanced evidence |
| `ralphCodex.revealLatestProvenanceBundleDirectory` | Ralphdex: Reveal Latest Provenance Bundle Directory | Palette | Dashboard diagnostics | Palette | Keep | Filesystem jump |
| `ralphCodex.openLatestPipelineRun` | Ralphdex: Open Latest Pipeline Run | Palette | Dashboard diagnostics | Palette | `Open Latest Flow Report` | Jargon cleanup |
| `ralphCodex.initializeDoctrinePack` | Ralphdex: Initialize Doctrine Pack | Palette | Dashboard maintenance/setup | Palette | Optional: `Initialize Project Rules Pack` | Advanced/internal concept |
| `ralphCodex.openLatestDoctrineProposal` | Ralphdex: Open Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Open Latest Rules Proposal` | Advanced |
| `ralphCodex.applyLatestDoctrineProposal` | Ralphdex: Apply Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Apply Latest Rules Proposal` | Guarded action |
| `ralphCodex.rejectLatestDoctrineProposal` | Ralphdex: Reject Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Reject Latest Rules Proposal` | Guarded action |
| `ralphCodex.resolveStaleTaskClaim` | Ralphdex: Resolve Stale Task Claim | Palette | Tasks diagnostics/context | Dashboard diagnostics | Keep | Advanced maintenance |
| `ralphCodex.cleanupRalphRuntimeArtifacts` | Ralphdex: Cleanup Runtime Artifacts | Palette | Dashboard maintenance | Palette | `Clean Up Old Run Artifacts` | Advanced maintenance |
| `ralphCodex.resetRalphWorkspaceState` | Ralphdex: Reset Runtime State | Palette | Dashboard maintenance (danger zone) | Palette | Keep + danger text | High-impact |
| `ralphCodex.runReviewAgent` | Ralphdex: Run Review Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert action |
| `ralphCodex.runWatchdogAgent` | Ralphdex: Run Watchdog Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert action |
| `ralphCodex.runScmAgent` | Ralphdex: Run SCM Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert action |
| `ralphCodex.setProviderSecret` | Ralphdex: Set Provider Secret | Palette | Settings/security docs flow | Palette | Keep | Keep out compact surfaces |
| `ralphCodex.clearProviderSecret` | Ralphdex: Clear Provider Secret | Palette | Settings/security docs flow | Palette | Keep | Keep out compact surfaces |
| `ralphCodex.openSettings` | Ralphdex: Open RalphDex Settings | Sidebar/panel/palette | Dashboard settings entry | Palette | Keep | Single settings doorway |

## 3) Settings grouping proposal

Use user-intent grouping while preserving existing setting keys for compatibility.

1. **Provider**
   - `cliProvider`, command paths, grouped provider objects (`copilotFoundry`, `azureFoundry`), secret-handling guidance.
2. **Model and reasoning**
   - `model`, `reasoningEffort`, tiering settings, provider-specific turn/approval knobs.
3. **Run behaviour**
   - loop caps, autonomy mode, planning pass, readiness gate, stop thresholds, auto-review/watchdog/scm, timeout.
4. **Prompt and memory**
   - prompt-context inclusion/budgets/profiles, prompt caching, clipboard copy, memory strategy/window/summary thresholds.
5. **Security and approvals**
   - codex approval/sandbox settings, claude/cpilot permission posture, trust-related constraints.
6. **Paths and artifacts**
   - PRD/task/progress/template path knobs and artifact retention/cleanup controls.
7. **Advanced internals**
   - agent IDs/roles/count, hooks, stale-claim internals, doctrine/pipeline/orchestration expert settings.

## 4) First-run / no-PRD flow proposal

### A. Clean workspace
- Sidebar: setup-only state with one clear CTA (`Open PRD Wizard`).
- Disable run controls until setup done.

### B. PRD missing/default
- On run-related commands (`Run Loop`, `Run Iteration`, `Run Multi-Agent Loop`, `Run Pipeline`, `Prepare Prompt`, `Open Codex IDE`): block execution and route to PRD wizard with explicit reason.

### C. PRD exists, tasks missing
- Dashboard setup card offers:
  - `Generate tasks from PRD` (wizard/regenerate path), or
  - `Seed Backlog from Feature` (append-only path).

### D. Provider/auth missing
- Preflight summary clearly identifies missing command/auth setting and offers `Open Settings` plus secret command guidance.

### E. Preflight blocked
- Keep run controls visible but disabled with blocker explanation and direct fix links.

### F. Ready to run
- Sidebar compact enables run/stop.
- Dashboard remains rich for diagnostics, recovery, and artifacts.

## 5) Stale language decisions

| Term | Visible usage status | Decision |
|---|---|---|
| pipeline | User-facing command labels and docs | Rename user-facing labels (`Flow` / `End-to-End Run`) while preserving IDs |
| dead-letter / dead letter | Task tree group + requeue command label | Rename user-facing to `Recovery Queue` / `Requeue Recovery Task` |
| prepare prompt | Primary user command/CTA label | Rename to `Prepare IDE Prompt` |
| control plane | Mostly technical docs | Hide from primary UX; keep in architecture docs |
| orchestration | Technical diagnostics/doc language | Hide from compact surfaces; keep in advanced diagnostics/docs |
| runtime artifact | Maintenance command/docs language | Rename user-facing to `Run Artifacts` where shown |
| doctrine | Commands/docs for advanced governance | Keep concept but contextualize as advanced/project-rules feature |
| multi-agent | Execution mode command label/docs | Keep, but treat as advanced mode action |

## 6) Follow-up implementation issues mapped to #38–#44

### #38 — Sidebar compact contract
- **Objective:** enforce compact-only sidebar behavior.
- **Scope boundary:** `src/ui/sidebarHtml.ts`, `src/ui/sidebarViewProvider.ts`, `src/webview/dashboardHost.ts`.
- **Acceptance criteria:** sidebar only shows status, run/stop, selected task summary, open-dashboard CTA.
- **Tests/evidence:** webview render snapshots for compact states; command wiring checks.
- **Stop condition:** no advanced actions duplicated in sidebar.

### #39 — Dashboard de-duplication and IA cleanup
- **Objective:** dashboard becomes sole rich UX surface.
- **Scope boundary:** `src/ui/panelHtml.ts`, `src/ui/dashboardPanel.ts`, `src/webview/dashboardHost.ts`.
- **Acceptance criteria:** single ownership of diagnostics/recovery/settings/artifacts; remove duplicate nav buttons.
- **Tests/evidence:** panel UI snapshots + command-surface checklist.
- **Stop condition:** each user job appears once in dashboard IA.

### #40 — Command title and placement contract
- **Objective:** align command labels to user language and publish primary-home mapping.
- **Scope boundary:** `package.json` command titles + docs updates.
- **Likely files:** `package.json`, `README.md`, `docs/workflows.md`.
- **Acceptance criteria:** all command IDs preserved; user labels updated; one primary home per command documented.
- **Tests/evidence:** manifest tests, docs check.
- **Stop condition:** no unresolved duplicate labels/homes.

### #41 — Settings grouping by user intent
- **Objective:** restructure settings presentation by intent.
- **Scope boundary:** no key rename; metadata/grouping and settings UI presentation only.
- **Likely files:** `package.json`, `src/config/settingsSurface.ts`, docs settings sections.
- **Acceptance criteria:** 7 target groups visible and documented.
- **Tests/evidence:** settings-surface snapshot tests, docs check.
- **Stop condition:** operator can locate provider/model/run/security knobs quickly.

### #42 — First-run/no-PRD state machine implementation
- **Objective:** deterministic setup flow across clean/no-PRD/no-tasks/no-provider/preflight-blocked states.
- **Scope boundary:** gating + UX messaging; no backend execution semantics change.
- **Likely files:** `src/commands/registerCommands.ts`, `src/webview/dashboardHost.ts`, `src/ui/panelHtml.ts`, `src/ui/sidebarHtml.ts`.
- **Acceptance criteria:** all run entry points route correctly with clear reason and CTA.
- **Tests/evidence:** command-shell smoke tests for each state branch.
- **Stop condition:** no ambiguous first-run path remains.

### #43 — User-facing terminology pass
- **Objective:** apply keep/rename/hide/remove taxonomy to visible terms.
- **Scope boundary:** strings/tooltips/labels/docs only; internal IDs and artifact structures unchanged.
- **Likely files:** `package.json`, `src/ui/*.ts`, `src/commands/registerCommands.ts`, `README.md`.
- **Acceptance criteria:** stale terms replaced or hidden per table.
- **Tests/evidence:** deterministic string grep audit + UI snapshots.
- **Stop condition:** compact surfaces no longer expose stale jargon.

### #44 — Logs and artifacts surface discipline
- **Objective:** prefer native output/document evidence surfaces over dashboard log chrome.
- **Scope boundary:** view emphasis and links; avoid backend artifact model changes.
- **Likely files:** `src/ui/panelHtml.ts`, `src/commands/artifactCommands.ts`, `package.json` (view/menu contributions), docs.
- **Acceptance criteria:** clear primary path to summary/transcript/evidence docs from dashboard/tasks.
- **Tests/evidence:** smoke tests for open-latest commands + manual UX path verification.
- **Stop condition:** users can reliably answer “what happened?” through native surfaces.
