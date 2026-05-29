# Changelog

All notable changes to Ralphdex are documented here.

## [1.2.0] — 2026-05-29

A quality-first release: stronger fundamentals, a clearer first-run and operator flow, and a large internal cleanup. No breaking changes to commands, settings, or workspace state.

### Added

- **Getting Started walkthrough** — a VS Code "Get started with Ralphdex" walkthrough guides new operators through creating a PRD, confirming their provider, running a first iteration, and reading the dashboard.
- **Humanized stop reasons** — the status report and dashboard now show a plain-language label, explanation, and "what to do next" for every loop stop reason instead of raw enum values.

### Changed

- **Calmer command palette** — 16 niche/diagnostic commands (the "Open Latest …" artifact openers, doctrine sub-views and proposal commands, and redundant dashboard aliases) are hidden from the command palette. They remain fully available from the dashboard and programmatically; recovery commands stay visible.
- **Trustworthy docs and PRD** — `.ralph/prd.md` now leads with a live "Current scope" section over an archived history; stale operator-mode-preset references were removed from operator-facing docs; AGENTS.md command labels are corrected and now locked against drift by `check:docs`.

### Removed

- **Duplicate dashboard renderer** — removed the legacy string-template dashboard/sidebar fallback (`panelHtml.ts`/`sidebarHtml.ts`) and the unused `UXrefresh/` prototype (~10,500 lines). The React UI under `src/webview-ui/` is the single renderer; if its bundle is ever missing, a small static "UI failed to load" page is shown.

### Internal

- Build hygiene: added `.gitattributes` (LF normalization) and a CI guard that fails if committed `out/` build output drifts from source.
- Refactors (behaviour-preserving, snapshot/test-guarded): extracted the source-location JSON locator from `taskFile.ts`, the role-aware context-section builders from `promptBuilder.ts`, and the pre-execution planning gate from `iterationEngine.ts` (restoring it to a thin orchestrator). Added direct unit tests for the reconciliation gate pipeline and the new modules.

## [1.1.9] — 2026-05-19

### Changed

- Bumped release metadata to `1.1.9` in package manifests as part of the prior release alignment pass.
- Updated completion-report documentation to require `requestedStatus` values of `done`, `blocked`, or `in_progress`.
- Clarified prompt/completion guidance to avoid non-contract values such as `completed`.

## [1.1.8] — 2026-05-18

### Changed

- Enhanced Azure Foundry provider execution with endpoint configuration validation before run attempts.
- Improved project-generation error handling to surface provider-specific failures instead of generic exit codes.
- Added direct execution support for providers that do not require spawning a CLI process.
- Hardened Windows process execution for spaced command arguments.
- Improved PRD wizard UX with optimistic step-navigation state updates.
- Added regression coverage for the new provider/runtime behaviors.

## [1.1.7] — 2026-05-15

### Changed

- Added `reconcileDashboardTabIntent` to centralize dashboard tab-intent reconciliation and improve active-tab state transitions.
- Updated the dashboard shell flow to apply intent reconciliation with previous-intent tracking for more stable tab persistence behavior.
- Expanded coverage for tab-intent reconciliation behavior across the updated dashboard state transitions.

## [1.1.6] — 2026-05-14

### Fixed

- Fixed the settings update bug so dashboard-driven settings changes persist and refresh correctly in the UI.

## [1.1.5] — 2026-05-14

### Changed

- Upgraded the Ralphdex UI with the latest React webview dashboard/sidebar improvements, including refined information architecture and diagnostics/doctrine visibility behavior.

## [1.1.4] — 2026-05-06

### Changed

- Refactored command titles and descriptions for clarity across the extension.
- Updated Node.js version requirement to 22 in package files.
- Added UI fixture harness, evidence checklist, and dogfood report script for operator diagnostics.
- Allowed empty `reasoningEffort` to omit the explicit flag in Codex and Copilot CLI providers.

## [1.1.3] — 2026-05-06

### Added

- Added explicit doctrine-pack scaffold and repair command for established Ralph workspaces.
- Surfaced doctrine-repair guidance in status output and dashboard flows when doctrine is missing or incomplete.
- Implemented doctrine proposal application logic with test coverage.
- Added command to open the latest doctrine proposal.
- Implemented baseline offline evaluation harness fixtures.

### Changed

- Set extension config defaults to agentic values.
- Enhanced model tiering configuration and reasoning-effort handling.
- Enhanced workspace change detection to reduce spurious loop interruptions.

## [1.1.2] — 2026-04-27

### Changed

- Prepared the next Marketplace release by incrementing the extension version and refreshing release notes without publishing.

## [1.1.1] — 2026-04-25

### Changed

- Patch Marketplace release increment for republishing Ralphdex.

## [1.1.0] — 2026-04-25

### Changed

- Minor Marketplace release increment to republish the current Ralphdex extension package.

## [0.3.1] — 2026-04-24

### Changed

- Maintenance release for Marketplace republish and release-metadata alignment.

## [0.3.0] — 2026-04-16

### Added

- **Orchestration graph execution engine** — durable, file-backed multi-agent task graph with explicit handoff lifecycle; `OrchestrationSupervisor` node supervises graph execution across distributed agent boundaries with structured state transitions.
- **Handoff contracts** — typed inter-agent message envelopes with role-policy enforcement; explicit message versioning and sender/receiver role binding; `HandoffEnvelope` contract enforced at graph edges.
- **Role-based context isolation topology** — agent roles (implementer, planner, reviewer, build, watchdog, scm) with context-aware visibility policies; role-specific prompt sections and isolated state snapshots per role.
- **Fan-out / fan-in parallelism with gate semantics** — parallel child-task execution with fan-in synchronization gates; gate status exposed in dashboards and JSON status snapshots; role policies control gate advancement.
- **Bounded adaptive re-planning node** — orchestration re-planner responds to repeated failures with decision artifacts; re-plan cap prevents runaway loops; `replanDecisionPath` artifacts track plan mutations.
- **Human choke points for high-risk mutations** (Phase 5) — three gated policy categories (`scope_expansion`, `dependency_rewiring`, `contested_fan_in_scm`) in `orchestrationSupervisor.ts`, configurable via `pipelineHumanGates` setting; gate artifacts written to `.ralph/artifacts/` and cleared via `approveHumanReview` command.

