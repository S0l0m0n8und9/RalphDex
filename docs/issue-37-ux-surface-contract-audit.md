# Issue #37 UX Surface Contract Audit

## Contract status and scope

This document is the planning contract for Issue #37: it defines where RalphDex user-facing capabilities should live across the VS Code surfaces.

It is **not** an implementation record for Issues #38–#44. Those follow-up issues remain the implementation path for sidebar/dashboard consolidation, first-run readiness, settings regrouping, stale language cleanup, UI fixtures, screenshot evidence, and visual/accessibility testing.

Internal command IDs, configuration keys, artifact paths, and schema names should be preserved for compatibility unless a later implementation issue explicitly scopes a migration. User-facing label changes in this document are recommendations until the corresponding implementation issue applies them.

Command matrix coverage was reconciled against `package.json` `contributes.commands` at the time of this audit. Every contributed command is listed below, including navigation aliases and high-impact mutation commands.

## 1) Surface inventory

| Surface | Current files / entry points | Current purpose | Actual user job | Problems | Recommended purpose | Keep/change/remove |
|---|---|---|---|---|---|---|
| Activity Bar container (`Ralphdex`) | `package.json` → `viewsContainers.activitybar` id `ralphCodex` | RalphDex root container | Open RalphDex control center | None severe | Keep as single extension root surface | Keep |
| Sidebar webview (`ralphCodex.dashboard`) | `package.json` view id `ralphCodex.dashboard`; `src/ui/sidebarViewProvider.ts`; `src/ui/sidebarHtml.ts`; shared `src/webview/dashboardHost.ts` | Compact + advanced launcher/triage | Quick status + start/stop + jump to detail | Duplicates rich dashboard actions and setup actions; advanced controls leak into compact surface | Compact surface only: live status, run/stop, selected task summary, open dashboard | Change |
| Dashboard editor panel | `src/ui/dashboardPanel.ts`; `src/ui/panelHtml.ts`; shared `src/webview/dashboardHost.ts` | Rich dashboard and operations | Diagnose, recover, inspect artifacts, tune settings | Repeated CTAs and overlaps with command palette/tree views | Single rich dashboard UI for diagnostics and recovery, evidence, and settings entry | Keep + tighten |
| Tasks tree (`ralphCodex.tasks`) | `package.json` tree view; `src/ui/taskTreeView.ts` | Task board and details via native tree | Browse/triage tasks in VS Code-native affordances | Jargon-heavy label `Dead-Letter Queue` | Keep as canonical task browsing surface; simplify user labels | Keep + rename labels |
| Logs tree (`ralphCodex.logs`) | `package.json` tree view | Log navigation | Open logs/transcripts fast | Role is unclear relative to output/document artifact commands | Make secondary/optional shortcuts; prefer output + open-document commands as primary log/evidence path | Change (de-emphasize) |
| Status bar actions | `src/ui/statusBarItem.ts` | Global quick actions | Run most common actions quickly | Elevates `Prepare Prompt` as top-level even for non-handoff users | Keep lightweight status + dashboard entry; remove non-primary actions from status bar | Change |
| PRD wizard panel | `src/ui/prdCreationWizardPanel.ts`; `src/webview/prdCreationWizardHost.ts` | Guided PRD/task generation | First-run setup and PRD lifecycle edits | Needs explicit primacy as first-run/no-PRD path | Keep as primary setup flow | Keep |
| Command palette | `package.json` `contributes.commands`; `src/commands/registerCommands.ts` | Full command access | Power-user fallback | Too many overlapping commands without clear home | Keep all IDs for compatibility; declare a single primary home per command | Keep + contract |
| VS Code settings | `ralphCodex.openSettings` command; `package.json` settings | Configure extension | Provider/model/run/security setup | Flat implementation-centric setting sprawl | Group by user intent and expose through dashboard settings entry | Change |
| Artifact documents / output | Commands such as latest summary/prompt evidence/transcript/provenance bundle | Read run evidence | Audit what happened | Competes with dashboard log chrome | Keep as primary detailed evidence surfaces | Keep |

## 2) Command placement matrix

Rule: every contributed command has exactly one primary home. Optional secondary homes are shortcuts, not competing ownership.

