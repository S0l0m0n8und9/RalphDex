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

**6. Recommend and construct project-specific skills/agents from generated PRDs**

Ralph should analyze generated PRDs and task lists to recommend skills and agents that would accelerate delivery of that specific project, then offer operators a single action to construct and wire those skills/agents. Concrete work:

- **Phase 1 (current):** Extend the PRD generation prompt (T74) to include a structured `recommendedSkills` section in the JSON response that lists skill names, brief descriptions, and rationale based on project type and task list.
- **Phase 2 (future):** Persist recommended skills to a `.ralph/recommended-skills.json` artifact and surface them in the status output.
- **Phase 3 (future):** Add a command `Ralph Codex: Construct Recommended Skills` that invokes the skill-creator skill for each recommended skill, validates the result, and wires it into the project configuration.

Scope boundaries:
- Recommendations are driven by explicit project type signals in the PRD (web app, library, CLI tool, service, data pipeline, etc.) — not inferred heuristically.
- Only recommend skills that have clear, documented templates in the skill-creator skill. Do not invent new skill types.
- Operators retain full control: recommendations are advisory, not automatic. No skills are constructed or enabled without explicit operator approval.
- Ralph's own recommended skills (for Ralph development) will be the first real-world test of this capability.

Acceptance criteria for Phase 1:
- PRD generation prompt (in T74 or a successor task) produces a `recommendedSkills` array in the JSON fence with at least `{name, description, rationale}` fields.
- parseGenerationResponse (in projectGenerator.ts) extracts and validates `recommendedSkills` without breaking on missing/empty array.
- Unit tests cover at least the happy path (valid recommendations) and the error case (missing field).
- npm run validate passes.

**7. Prompt caching: structure prompts for maximum cache reuse**

Ralph's iterative loop sends a large prompt on every iteration, and a significant portion of that prompt — system instructions, project conventions, completion report contract, and persona framing — is identical between iterations. Structuring the prompt so this static prefix is byte-for-byte stable unlocks automatic prompt caching on both Anthropic and OpenAI backends, yielding faster time-to-first-token and (on API billing) up to 90% cost reduction on cached input tokens. Concrete work:

