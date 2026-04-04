# Product / project brief

## Objective

Build Ralph into a durable, file-backed multi-agent delivery framework that can move a repository from requirements analysis through implementation, testing, and orchestration without depending on chat memory.

## Product direction

Ralph should let an operator define the work once in `.ralph/`, then execute repeatable Codex-driven iterations that stay inspectable across fresh sessions. The framework needs to strengthen both the quality of agent work and the control plane around it, so each step is deterministic, resumable, and supported by durable evidence.

## Core outcomes

- Turn requirements, progress, and task state into the shared source of truth for all agent activity.
- Support end-to-end delivery flow across requirements analysis, implementation, validation, and orchestration.
- Harden execution with explicit prompts, verifier output, provenance artifacts, and clear stop reasons.
- Keep the architecture thin and repository-backed so operators can audit, resume, and refine work without hidden state.

### Immediate control-plane priority

Before expanding Ralph into broader multi-agent orchestration, harden nested-repo semantics so the system can deterministically answer:

- which root was inspected
- which root was selected as the likely repo
- which root was used for CLI execution
- which root was used for verifier and validation commands
- whether those roots were selected automatically or by explicit override

The system must persist this clearly in prompt evidence, execution plans, provenance bundles, and status surfaces.

### Design intent

Ralph should support multi-repo or umbrella workspaces safely, but remain shallow and deterministic:
- inspect workspace root and immediate child repos only unless explicitly overridden
- persist the chosen inspection root
- define a simple execution-root policy
- allow explicit inspection-root override when ambiguity exists
- keep CLI/provenance trust stronger than IDE-prepared-only handoff

### Nested-repo control-plane milestone — satisfied 2026-03-17

The nested-repo control-plane work that previously blocked multi-agent expansion is complete:

- Chosen inspection, execution, and verifier roots are persisted in prompt evidence, execution plans, provenance bundles, and status surfaces.
- Explicit `ralphCodex.inspectionRootOverride` escape hatch is available for ambiguous umbrella workspaces.
- Root-selection behaviour is covered by regression tests and documented in `docs/` and `AGENTS.md`.

The multi-agent deferral was formally lifted when all three acceptance criteria in `docs/multi-agent-readiness.md` were satisfied:
- Task Ownership: atomic claim acquisition in `taskFile.ts` backed by `.ralph/claims.json`, with preflight stale/contested reporting and reconciliation gating.
- Write Serialisation: `withTaskFileLock` wraps every `tasks.json` mutation path; concurrent-write contention is deterministic.
- Remediation Isolation: `agentId` is a field on `RalphIterationResult`; `countTrailingSameTaskClassifications` is scoped per agent.

### Next delivery horizon — satisfied 2026-04-02

All three pillars of the delivery horizon defined after the nested-repo control-plane milestone are now shipped:

**1. Parallel multi-agent loop execution** (T58–T59, completed)

The claim/lock/agentId infrastructure drives concurrent loops. A multi-agent launcher assigns non-overlapping task subsets via the claim mechanism. Preflight and Show Status aggregate health across all active agents.

**2. Operator-facing multi-agent health dashboard** (T60–T62, completed)

`Show Multi-Agent Status` renders per-agent iteration history, claim state, and last-stop reason. Watchdog alerts are surfaced as durable diagnostic artifacts. Stale-claim and repeated-no-progress heatmap lets operators spot stuck agents without reading individual transcripts.

**3. End-to-end delivery pipeline automation** (T63–T66, completed)

`Run Pipeline` (`ralphCodex.runPipeline`) accepts a PRD fragment, decomposes it into tasks, runs the agent loop, opens a review-agent pass, and submits a PR from a single operator invocation. Durable pipeline-run provenance links PRD input → task graph snapshot → iteration history → PR URL. `Show Status` surfaces the latest pipeline run. `Open Latest Pipeline Run` (`ralphCodex.openLatestPipelineRun`) opens the run artifact directly. Configurable human-review gates (`ralphCodex.approveHumanReview`, controlled by `ralphCodex.pipelineHumanGates`) pause the pipeline and resume on operator approval.

### Next delivery horizon

With the three-pillar horizon satisfied, the following capabilities are the concrete next targets, listed in priority order.

**0. VS Code Marketplace readiness** *(highest priority — unlocks all downstream value)*

Ralph cannot deliver value to users who cannot install it. Before expanding features, the extension must be publishable to the VS Code Marketplace. Concrete work:
- Verify and complete required Marketplace metadata: publisher ID, `displayName`, `description`, `categories`, `keywords`, `icon`.
- Ensure `README.md` meets Marketplace standards: installation steps, configuration reference, screenshot or demo.
- Add `CHANGELOG.md` with an initial release entry.
- Confirm `LICENSE` is present and correctly identified in `package.json`.
- Validate end-to-end with `vsce publish --dry-run` and resolve all blocking warnings.
- Document the release workflow (version bump → `vsce publish` → tag) in `docs/`.