| Command ID | Current title | Current surfaces | Recommended primary home | Secondary homes | User-facing label recommendation | Notes/risk |
|---|---|---|---|---|---|---|
| `ralphCodex.addTask` | Ralphdex: Add Task | Palette | Tasks tree/header | Palette | Keep | Native task workflow |
| `ralphCodex.seedTasksFromFeatureRequest` | Ralphdex: Seed Tasks from Feature Request | Sidebar/panel/palette | Dashboard work tab | Palette | `Seed Backlog from Feature` | Avoid duplicate sidebar and dashboard forms |
| `ralphCodex.generatePrompt` | Ralphdex: Prepare Prompt | Sidebar/panel/status/palette | Dashboard | Palette | `Prepare IDE Prompt` | Secondary handoff workflow, not primary run path |
| `ralphCodex.initializeDoctrinePack` | Ralphdex: Initialize Doctrine Pack | Palette | Dashboard maintenance/setup | Palette | Optional: `Initialize Project Rules Pack` | Advanced project-governance concept |
| `ralphCodex.openCodexAndCopyPrompt` | Ralphdex: Open Codex IDE | Palette | Dashboard | Palette | `Open IDE Chat with Prompt` | Clarify handoff intent; command ID can remain Codex-specific for compatibility |
| `ralphCodex.runRalphIteration` | Ralphdex: Run CLI Iteration | Panel/palette | Dashboard | Palette | `Run Single Iteration` | Advanced execution action |
| `ralphCodex.runReviewAgent` | Ralphdex: Run Review Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert action; keep out compact sidebar |
| `ralphCodex.runWatchdogAgent` | Ralphdex: Run Watchdog Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert recovery action; keep out compact sidebar |
| `ralphCodex.runScmAgent` | Ralphdex: Run SCM Agent | Palette | Dashboard advanced diagnostics | Palette | Keep | Expert SCM action; keep out compact sidebar |
| `ralphCodex.runRalphLoop` | Ralphdex: Run CLI Loop | Sidebar/panel/palette | Sidebar compact | Dashboard actions, palette | `Run Loop` | Primary execution button when workspace is ready |
| `ralphCodex.stopLoop` | Ralphdex: Stop Loop | Sidebar/panel/palette | Sidebar compact | Dashboard, palette | Keep | Pair with primary run control |
| `ralphCodex.runMultiAgentLoop` | Ralphdex: Run Multi-Agent Loop | Sidebar/panel/palette | Dashboard | Palette | Keep (advanced) | Keep out compact sidebar unless advanced mode is explicitly enabled |
| `ralphCodex.showRalphStatus` | Ralphdex: Show Status | Palette | Palette | Dashboard refresh affordance | Keep | Snapshot and audit entry; not a duplicate dashboard opener |
| `ralphCodex.openFailureDiagnosis` | Ralphdex: Open Failure Diagnosis | Palette/dashboard | Dashboard diagnostics | Task tree link, palette | Keep | Deep diagnostics path |
| `ralphCodex.autoRecoverTask` | Ralphdex: Auto-Recover Task | Palette/dashboard | Dashboard diagnostics | Palette | Keep | Advanced recovery; make preconditions clear |
| `ralphCodex.skipTask` | Ralphdex: Skip Task | Palette/dashboard | Dashboard diagnostics | Palette | Consider `Mark Task Blocked` | High-impact task-state mutation; require clear confirmation/copy |
| `ralphCodex.openLatestRalphSummary` | Ralphdex: Open Latest Ralph Summary | Palette | Logs/artifacts section | Dashboard links | `Open Latest Run Summary` | Document-first evidence surface |
| `ralphCodex.openLatestProvenanceBundle` | Ralphdex: Open Latest Provenance Bundle | Palette | Dashboard diagnostics | Palette | Keep | Advanced evidence path |
| `ralphCodex.openLatestPromptEvidence` | Ralphdex: Open Latest Prompt Evidence | Palette | Logs/artifacts section | Dashboard links | Keep | Advanced evidence path |
| `ralphCodex.openLatestCliTranscript` | Ralphdex: Open Latest CLI Transcript | Palette | Logs/artifacts section | Dashboard links | Keep | Native document path for provider output |
| `ralphCodex.applyLatestTaskDecompositionProposal` | Ralphdex: Apply Latest Task Decomposition Proposal | Palette | Dashboard diagnostics / task recovery area | Palette | `Apply Task Decomposition Proposal` | High-impact task graph mutation; keep operator-confirmed and avoid compact-sidebar placement |
| `ralphCodex.resolveStaleTaskClaim` | Ralphdex: Resolve Stale Task Claim | Palette | Tasks diagnostics/context | Dashboard diagnostics, palette | Keep | Advanced maintenance |
| `ralphCodex.revealLatestProvenanceBundleDirectory` | Ralphdex: Reveal Latest Provenance Bundle Directory | Palette | Dashboard diagnostics | Palette | Keep | Filesystem jump for advanced inspection |
| `ralphCodex.cleanupRalphRuntimeArtifacts` | Ralphdex: Cleanup Runtime Artifacts | Palette | Dashboard maintenance | Palette | `Clean Up Old Run Artifacts` | Advanced maintenance; safe cleanup wording matters |
| `ralphCodex.resetRalphWorkspaceState` | Ralphdex: Reset Runtime State | Palette | Dashboard maintenance danger zone | Palette | Keep + danger text | High-impact reset; require clear confirmation |
| `ralphCodex.showDashboard` | Ralphdex: Show Dashboard | Palette, links | Palette/internal focus alias | — | Rename to `Focus Dashboard` or hide | Navigation alias; avoid competing with `openDashboard` |
| `ralphCodex.openDashboard` | Ralphdex: Open Dashboard | Sidebar/panel/palette | Sidebar compact CTA | Palette, status bar | Keep | Canonical transition from compact surface to rich surface |
| `ralphCodex.runPipeline` | Ralphdex: Run Pipeline | Panel/palette | Dashboard | Palette | `Run Full Workflow` or `Run End-to-End Pass` | Preserve command ID; rename user-facing label away from implementation jargon |
| `ralphCodex.openLatestPipelineRun` | Ralphdex: Open Latest Pipeline Run | Palette | Dashboard diagnostics | Palette | `Open Latest Run Report` | Jargon cleanup; preserve artifact schema/ID |
| `ralphCodex.openLatestDoctrineProposal` | Ralphdex: Open Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Open Latest Rules Proposal` | Advanced governance action |
| `ralphCodex.applyLatestDoctrineProposal` | Ralphdex: Apply Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Apply Latest Rules Proposal` | Guarded high-impact project-rules mutation |
| `ralphCodex.rejectLatestDoctrineProposal` | Ralphdex: Reject Latest Doctrine Proposal | Palette | Dashboard diagnostics | Palette | `Reject Latest Rules Proposal` | Guarded governance action |
| `ralphCodex.openPrdWizard` | Ralphdex: Open PRD Wizard | Sidebar/panel/palette | First-run setup state | Palette, dashboard setup | Keep | Primary no-PRD route |
| `ralphCodex.regeneratePrd` | Ralphdex: Regenerate PRD | Panel/palette | Dashboard setup section | Palette | Keep | Authoring action |
| `ralphCodex.requeueDeadLetterTask` | Ralphdex: Requeue Dead-Letter Task | Palette | Tasks recovery group | Dashboard diagnostics, palette | `Requeue Recovery Task` | Rename user-facing jargon; preserve ID |
| `ralphCodex.showSidebar` | Ralphdex: Show Sidebar | Palette | Palette | — | Keep | Utility navigation command |
| `ralphCodex.setProviderSecret` | Ralphdex: Set Provider Secret | Palette | Settings/security flow | Palette | Keep | Keep out compact surfaces; sensitive setup action |
| `ralphCodex.clearProviderSecret` | Ralphdex: Clear Provider Secret | Palette | Settings/security flow | Palette | Keep | Keep out compact surfaces; sensitive setup action |
| `ralphCodex.showTasks` | Ralphdex: Show Tasks | Sidebar/panel/palette | Tasks tree | Palette | Keep | Navigation helper; not a task mutation |
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
   - codex approval/sandbox settings, claude/copilot permission posture, trust-related constraints.