- **Phase 1 — Prompt prefix stabilisation.** Audit `promptBuilder.ts` to ensure all static content (system prompt, persona, project conventions, completion report instructions) is assembled first as a contiguous prefix, before any per-iteration dynamic content (task focus, file context, iteration history). Add a snapshot test that asserts the static prefix is identical across two consecutive prompt builds with different task inputs.
- **Phase 2 — Explicit cache-control markers (API strategy only).** For providers that call the Anthropic Messages API directly (or OpenAI's equivalent), insert `cache_control` breakpoints at the boundary between the static prefix and dynamic content in the provider implementation. This is only applicable when Ralph calls an API directly — CLI-based strategies (`claude -p`, `codex exec`) rely on implicit caching and require no change.
- **Phase 3 — Observability.** Surface cache-hit metrics in the iteration result or provenance bundle so operators can verify caching is effective. At minimum, log the static-prefix token count and whether the provider reported a cache hit. Add a `promptCacheStats` field to the provenance artifact.
- **Phase 4 — Configuration.** Add a `ralphCodex.promptCaching` config setting (default: `auto`) with values `auto` (use caching when the provider supports it), `force` (error if caching is unavailable), and `off`. Document the setting and its cost implications.

Scope boundaries:
- Prompt caching is a pure backend optimisation. It must not change the semantic content of any prompt.
- CLI-based strategies benefit from implicit caching with no code changes beyond prefix stabilisation (Phase 1). Explicit cache-control (Phase 2) only applies to direct API strategies.
- Subscription-based billing (Claude Pro/Max, Codex subscription) does not benefit from cost reduction — only latency. Documentation must make this distinction clear so operators can decide whether to pursue API billing.

Acceptance criteria for Phase 1:
- `promptBuilder.ts` assembles all static sections before all dynamic sections, with a clear code boundary.
- A snapshot test proves the static prefix is byte-identical across builds with different task inputs.
- `npm run validate` passes.

**8. Azure Foundry provider: direct API execution strategy**

Ralph currently supports three CLI-based providers (Claude, Copilot, Codex) that all shell out to an external CLI binary. An Azure Foundry provider would add a fourth provider that calls an Azure AI Foundry API endpoint directly over HTTPS, enabling operators to use Azure-hosted models (including Claude, GPT, Llama, Mistral, and other models deployed through Azure AI Foundry) with enterprise governance, private networking, and Azure RBAC. Concrete work:

- **Phase 1 — Provider implementation.** Add `src/codex/azureFoundryProvider.ts` implementing the `CliProvider` interface. Despite the interface name, this provider calls the Azure Foundry inference endpoint directly via `https` (Node.js built-in) or a lightweight HTTP client rather than shelling out to a CLI. It must:
  - Call the Azure AI Foundry `/chat/completions` or `/models/chat/completions` endpoint using the configured deployment URL and API key (or Azure AD token).
  - Stream the response and extract the assistant message text for `extractResponseText`.
  - Map Azure API error codes to Ralph-understandable error descriptions in `describeLaunchError` and `summarizeResult`.
  - Register as provider ID `'azure-foundry'` in the `CliProviderId` union type.

- **Phase 2 — Configuration.** Add the following config settings:
  - `ralphCodex.azureFoundryEndpoint` (string) — the full deployment endpoint URL (e.g. `https://<resource>.services.ai.azure.com/models/chat/completions`).
  - `ralphCodex.azureFoundryApiKey` (string, optional) — API key for authentication. If omitted, the provider attempts Azure AD / Managed Identity token acquisition via `@azure/identity`.
  - `ralphCodex.azureFoundryModelDeployment` (string, optional) — the specific model deployment name, if the endpoint requires it.
  - `ralphCodex.azureFoundryApiVersion` (string, default: `'2024-12-01-preview'`) — Azure API version to use.
  - Add `'azure-foundry'` as a valid value for `ralphCodex.cliProvider` and as a routable provider in `modelTiering` tier configs.

- **Phase 3 — Factory and strategy integration.** Wire the new provider into `providerFactory.ts` and `CodexStrategyRegistry` so that:
  - `createCliProviderForId('azure-foundry', config)` returns the Azure Foundry provider.
  - The `cliExec` strategy works with the new provider (the provider builds and manages its own HTTP call rather than a child process, but conforms to the same `CliLaunchSpec` / `CodexExecResult` contract).
  - Model tiering can route specific complexity tiers to Azure Foundry (e.g. simple tasks to an Azure-hosted Haiku deployment, complex tasks to Claude direct).

- **Phase 4 — Authentication and security.** Implement two auth paths:
  - **API key**: read from config, passed as `api-key` header. The key must not be logged, included in provenance artifacts, or echoed to output channels.
  - **Azure AD / Managed Identity**: use `@azure/identity` `DefaultAzureCredential` to acquire a bearer token. This enables keyless operation in Azure-hosted environments and aligns with enterprise security requirements.
  - Preflight diagnostics must validate that the endpoint is reachable and the credential is valid before the first iteration.

- **Phase 5 — Prompt caching synergy.** Azure Foundry endpoints that support prompt caching (Azure OpenAI deployments) will benefit from the prompt prefix stabilisation work in feature 7. Document which Azure-hosted models support prompt caching and how operators can verify cache hits via Azure Monitor metrics.

Scope boundaries:
- This is a provider, not a new execution strategy. It reuses the `cliExec` strategy machinery but replaces the child-process spawn with an HTTP call.
- The provider targets the Azure AI Foundry inference API only. It does not manage Azure resources, deploy models, or interact with Azure Foundry project management APIs.
- No new VS Code UI surfaces. Provider selection is via the existing `ralphCodex.cliProvider` setting.
- The `@azure/identity` dependency is optional — if the operator provides an API key, no Azure SDK is required at runtime.

Acceptance criteria for Phase 1:
- `azureFoundryProvider.ts` implements `CliProvider` interface and is importable without errors.
- `'azure-foundry'` is a valid `CliProviderId` value.
- Unit tests mock the HTTP endpoint and verify `buildLaunchSpec`, `extractResponseText`, and `describeLaunchError`.
- `npm run validate` passes.

**99. Operator CLI — deferred, out of scope (future fork)**

A standalone full-featured CLI for headless/CI operator use has been explicitly deferred. It is not a next target for the VS Code extension and must not be introduced as backlog work. Rationale: the extension already drives the `cliExec` strategy which shells out to the `claude` CLI — CI use is already achievable by installing the Claude CLI in the runner environment. A dedicated `ralph-cli` would require a parallel host, config system, and UX contract that would split maintenance effort with no gain for users who work inside VS Code. The developer-loop shim (item 1 above) covers the self-hosting use case without becoming a full product. If a full operator CLI becomes warranted, it will be a separate project fork, not an extension feature.

### Design principles and scope boundaries

**Brand name: Ralphdex.** All user-visible strings — command palette labels, display names, notifications, status messages, README, CHANGELOG, and Marketplace metadata — must use "Ralphdex" as the product name. References to "Ralph Codex", "ralph-codex", "Ralph codex", or similar variants must not appear in any surface the end user can see. Internal identifiers (command IDs such as `ralphCodex.*`, config keys, file/directory names like `.ralph/`) are exempt and may retain their current form to avoid breaking changes.

**Engineering quality over UI polish.** Dashboard, sidebar, and status bar improvements are secondary to loop correctness, test coverage, and cost efficiency. New UI surface should only be added when it directly supports operator debugging or safety — not for aesthetics.

**Cost efficiency is a first-class concern.** The model tiering system exists specifically to avoid paying Opus prices for simple tasks. Any new feature that adds iteration overhead (extra prompt sections, additional agent passes, richer context assembly) must justify its cost impact. The prompt budget policy exists for this reason and must be respected.

**Self-hosting is the development model.** Once the developer-loop shim exists, Ralph should be used to develop Ralph. Tasks generated by Ralph's own backlog replenishment prompt, executed by Ralph's own iteration engine, reconciled by Ralph's own completion-report parser. This creates a continuous validation loop and surfaces quality issues in the tool itself.