**1. Developer-loop shim: run the Ralph iteration engine without a VS Code host**

This is explicitly **not** a full operator CLI (see deferral below). It is a narrow Node.js entry point that boots the core iteration engine (`iterationEngine.ts` and its dependencies) against a workspace on disk, bypassing the VS Code extension host entirely. Purpose: enable Ralph to be run from a Claude Code session or any Node.js-capable environment, primarily to support self-hosting — using Ralph to develop Ralph — without requiring VS Code to be open. Scope constraints:
- Reads config from a `.ralph-config.json` file or environment variables — no `vscode.WorkspaceConfiguration`.
- Replaces `vscode.OutputChannel` logger with stdout.
- Replaces `vscode.Progress` with no-op or stdout progress lines.
- No dashboard, sidebar, or status bar — text output only.
- No new UX surface, no new configuration schema beyond what the extension already supports.
- The shim is a development/self-hosting tool, not a supported operator-facing product. It is not published to npm and is not advertised to end users.

**2. Pipeline resilience: resume and crash-recovery**

The pipeline currently runs to completion or fails terminally. The next step is making it restartable from the last known-good phase so transient failures (network, CLI timeout, lock contention) do not require a full re-run. Concrete work:
- A durable pipeline-run state file (`.ralph/pipeline-run.json`) that records the completed phase, artifact hashes, and resume cursor.
- A `resumePipeline` command that reads the run state, validates phase integrity, and continues from the interruption point.
- Preflight diagnostics that detect an in-progress but stale pipeline run and surface it as a warning.

**3. Real end-to-end pipeline smoke test in a temporary workspace**

Current pipeline tests use mocked phases. Concrete work:
- A `test:e2e-pipeline` script that creates a fresh temp workspace, seeds a minimal `.ralph/` layout, runs `runPipeline` through a real Claude CLI invocation, and asserts that a PR URL artifact exists.
- Guard the test behind an environment flag so it is opt-in in CI but runnable locally.

**4. Model tiering: improve scoring signals and enable by default**

The complexity scorer (`complexityScorer.ts`) and per-tier model routing are implemented but disabled by default and unvalidated. The current scoring signals are crude (title word count as a complexity proxy is unreliable). Concrete work:
- Replace or supplement weak signals (title word count) with more reliable ones: presence of a `validation` field, number of child tasks, whether the task has a known blocker note.
- Calibrate thresholds against real workload data — run the scorer against the completed task history and verify that tier assignments match intuition.
- Enable tiering by default with conservative thresholds: simple tasks (score 0–1) route to Haiku, everything else routes to Sonnet, Opus reserved for score ≥6.
- Add operator-facing documentation covering what signals drive each tier, how to override, and what cost savings to expect.
- Note: per-provider routing (e.g. Copilot for simple, Claude for complex) is already wired and should be documented but not enabled by default until validated.

**5. AI-driven project and PRD generation**

A full implementation plan exists in `docs/superpowers/plans/2026-04-01-ai-project-generation.md`. When a user enters a project objective during `initializeWorkspace` or `newProject`, invoke the configured CLI provider to generate a full draft PRD and reasoned task list before opening the files. Fallback to the existing static template on any CLI failure.

**6. Construct skills and agents specific to repo/project/prd**
First action: rewrite this section of the PRD for clarity deliverability.
Description: Ralph lifecycle when running should determine what skills/agents are available in the project, what would be useful for the delivery of that project (be it by ralph improving that project or the project it.self running and operating if it is agentic in nature)

**99. Operator CLI — deferred, out of scope (future fork)**

A standalone full-featured CLI for headless/CI operator use has been explicitly deferred. It is not a next target for the VS Code extension and must not be introduced as backlog work. Rationale: the extension already drives the `cliExec` strategy which shells out to the `claude` CLI — CI use is already achievable by installing the Claude CLI in the runner environment. A dedicated `ralph-cli` would require a parallel host, config system, and UX contract that would split maintenance effort with no gain for users who work inside VS Code. The developer-loop shim (item 1 above) covers the self-hosting use case without becoming a full product. If a full operator CLI becomes warranted, it will be a separate project fork, not an extension feature.

### Design principles and scope boundaries

**Engineering quality over UI polish.** Dashboard, sidebar, and status bar improvements are secondary to loop correctness, test coverage, and cost efficiency. New UI surface should only be added when it directly supports operator debugging or safety — not for aesthetics.

**Cost efficiency is a first-class concern.** The model tiering system exists specifically to avoid paying Opus prices for simple tasks. Any new feature that adds iteration overhead (extra prompt sections, additional agent passes, richer context assembly) must justify its cost impact. The prompt budget policy exists for this reason and must be respected.

**Self-hosting is the development model.** Once the developer-loop shim exists, Ralph should be used to develop Ralph. Tasks generated by Ralph's own backlog replenishment prompt, executed by Ralph's own iteration engine, reconciled by Ralph's own completion-report parser. This creates a continuous validation loop and surfaces quality issues in the tool itself.