6. **Paths and artifacts**
   - PRD/task/progress/template path knobs and artifact retention/cleanup controls.
7. **Advanced internals**
   - agent IDs/roles/count, hooks, stale-claim internals, doctrine/pipeline/orchestration expert settings.

## 4) First-run / no-PRD flow proposal

### A. Clean workspace
- Sidebar: setup-only state with one clear CTA (`Open PRD Wizard`).
- Disable run controls until setup is complete.

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
| pipeline | User-facing command labels and docs | Rename user-facing labels (`Full Workflow` / `End-to-End Pass`) while preserving IDs |
| dead-letter / dead letter | Task tree group + requeue command label | Rename user-facing to `Recovery Queue` / `Requeue Recovery Task` |
| prepare prompt | Primary user command/CTA label | Rename to `Prepare IDE Prompt` |
| control plane | Mostly technical docs | Hide from primary UX; keep in architecture docs |
| orchestration | Technical diagnostics/doc language | Hide from compact surfaces; keep in advanced diagnostics/docs |
| runtime artifact | Maintenance command/docs language | Rename user-facing to `Run Artifacts` where shown |
| doctrine | Commands/docs for advanced governance | Keep concept but contextualize as advanced/project-rules feature |
| multi-agent | Execution mode command label/docs | Keep, but treat as advanced mode action |

## 6) Follow-up implementation issues mapped to #38–#44