## [0.2.0] — 2026-04-14

### Added

- **Azure Foundry provider** — direct HTTPS execution bypassing child-process spawn; API key and Azure AD (DefaultAzureCredential) authentication with preflight validation; missing config settings wired through `package.json` contributions.
- **Copilot Foundry CLI provider** — provider-agnostic Copilot CLI path with configurable `maxAutopilotContinues`.
- **Model tiering** — enabled by default; structural task signals replace title-word-count heuristic in `complexityScorer.ts`; operator documentation included.
- **Prompt caching** — static prefix stabilised in `promptBuilder.ts`; `cache_control` breakpoints added for direct-API providers.
- **Intelligent failure recovery** (5 phases) — `FailureCategoryId` taxonomy and diagnostic-pass artifact; recovery orchestrator with playbook dispatch; dead-letter queue and requeue command; failure-chain detection and systemic alert; observability, configuration, and documentation.
- **Webview UI** (full contract across 4 phases) — `WebviewPanelManager`, `MessageBridge`, activity bar, and shared styles; durable status snapshots backing the dashboard; cost-ticker observability from provenance and execution artifacts; pipeline, agent, task, and failure sections; `showDashboard` command; tabbed dashboard layout; settings panel with inline config testing and new-setting discovery; structured task view over durable tasks, plans, and dead-letter state; failure-detail notifications and focused diagnosis panel.
- **PRD Creation Wizard** — skeleton; intake steps for project-type, objective, and constraints; editable generate step with regenerate support; task review cards with full operator editing; configuration selection and confirm-time application.
- **Shared task-creation pipeline** — canonical normalised-task contract and field-presence rules; shared task-normalization and augmentation pipeline routing all task producers (PRD generation, wizard, decomposition, remediation, Add Task, Initialize Workspace).
- **Developer-loop shim** — `IVSCodeHost` abstraction layer; stdout-backed host and `.ralph-config.json` config reader; shim entry point verified end-to-end against a minimal workspace.
- **Recommended skills** — surfaced in Show Status output and the webview dashboard; `Construct Recommended Skills` command added.
- **Provider-agnostic memory summarization** (`T115`).
- **Full end-to-end pipeline smoke test** — real temp-workspace execution covering all pipeline phases; deterministic fixture hooks for review and SCM phases.
- **VS Code Marketplace readiness** — icon, keywords, gallery banner, `README` installation and configuration sections, `vsce publish --dry-run` validation path, deterministic doc-rule guards preventing drift.
- **Documentation and operator-trust reconciliation** — `docs/release-workflow.md`, `docs/boundaries.md`, `docs/multi-agent-readiness.md`, and aligned operator docs.

### Changed

- Brand renamed from "Ralph Codex" to **Ralphdex** across all user-visible surfaces.
- Repo layout flattened — extension source moved to root.
- Configuration migrated to `.vscode/settings.json`; `readConfig.ts` simplified; scoped `config.inspect` used throughout.
- `complexityScorer.ts` signal set replaced with structural task signals (title word-count removed).
- `WebviewConfigSync` serialises config updates with resource-specific support.
- Task dependency checks streamlined; parent/child status handling hardened (done parent auto-reset to in_progress on decomposition).
- Reconciliation now accepts `done` when validation passes but `gitDiff` has no changes.

### Fixed

- `parentId` auto-corrected for todo tasks under done parents.
- Last assistant message correctly extracted from Copilot CLI JSONL output.
- `createCliProvider` exported from `providerFactory.ts` for reuse in `projectGenerator.ts`.
- Model tiering `enabled:true` wired so tiering activates without flat-flag inspection.

## [0.1.0] — 2026-04-03

### Added

- File-backed Ralph task loop with durable `.ralph/` workspace state — sessions resume without chat history.
- `codex exec`, Claude CLI (`claude -p`), and GitHub Copilot CLI execution strategies.
- Clipboard + VS Code command IDE handoff for prompt delivery.
- Structured completion-report contract: every iteration returns a fenced JSON block that Ralph reconciles into task state.
- Preflight diagnostics — blocks execution on ledger drift, stale claims, or missing runtime preconditions.
- Multi-verifier post-iteration assessment: `validationCommand`, `gitDiff`, `taskState`.
- Loop stop logic: no-progress threshold, repeated-failure threshold, human-review gate.
- Artifact store with configurable retention and latest-pointer protection.
- Provenance bundles: prompt evidence, transcript, iteration summary, and git snapshots per run.
- Task decomposition: bounded child-task proposals and auto-remediation (`decompose_task`, `mark_blocked`).
- Review-agent and watchdog-agent roles.
- SCM automation: `commit-on-done` and `branch-per-task` strategies with optional `gh` PR creation.
- Pipeline orchestration: PRD-fragment intake → decomposition → agent loop → review → SCM/PR → human-review gate.
- Model tiering hooks in `complexityScorer.ts` (disabled by default, opt-in via config).
- Operator-facing commands: Prepare Prompt, Run CLI Iteration, Run CLI Loop, Run Multi-Agent Loop, Show Status, Open Latest artifacts, Resolve Stale Claim, Run Pipeline, Approve Human Review, Resume Pipeline.
