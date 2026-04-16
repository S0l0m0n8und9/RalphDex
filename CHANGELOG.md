# Changelog

All notable changes to Ralphdex are documented here.

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