### #38 — Audit and reduce sidebar/dashboard duplication
- **Objective:** inventory and remove duplicated actions/content between compact sidebar and rich dashboard.
- **Scope boundary:** `src/ui/sidebarHtml.ts`, `src/ui/panelHtml.ts`, `src/webview/dashboardHost.ts`, UX docs.
- **Acceptance criteria:** each user job has one primary home; compact sidebar retains only compact-run concerns.
- **Tests/evidence:** command-to-surface checklist, UI fixture updates, before/after screenshots.
- **Stop condition:** duplication matrix is resolved and documented.

### #39 — Implement first-run and no-PRD readiness flow
- **Objective:** ship deterministic setup routing for clean workspace, missing/default PRD, missing tasks, missing provider/auth, blocked preflight, and ready states.
- **Scope boundary:** gating and UX messaging only; no provider execution redesign.
- **Likely files:** `src/commands/registerCommands.ts`, `src/ui/sidebarHtml.ts`, `src/ui/panelHtml.ts`, `src/webview/dashboardHost.ts`.
- **Acceptance criteria:** run-entry commands block with explicit reason + setup CTA when not ready.
- **Tests/evidence:** command-shell smoke tests and state-fixture coverage for each readiness branch.
- **Stop condition:** no ambiguous first-run/no-PRD behavior remains.

### #40 — Regroup settings by user intent
- **Objective:** present settings by user intent groups (Provider, Model/Reasoning, Run Behaviour, Prompt/Memory, Security/Approvals, Paths/Artifacts, Advanced Internals).
- **Scope boundary:** keep existing setting keys for compatibility; regroup labels and docs only.
- **Likely files:** `package.json`, `src/config/settingsSurface.ts`, README/docs settings sections.
- **Acceptance criteria:** intent-grouped settings are visible in UI/docs and mapped to existing keys.
- **Tests/evidence:** settings-surface snapshots + docs checks.
- **Stop condition:** operators can locate key settings without module-level knowledge.

### #41 — Remove stale or misleading UI language
- **Objective:** replace or hide stale user-facing terms (pipeline, dead-letter, prepare prompt, orchestration jargon where unnecessary).
- **Scope boundary:** user-facing labels/tooltips/messages/docs only; internal IDs/artifact schemas unchanged.
- **Likely files:** `package.json`, `src/ui/*.ts`, `src/commands/registerCommands.ts`, README/docs.
- **Acceptance criteria:** language table decisions are fully applied with approved replacements.
- **Tests/evidence:** deterministic string audit + UI screenshots.
- **Stop condition:** compact surfaces and primary actions use clear operator language.

### #42 — Create UI state fixture catalogue
- **Objective:** codify canonical UI states (empty/setup, blocked, running, failure, recovery, ready, advanced diagnostics) as reusable fixtures.
- **Scope boundary:** test fixtures and documentation that define state contracts; no visual redesign required.
- **Likely files:** `test/ui/*`, `test/webview/*`, docs UX/state catalogue.
- **Acceptance criteria:** fixture catalogue exists and is referenced by UI tests.
- **Tests/evidence:** fixture-driven snapshot coverage for sidebar and dashboard states.
- **Stop condition:** future UI changes must map to named fixtures.

### #43 — Add screenshot and evidence requirements for UI changes
- **Objective:** require repeatable screenshot/evidence artifacts for every perceptible UI change.
- **Scope boundary:** contribution/testing docs, PR checklist rules, and automation hooks where practical.
- **Likely files:** `docs/testing.md`, contributor docs, CI/check scripts as needed.
- **Acceptance criteria:** PR guidance explicitly requires screenshots mapped to fixture states.
- **Tests/evidence:** docs checks and at least one validated example path.
- **Stop condition:** UI PRs cannot merge without visual evidence requirements satisfied.

### #44 — Add visual and accessibility test harness for webview UI
- **Objective:** establish automated visual regression + accessibility checks for sidebar/dashboard webviews.
- **Scope boundary:** test harness, fixtures, and CI wiring; minimal production UI logic changes only as needed for testability.
- **Likely files:** `test/ui/*`, `test/webview/*`, test scripts, docs/testing updates.
- **Acceptance criteria:** harness runs in CI and checks representative fixture states for visual drift and baseline accessibility issues.
- **Tests/evidence:** passing automated harness output + documented local run command.
- **Stop condition:** webview UI changes are constrained by automated evidence, not manual inspection alone.

## Evidence-harness priority note

Issues **#42–#44 are not optional polish**. They are the evidence harness that constrains future UI changes and makes UX iterations safe, reviewable, and regression-resistant.
