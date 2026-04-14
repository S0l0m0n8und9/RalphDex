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

### Next delivery horizon — satisfied 2026-04-14

All 15 items of the delivery horizon defined after the three-pillar milestone are now shipped as of 2026-04-14. Key deliveries:

**0–3. Marketplace readiness, developer-loop shim, pipeline resilience, and e2e smoke test** (completed)

The extension is publishable to the VS Code Marketplace with complete metadata, README, CHANGELOG, LICENSE, and release workflow documentation. A Node.js shim boots the core iteration engine without a VS Code host, enabling self-hosted development. Pipeline runs survive transient failures and resume from the last known-good phase via durable `pipeline-run.json`. `test:e2e-pipeline` validates the full phase chain in a temp workspace.

**4–9. Model tiering, AI PRD generation, recommended skills, prompt caching, Azure Foundry provider, and static task tier** (completed)

Complexity scoring uses reliable signals (`validation` field, child count, blocker note) calibrated against real workload history. Claude-backed PRD generation and `Ralphdex: Construct Recommended Skills` are wired. Prompt prefix stabilisation enables cache reuse across iterations. `azureFoundryProvider.ts` routes iterations through Azure-hosted models via HTTPS. Optional `tier` field on task nodes overrides runtime scoring and is surfaced in `Show Status`.

**10–14. Agent memory, operator presets, PRD improvements, dynamic planning, and failure recovery** (completed)

Configurable `memoryStrategy` (`verbatim`, `sliding-window`, `summary`) with provider-aware summarisation routing. Operator mode presets (`simple`, `multi-agent`, `hardcore`) reduce configuration friction. PRD generation enhancements include task count cap, `suggestedValidationCommand` pre-population, worked examples, and `Ralphdex: Regenerate PRD`. Role-based crew configuration, pre-execution planning pass, and role-specific prompt templates ship in item 13. Structured failure taxonomy, recovery orchestrator with per-category playbooks, dead-letter queue, and failure chain detection close item 14.

The full specification for each item, plus items 15–19 added to this horizon during execution, is preserved below for reference.

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
- **Phase 3 (future):** Add a command `Ralphdex: Construct Recommended Skills` that invokes the skill-creator skill for each recommended skill, validates the result, and wires it into the project configuration.

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

**9. Static task-complexity tier on the task graph (human-editable model routing)**

The runtime complexity scorer in `complexityScorer.ts` is deterministic and evidence-backed, but it can only read observable signals that exist after a task has been written and partially executed. Operators who plan a task graph in advance already possess the context the scorer is trying to infer: they know that a cross-cutting security refactor needs Opus, and that a one-line comment correction needs Haiku. Encoding that judgement as a first-class field on the task node makes model selection auditable, predictable, and correctable without touching the global tiering configuration.

Concrete work:

- **Phase 1 — Schema.** Add an optional `tier?: 'simple' | 'medium' | 'complex'` field to `RalphTask` in `src/ralph/types.ts`. The field is optional; tasks without it fall through to heuristic scoring as today.
- **Phase 2 — Short-circuit logic.** Update `selectModelForTask` in `complexityScorer.ts`: when `task.tier` is set, resolve it directly to the corresponding tier config without calling `scoreTaskComplexity`. Record `tier: 'explicit'` in the signals array so the provenance bundle shows that an operator override was active.
- **Phase 3 — Schema documentation.** Add `tier` to the task-schema reference in `AGENTS.md` with a note that it overrides runtime scoring. Include an example `tasks.json` fragment showing a task with `"tier": "complex"`.
- **Phase 4 — Status surfacing.** `Show Status` and `Show Multi-Agent Status` should display the effective tier next to each task label so operators can confirm their annotations are being respected. Distinguish visually between `explicit` (operator-set) and `scored` (heuristic) tier sources.

Scope boundaries:
- `tier` is advisory within the tiering system. If `modelTiering.enabled` is false, the field is silently ignored and the fallback model is used — no new config wiring required.
- The field does not gate execution or act as a lock. Any operator can remove or change it between iterations.
- Task decomposition (`taskDecomposition.ts`) must propagate `tier` from a parent task to generated child tasks only when the parent had an explicit value; heuristically-scored tiers must not be inherited.

Acceptance criteria:
- Unit test: task with `tier: 'complex'` selects the complex model config without invoking `scoreTaskComplexity`.
- Unit test: task without `tier` falls through to heuristic scoring as before.
- Unit test: `tier` field is ignored when `modelTiering.enabled` is false.
- `Show Status` output includes tier source label for each task.
- `npm run validate` passes.

**10. Agent memory management — structured context window strategy for long-running loops**

Ralph's prompt currently includes prior iteration history verbatim up to the `promptPriorContextBudget` token cap. On long-running projects this fills the context window with stale entries, leaving less room for current-task detail and repo context. LangChain's memory taxonomy names four strategies that trade fidelity for capacity: buffer (verbatim, current behaviour), sliding window (recent N entries only), summary (compressed old + verbatim recent), and semantic retrieval (embed and retrieve relevant entries). Ralph should support the first three as a configurable `memoryStrategy` setting, keeping the architecture dependency-free.

Concrete work:

- **Phase 1 — Config.** Add `memoryStrategy: 'verbatim' | 'sliding-window' | 'summary'` to `RalphCodexConfig` in `src/config/types.ts` with default `'verbatim'` (no behavioural regression). Add `memoryWindowSize: number` (default 10) for the sliding-window entry count. Add `memorySummaryThreshold: number` (default 20) for the minimum history depth that triggers summarisation.
- **Phase 2 — Sliding window.** In `promptBuilder.ts`, when `memoryStrategy` is `'sliding-window'`, slice the iteration history array to the last `memoryWindowSize` entries before rendering the prior-context section. All other prompt sections are unaffected.
- **Phase 3 — Summary strategy.** When `memoryStrategy` is `'summary'` and history depth exceeds `memorySummaryThreshold`, invoke the configured CLI provider synchronously (before the main iteration prompt is sent) to produce a one-paragraph summary of entries older than the window. Persist the summary to `.ralph/memory-summary.md`. In subsequent iterations, include the persisted summary block plus the most recent `memoryWindowSize` entries verbatim — do not re-summarise unless new entries push depth above threshold again.
- **Phase 4 — Observability.** Add `memoryStrategy`, `historyDepth`, `windowedEntryCount`, and `summaryGenerationCost` fields to the provenance bundle so operators can audit what context was visible to each iteration.

Scope boundaries:
- Semantic / vector retrieval (LangChain's `VectorStoreRetrieverMemory`) is explicitly deferred. It requires a persistent embedding store and an external vector-search dependency that conflicts with Ralph's thin, dependency-free architecture. The summary strategy covers the long-tail capacity case without that cost.
- The summary invocation is synchronous and counted against the operator's token budget. Operators who enable `'summary'` should be aware of this cost; documentation must make it clear.
- `.ralph/memory-summary.md` is a durable artifact and follows the same commit policy as `.ralph/progress.md` (safe to commit alongside source).

Acceptance criteria:
- Unit test: `'sliding-window'` with `memoryWindowSize: 3` produces a prior-context section containing exactly the last 3 history entries.
- Snapshot test: the static prompt prefix is byte-identical across two `'sliding-window'` builds with different task inputs (confirming memory windowing does not bleed into the static prefix).
- Unit test: `'summary'` strategy below threshold behaves identically to `'verbatim'`.
- Unit test: `'summary'` above threshold reads from `.ralph/memory-summary.md` and appends recent verbatim entries.
- `npm run validate` passes.

**11. Operator mode presets — simple, multi-agent, and hardcore**

Ralph's configuration surface has grown to over 40 settings. Most operators do not need to tune every knob; they want a coherent starting posture that matches their risk tolerance and team size. A `ralphCodex.operatorMode` preset setting applies a named bundle of sub-settings in one declaration, giving operators a single lever to switch between a safe hands-on default, a parallel-execution profile, and a fully autonomous maximum-throughput mode.

Concrete work:

- **Phase 1 — Schema and package.json.** Add `operatorMode?: 'simple' | 'multi-agent' | 'hardcore'` to `RalphCodexConfig` in `src/config/types.ts` and to the `package.json` contribution point as a `settings.json` enum with descriptions. When absent, behaviour is identical to today (no regression).

- **Phase 2 — Preset resolution in `readConfig.ts`.** After reading raw VS Code config, if `operatorMode` is set, merge the preset's baseline values first, then overwrite with any individual `ralphCodex.*` settings the operator has explicitly set. Explicit individual settings always win. Preset values never overwrite explicit operator values.

  Preset definitions:
  - **`simple`**: `autonomyMode: 'supervised'`, `agentCount: 1`, `preferredHandoffMode: 'ideCommand'`, `modelTiering.enabled: false`, `ralphIterationCap: 20`, `stopOnHumanReviewNeeded: true`, `scmStrategy: 'none'`, `memoryStrategy: 'verbatim'`, `autoReplenishBacklog: false`, `pipelineHumanGates: true`.
  - **`multi-agent`**: `autonomyMode: 'autonomous'`, `agentCount: 3`, `preferredHandoffMode: 'cliExec'`, `modelTiering.enabled: true`, `scmStrategy: 'branch-per-task'`, `autoReplenishBacklog: true`, `autoReviewOnParentDone: true`, `memoryStrategy: 'sliding-window'`, `autoWatchdogOnStall: true`, `pipelineHumanGates: true`.
  - **`hardcore`**: all `multi-agent` values plus `autoApplyRemediation: ['decompose_task', 'mark_blocked']`, `pipelineHumanGates: false`, `modelTiering.complex.model: 'claude-opus-4-5'`, `ralphIterationCap: 100`, `autoWatchdogOnStall: true`, `memoryStrategy: 'summary'`.

- **Phase 3 — Status surfacing.** Include the active `operatorMode` label (and whether each setting is `preset` or `explicit`) in `Show Status` output.

- **Phase 4 — Documentation.** Add a preset reference table to `AGENTS.md` listing every setting each preset applies and its value, so operators can audit what they are enabling.

Scope boundaries:
- Presets are convenience defaults only. They do not enforce constraints or prevent operators from setting individual settings to any value. The system never rejects a config because it conflicts with the active preset.
- `operatorMode` has no runtime enforcement role. It is consumed once at config-read time and has no further influence on loop decisions.
- The `hardcore` preset name is intentional — it signals maximum autonomy and cost. Documentation must clearly state that it disables human-review gates and enables auto-remediation.

Acceptance criteria:
- Unit test: `operatorMode: 'simple'` with no individual overrides produces the expected preset values.
- Unit test: `operatorMode: 'multi-agent'` with `agentCount: 1` explicitly set — `agentCount` is 1 (explicit wins), all other preset values apply.
- Unit test: `operatorMode` absent — no preset values injected, existing defaults apply.
- `Show Status` output includes active mode and source labels.
- `npm run validate` passes.

**12. PRD creation process improvements**

The PRD generation flow in `projectGenerator.ts` was written before the task graph reached its current richness. Analysis of the aymenfurter/ralph reference implementation surfaces several concrete improvements: enforcing a maximum task count to prevent fragmentation, making the generation prompt operator-overridable, adding worked examples of good vs. bad task formulations, pre-populating `validation` commands from generation output (which directly boosts the complexity scorer's reliability), and enabling iterative PRD refinement rather than one-shot generation only.

Concrete work:

- **Phase 1 — Task count cap.** Add an explicit instruction to the generation prompt in `projectGenerator.ts` capping output at 5–8 tasks. Include rationale: too many tasks produces fragmented work items that repeat each other and overwhelm the prompt; fewer, larger tasks with clear acceptance criteria outperform many small ambiguous ones. Add a corresponding unit test asserting the parser rejects or warns on responses containing more than 8 tasks.

- **Phase 2 — Operator-overridable generation template.** Add `ralphCodex.prdGenerationTemplate` (string, default `''`) to `RalphCodexConfig`. When set, use the operator's string as the entire system prompt for generation, replacing the built-in template. Expose the setting in `package.json`. This mirrors the `customPrdGenerationTemplate` pattern in aymenfurter/ralph and lets teams encode domain-specific conventions (e.g., always include a database migration task, always specify a performance budget).

- **Phase 3 — Worked examples in the generation prompt.** Add a "Good vs. bad task formulation" section to the built-in generation prompt, contrasting:
  - Good: atomic, testable, outcome-focused ("Add rate-limiting middleware to the `/auth` routes with a 429 response and `Retry-After` header")
  - Bad: vague, overlapping, infrastructure-only ("Set up the backend", "Write tests", "Fix bugs")
  The examples should be drawn from the Ralphdex project itself so they feel authentic.

- **Phase 4 — `suggestedValidationCommand` in generation output.** Extend the structured JSON response from `projectGenerator.ts` to include an optional `suggestedValidationCommand` string per task. The parser in `parseGenerationResponse` should extract this and use it to pre-populate the task's `validation` field when the task is written to `tasks.json`. This directly feeds the complexity scorer's `has_validation_field` signal (+2 points) and improves tier assignment accuracy from the first iteration.

- **Phase 5 — `Ralphdex: Regenerate PRD` command.** Add a new VS Code command `ralphCodex.regeneratePrd` that re-runs PRD generation against the current `.ralph/prd.md` content, producing a refined version. The command should diff the proposed changes and open a VS Code diff editor for operator review before writing. This enables iterative PRD authorship rather than forcing operators to start from scratch when requirements evolve. Wire the command in `registerCommands.ts`.

Scope boundaries:
- The tasks.json structured format remains authoritative. The simpler markdown checkbox format used by aymenfurter/ralph (plain `- [ ]` lines) is not adopted — our typed task graph is more capable and the goal is better tooling to generate into it, not format regression.
- `ralphCodex.prdGenerationTemplate` overrides the entire system prompt. Documentation must warn operators that overriding it removes the worked examples and task-count cap unless they replicate those instructions themselves.
- The `regeneratePrd` command is operator-initiated only. Ralph's loop never triggers PRD regeneration autonomously during normal execution.
- `suggestedValidationCommand` values from generation are pre-populated but not enforced. Operators can edit or remove them from `tasks.json` before the loop starts.

Acceptance criteria:
- Unit test: generation parser rejects (or emits a warning artifact) when the response contains more than 8 tasks.
- Unit test: `parseGenerationResponse` extracts `suggestedValidationCommand` and maps it to the task's `validation` field.
- Unit test: `parseGenerationResponse` handles a missing `suggestedValidationCommand` without error.
- `ralphCodex.prdGenerationTemplate` config is wired; a unit test confirms it is passed through to the generation invocation.
- `ralphCodex.regeneratePrd` command is registered and triggers the generation flow; manual verification confirms the diff editor opens.
- `npm run validate` passes.

**13. Dynamic planning layer — agent roles, crew configuration, and pre-execution planning pass**

Ralph runs multiple parallel builder agents today, but every agent shares the same identity: all are implementers, all use the same prompt template, all compete for the same tasks. Borrowing the role-based crew model from CrewAI and the planning-pass discipline from AutoGen, the dynamic planning layer adds first-class agent roles that shape prompt persona, task eligibility, and completion-report interpretation — without requiring a manager agent or breaking the file-backed coordination model.

Concrete work:

- **Phase 1 — Agent role schema and crew definition.** Add `agentRole?: 'planner' | 'implementer' | 'reviewer'` to agent configuration in `src/config/types.ts`, defaulting to `'implementer'` (no regression). Add support for an optional `.ralph/crew.json` roster file that lists named agents with `{ id, role, goal, backstory }`. When `.ralph/crew.json` is present the multi-agent launcher reads it instead of synthesising anonymous agents from `agentCount`. `goal` and `backstory` are short strings injected into the agent's persona section in the prompt, providing the role differentiation CrewAI uses to specialise agent behaviour. When absent, all existing multi-agent behaviour is preserved exactly.

- **Phase 2 — Role-aware task claiming.** Update claim acquisition logic in `taskFile.ts`:
  - `planner` agents claim `todo` tasks that have no `task-plan.json` artifact yet under `.ralph/artifacts/<taskId>/`.
  - `implementer` agents claim `todo` tasks that either have a `task-plan.json` (preferred, when a dedicated planner is in the crew) or any `todo` task if no planner agent is active.
  - `reviewer` agents claim `done` tasks that have no review artifact. This formalises what the existing review-agent pass does, giving it a configurable identity rather than an implicit post-loop phase.
  - If a role has no claimable tasks the agent idles rather than claiming out-of-role tasks. Idle agents are surfaced in `Show Multi-Agent Status` and the dashboard (item 15).

- **Phase 3 — Role-specific prompt templates.** Add `prompt-templates/planning.md` and `prompt-templates/review.md` alongside the existing implementation template. `promptBuilder.ts` selects the template based on `agentRole`. Each template carries role-appropriate persona framing and a completion-report variant: planners return `{ selectedTaskId, proposedPlan, proposedSubTasks?, suggestedValidationCommand? }`, reviewers return `{ selectedTaskId, reviewOutcome: 'approved' | 'changes_required', reviewNotes }`.

- **Phase 4 — Pre-execution planning pass.** Add `ralphCodex.planningPass: { enabled: boolean, mode: 'dedicated' | 'inline' }` to config (default `enabled: false`).
  - In `dedicated` mode a `planner`-role agent in the crew runs first. Its completion report is parsed for `proposedPlan` and written to `.ralph/artifacts/<taskId>/task-plan.json`. The implementer's prompt receives this artifact as a "Task Plan" context section injected before the task focus section.
  - In `inline` mode the implementer agent runs a planning step as its first prompt turn before the implementation prompt. The plan is written to the same artifact path. No dedicated planner agent is needed.
  - `task-plan.json` schema: `{ reasoning, approach, steps[], risks[], suggestedValidationCommand? }`. The `suggestedValidationCommand` is applied to the task's `validation` field when the field is currently empty, feeding the complexity scorer's `has_validation_field` signal.

- **Phase 5 — Dynamic task enrichment and documentation.** When a planner's completion report includes `proposedSubTasks`, `reconciliation.ts` processes these as bounded child-task proposals through the existing `taskDecomposition.ts` machinery — same cap and depth limits apply. Add crew configuration and planning-pass documentation to `AGENTS.md` with an example `.ralph/crew.json` showing a three-agent crew (one planner, two implementers) with role descriptions and backstories.

Scope boundaries:
- The hierarchical manager agent (a meta-agent that dynamically reassigns tasks mid-execution based on agent output) is explicitly deferred — same status as the operator CLI.
- `.ralph/crew.json` is optional. Absence is not an error and all existing multi-agent behaviour is preserved exactly.
- `reviewer` role in Phase 2 reuses the existing review-agent pass machinery. No new review logic is introduced; the change is that the role is now configurable and named rather than implicit.
- `planningPass` in `inline` mode counts as two LLM calls per task. Documentation must make this cost explicit.
- Semantic retrieval and vector-search-based role assignment are out of scope. Roles are statically declared in `crew.json` or config, not inferred at runtime.

Acceptance criteria for Phase 1:
- `agentRole` field accepted in config; absent field defaults to `'implementer'` without error.
- `.ralph/crew.json` parsed correctly when present; invalid schema produces a preflight warning, not a crash.
- `agentCount` still works when `crew.json` is absent — no regression.
- `npm run validate` passes.

**14. Intelligent failure recovery — diagnostic pass, recovery playbooks, and dead-letter queue**

Ralph detects and flags failures with precision — blocked status, validation failures, watchdog alerts, repeated no-progress — but recovery requires manual operator intervention: reading transcripts, editing `tasks.json`, and invoking separate tools. This item closes that gap with a two-layer system: a diagnostic pass that produces a structured root-cause artifact, and a recovery orchestrator that maps the artifact to an automated playbook without requiring operator input for the common cases.

Concrete work:

- **Phase 1 — Failure taxonomy and diagnostic pass.** Define a `FailureCategoryId` union type: `'transient' | 'implementation_error' | 'task_ambiguity' | 'validation_mismatch' | 'dependency_missing' | 'environment_issue'`. When a task transitions to `blocked` or exhausts its verifier, before writing the stop artifact, `loopLogic.ts` triggers a diagnostic invocation via the configured CLI provider. The diagnostic prompt receives: task definition, the last iteration's prompt and response (truncated to a token budget), failure output (validation stderr, verifier result, stop reason), and recent iteration history. The provider returns a structured response parsed to `.ralph/artifacts/<taskId>/failure-analysis.json`:
  ```json
  {
    "rootCauseCategory": "<FailureCategoryId>",
    "confidence": "<float 0.0–1.0>",
    "summary": "<one paragraph plain-English diagnosis>",
    "suggestedAction": "retry_with_context | decompose | reorder_dependencies | fix_environment | auto_retry | escalate_to_operator",
    "retryPromptAddendum": "<optional — context to inject into the retry prompt>"
  }
  ```
  The diagnostic invocation always uses the `simple` tier model (Haiku by default) with a tight token budget cap to limit cost. `transient` failures detected by existing preflight logic (network errors, lock contention, process timeout) bypass the diagnostic LLM call entirely — their category is assigned directly from the known failure signal.

- **Phase 2 — Recovery orchestrator.** Add `src/ralph/recoveryOrchestrator.ts`. On receiving a `failure-analysis.json` the orchestrator selects and executes the matching playbook:
  - **`transient`**: auto-retry up to `ralphCodex.maxRecoveryAttempts` with exponential backoff. Retry counter resets on success. No LLM diagnostic call.
  - **`implementation_error` / `validation_mismatch`**: retry the task with `retryPromptAddendum` injected as a "Previous attempt context" section in the next iteration's prompt. The agent sees what went wrong without reading the full prior transcript.
  - **`task_ambiguity`**: trigger a planning pass (even if `planningPass.enabled` is false globally) to re-reason the task before retry. If ambiguity persists after one planning pass, escalate to operator.
  - **`dependency_missing`**: release the claim, re-evaluate claim eligibility order in `taskFile.ts`, surface a preflight warning. The agent pauses rather than retrying.
  - **`environment_issue`**: attempt preflight auto-remediation; if unresolved, escalate to operator.
  - **`escalate_to_operator`**: emit a VS Code notification, surface the `failure-analysis.json` in the dashboard failure feed, and pause the agent.
  Recovery attempts are tracked in the provenance bundle. The orchestrator respects `ralphCodex.autoApplyRemediation` — playbook execution is gated behind the same setting that gates existing auto-remediation actions.

- **Phase 3 — Dead-letter queue.** When a task exhausts `maxRecoveryAttempts` across all playbook steps, write it to `.ralph/dead-letter.json` with its full diagnostic history (all `failure-analysis.json` entries for that task). `Show Status`, `Show Multi-Agent Status`, and the dashboard (item 15) surface dead-letter tasks in a distinct section separate from `blocked`. Add `ralphCodex.requeueDeadLetterTask` command: prompts the operator to select a dead-letter task, removes it from `dead-letter.json`, resets its status to `todo`, clears its failure history, and makes it claimable again.

- **Phase 4 — Failure chain detection.** In `recoveryOrchestrator.ts`, maintain a rolling window of the last 10 failure events per run (in-memory, not persisted between runs). If 3 or more events share the same `rootCauseCategory` with `confidence ≥ 0.7`, emit a `systemic-failure-alert.json` artifact and pause all agents. The alert includes the shared category, affected task IDs, and a recommended operator action. This prevents burning token budget on a doomed run when the environment or task graph has a systemic problem.

- **Phase 5 — Observability and configuration.** Add `ralphCodex.failureDiagnostics: 'auto' | 'off'` (default `'auto'`). When `off`, the diagnostic LLM call is skipped entirely and existing manual-inspection behaviour is preserved. Add `ralphCodex.maxRecoveryAttempts` (number, default 3). Add `diagnosticCost` field to the provenance bundle (token count for the diagnostic invocation) so operators can audit the overhead. Document the failure taxonomy and recovery playbooks in `AGENTS.md` including the cost implications of diagnostic passes at scale.

Scope boundaries:
- The diagnostic pass is a read-only analysis step. It does not modify `tasks.json`, claim files, or any other durable state — the orchestrator does that, separately and explicitly.
- `failureDiagnostics: 'off'` is a complete opt-out of LLM-based diagnosis. When off, `recoveryOrchestrator.ts` still handles `transient` failures (backoff retry requires no diagnosis) but skips all LLM calls.
- Dead-letter tasks are never modified by the loop autonomously once written. Only an explicit operator action (`requeueDeadLetterTask`) can return a task to the active graph.
- Failure chain detection pauses agents but does not terminate the run. Operators can resume after investigating.
- The recovery orchestrator does not invent new task mutations beyond what the existing `autoApplyRemediation` actions already support. New remediation verbs require a separate PRD item.

Acceptance criteria for Phase 1:
- `failure-analysis.json` written to the correct artifact path on a blocked task.
- Diagnostic LLM call is skipped for `transient` failures; `rootCauseCategory: 'transient'` is assigned without an LLM call.
- `failureDiagnostics: 'off'` suppresses the diagnostic invocation entirely.
- Unit tests cover: correct category assignment for each failure type, token budget enforcement, missing or malformed diagnostic response handled gracefully without crashing the loop.
- `npm run validate` passes.

**15. Full webview UI surfaces — dashboard, PRD wizard, settings panel, task view, and failure detail**

Ralph's configuration and status surfaces were designed for a narrow, technically fluent operator audience. With 40+ settings, multiple provider options including Azure Foundry with enterprise authentication, operator mode presets, multi-agent health monitoring, and intelligent failure recovery, text-only output and raw `settings.json` editing have become a barrier to correct use. This item introduces a full webview UI layer targeting the full operator spectrum from technical to non-technical, within VS Code.

**Principle update:** The design principle "engineering quality over UI polish" is revised to "engineering quality is paramount and usability is a first-class concern." New UI surfaces are now justified when they reduce operator error, improve discoverability, or make the system accessible to less technical users — not only when they directly support operator debugging or safety. Engineering quality and test coverage requirements are unchanged.

Concrete work:

- **Phase 1 — Webview foundation.** Add `src/webview/` housing a `WebviewPanelManager` (creates, shows, and disposes named panels without memory leaks), a `MessageBridge` (typed VS Code ↔ webview message passing), and a minimal shared component stylesheet. Each surface in Phases 2–6 is a separate panel registered through this manager. Panels communicate with the extension host exclusively through the message bridge — no direct filesystem access from webview JavaScript. Add an activity bar contribution point (`ralphCodex.showSidebar`) that lists the five surfaces as navigation items, giving operators a single entry point rather than command-palette hunting. Register all new commands in `registerCommands.ts`.

- **Phase 2 — Ralphdex Dashboard.** Replace text output from `Show Status` and `Show Multi-Agent Status` with a persistent webview panel (`ralphCodex.showDashboard`). Sections:
  - **Pipeline strip**: current phase name, phase progress indicator, elapsed time, last stop reason
  - **Agent grid**: one card per active agent — role badge (from item 13), current task ID and title, iteration count, last outcome indicator, sparkline of the last 10 outcomes (pass / blocked / failed)
  - **Task board**: counts by status (todo / in-progress / done / blocked / dead-letter) with a mini progress bar and percentage complete
  - **Failure feed**: the 5 most recent failure events with root-cause category, confidence, task title, and inline "View" / "Recover" action buttons (wired to item 14 commands)
  - **Cost ticker**: running token count and estimated cost for the current run, broken down by agent role and model tier
  - **Quick actions bar**: Pause All, Resume, Stop Loop, Open Latest Artifacts, Open Settings
  Updates arrive via the message bridge on each iteration completion event. The panel is read-only for loop state — all write actions route through the existing `registerCommands.ts` command layer with no new trust surfaces.

- **Phase 3 — PRD Creation Wizard.** Add `ralphCodex.newProjectWizard` command opening a multi-step webview. Steps:
  1. **Project type**: card picker — Web App, CLI Tool, Library, Service, Data Pipeline, Mobile App, Other — each with a one-line description of how Ralph will orient task generation
  2. **Objective**: text area with dynamic example prompts keyed to the selected project type, a character counter, and a "what makes a good objective" hint panel
  3. **Constraints**: tech stack chip input, out-of-scope free-text field, existing conventions field
  4. **Generate**: invokes `projectGenerator.ts` AI generation; renders the draft PRD inline in the wizard with line-level editing before touching disk
  5. **Review tasks**: generated tasks rendered as editable cards — operators can reorder, edit titles, change tier, delete tasks before committing
  6. **Configuration**: recommended operator mode card (with rationale from the `recommendedSkills` output from item 6), recommended provider, suggested skills — each individually selectable or skippable
  7. **Confirm**: writes `prd.md`, `tasks.json`, and applies selected config; shows a summary of every file written
  The wizard is also the entry point for the `regeneratePrd` flow from item 12 — step 4 opens with the existing PRD pre-loaded for comparison.

- **Phase 4 — Settings Panel.** Add `ralphCodex.openSettings` command opening a webview that replaces raw `settings.json` editing for the majority of operators:
  - **Left nav**: grouped sections — Execution, Agents & Roles, Memory, Providers, Pipeline, Recovery, Advanced — plus a search bar that filters across all settings
  - **Centre**: settings for the selected group. Each setting shows label, description, current value (editable inline), and an "effective value" chip: `preset` (greyed, sourced from operator mode preset) or `explicit` (blue, operator-set). This makes the preset/override resolution logic from item 11 human-readable.
  - **Operator Mode card**: three preset cards (Simple / Multi-Agent / Hardcore) at the top of Execution with key settings listed on each. Clicking applies the preset; a "Customised" badge appears if any explicit setting overrides the active preset.
  - **Providers section**: one accordion per provider (Claude CLI, Copilot, Azure Foundry). Each has a "Test Connection" button that runs the provider's preflight validation inline and shows pass/fail. The Azure Foundry accordion expands to a guided configuration form (endpoint URL, auth method selector between API Key and Azure AD, deployment name, API version), replacing manual JSON editing.
  - **NEW badges**: settings introduced in the last release are badged. A collapsible "What's new" section at the top lists them with one-line descriptions.
  - Changes apply on blur. No Save button required.

- **Phase 5 — Task View.** Add `ralphCodex.showTasks` command rendering `.ralph/tasks.json` as a structured interactive list:
  - Each task is a card: ID, title, status badge (colour-coded), tier badge with source (`explicit` / `scored`), blocker relationship chips
  - Expanding a card shows: description, validation command, planning pass output summary (from `task-plan.json` if present, from item 13), diagnostic history (condensed from `failure-analysis.json` entries, from item 14)
  - Context menu per card: Edit Tier, Mark Blocked, Add Blocker, Requeue from Dead-Letter
  - Dead-letter tasks appear in a distinct collapsible section at the bottom with full failure history inline
  - View refreshes on filesystem changes to `tasks.json` so it remains live during an active run

- **Phase 6 — Failure Detail View and notification model.** When item 14's diagnostic pass completes, emit a VS Code notification toast: `"[Task title] failed — [category] ([confidence]%)"` with three inline actions: **View Diagnosis**, **Auto-Recover**, **Skip Task**. Dismissing the toast does not lose the event — it persists in the dashboard failure feed. **View Diagnosis** opens a focused webview rendering `failure-analysis.json` as: root-cause category with plain-English explanation, confidence bar, summary paragraph, suggested action, and the `retryPromptAddendum` text so operators can review the context the agent will receive on retry before approving. **Auto-Recover** triggers the recovery orchestrator playbook. **Skip Task** marks the task blocked and moves on.

**New settings discovery model** (cross-cutting, applies from Phase 4 onward): on extension activation after an update that introduced new settings, fire a single notification — `"Ralphdex: [N] new settings available"` — with a deep link that opens the Settings Panel scrolled to the first NEW-badged item. This replaces the current model where new settings are invisible unless the operator reads release notes.

Scope boundaries:
- All webview panels are read-only consumers of durable `.ralph/` state. Write operations route through the existing `registerCommands.ts` command layer — no new trust surfaces are introduced.
- The Task View is a display layer over `tasks.json`, not a full graph editor. Actions that already exist as commands (mark blocked, change tier, requeue) are surfaced; net-new task-graph editing capabilities (adding tasks, rewriting descriptions) remain file-direct and are not in scope here.
- The PRD Creation Wizard does not replace direct `.ralph/prd.md` editing. Operators who prefer to write PRDs directly are unaffected.
- Webview JavaScript is bundled as part of the extension and subject to the same `npm run validate` gate. No external CDN dependencies.
- A full interactive kanban board (drag-and-drop task graph editing) is a future iteration beyond this item.

Acceptance criteria for Phase 1:
- `WebviewPanelManager` creates, shows, and disposes panels without memory leaks (verified by unit test with mock VS Code API).
- `MessageBridge` typed message round-trip test passes.
- Activity bar entry registered and clickable without throwing.
- `npm run validate` passes.

**16. Configuration/default consistency hardening**

Objective: eliminate behavior drift caused by contradictory defaults and stale docs.

Deliverables:
- Align `ralphCodex.planningPass.enabled` defaults across `package.json`, `src/config/defaults.ts`, and docs so the shipped behavior is deterministic.
- Align `ralphCodex.promptBudgetProfile` default with calibrated guidance (codex vs claude placeholder) and document migration impact.
- Add a docs/config consistency check to `npm run check:docs` so default-value drift fails CI.

Acceptance criteria:
- A single source-of-truth table exists for defaults and is consumed by docs validation.
- `Show Status` reports both effective value and source (`preset`, `manifest default`, or `explicit`) for planning pass and prompt budget profile.
- `npm run validate` passes with no config-default mismatch warnings.

**17. Azure Foundry authentication completion**

Objective: complete the unfinished keyless auth path and remove “not yet implemented” behavior for Azure AD.

Deliverables:
- Implement Azure AD credential flow (Managed Identity / `DefaultAzureCredential`) in the Azure Foundry provider.
- Keep API-key flow intact and ensure credentials are never persisted in artifacts/transcripts.
- Upgrade preflight from informational warning to explicit auth-readiness checks for API key and Azure AD paths.

Acceptance criteria:
- Azure Foundry runs succeed with either API key or Azure AD token path.
- Preflight clearly states which auth path is active and whether it is executable.
- Unit tests cover both auth modes and failure mapping.

**18. Provider-agnostic memory summarization**

Objective: remove partial implementation risk in `memoryStrategy=summary` by routing summarization through provider-aware execution.

Deliverables:
- Replace hardcoded `command -p -` summarization invocation with provider strategy abstraction.
- Preserve fallback behavior, but emit explicit telemetry/warnings when fallback text is used.
- Add artifacts indicating summarization mode (`provider_exec`, `fallback_summary`) for auditability.

Acceptance criteria:
- Summary-mode works across codex, claude, copilot, and azure-foundry providers without provider-specific flag assumptions.
- Silent fallback is removed; fallback events are visible in status and provenance.
- Regression tests verify summarization invocation per provider and fallback signaling.

**19. Documentation and operator-trust reconciliation**

Objective: ensure surfaced behavior matches actual runtime capability and cost model.

Deliverables:
- Remove outdated “placeholder/reserved for future” text where implementation already exists (or gate feature if intentionally not production-ready).
- Add a “feature maturity” marker (`stable`, `beta`, `experimental`) to major toggles: planning pass, memory summary, prompt profile, Azure provider auth path.
- Add a PR checklist item requiring docs + manifest + runtime default review for any config change.

Acceptance criteria:
- No contradictions remain between manifest descriptions, docs, and implementation behavior for reviewed features.
- Operator-facing docs explicitly identify calibrated vs non-calibrated defaults.
- `npm run check:docs` fails on future contradiction patterns introduced in this phase.

### Next delivery horizon

With the 15-item delivery horizon satisfied, the following capabilities are the concrete next targets.

**1. v0.2.0 release preparation**

Publish the first numbered Marketplace release. Concrete work:

- Bump `package.json` version to `0.2.0`.
- Add a `CHANGELOG.md` entry recording the 15-item horizon delivered in this release.
- Tag the release commit and run `vsce publish` against the VS Code Marketplace.
- Validate that the published extension installs cleanly from the Marketplace.

Acceptance criteria:
- `package.json` version is `0.2.0`.
- `CHANGELOG.md` has a `## [0.2.0]` entry with a dated summary of the 15-item delivery horizon.
- `vsce publish --dry-run` passes with no blocking warnings.
- `npm run validate` passes.

**2. Developer-loop shim self-hosting validation**

Verify that the Node.js shim built in the prior horizon can drive a real Ralph iteration loop outside VS Code. Concrete work:

- Run at least one complete iteration using the shim against this repository's own `.ralph/` workspace.
- Confirm completion reports reconcile correctly and task state advances as expected.
- Document any shim limitations, environment prerequisites, or behavioural differences from the VS Code host path.
- Record findings in `docs/shim-validation.md` so future contributors understand the validated self-hosting path.

Acceptance criteria:
- At least one iteration completes end-to-end via the shim with a reconciled task state update.
- `docs/shim-validation.md` exists and documents the validated invocation, prerequisites, and any known gaps.
- `npm run validate` passes.

**3. Model tiering calibration**

Score the completed task history and verify tier assignments match intuition before enabling tiering by default. Concrete work:

- Run the complexity scorer against the 267 completed tasks and record the tier distribution (`simple`, `medium`, `complex`).
- Identify obvious misfires — tasks scored in the wrong tier — and document the root cause (weak signal, missing `validation` field, misleading title).
- Document findings in `docs/model-tiering.md`: score distribution, tier boundaries, calibration methodology, recommended threshold adjustments, and expected cost savings at each tier.
- Enable tiering by default (`modelTiering.enabled: true`) with calibrated thresholds once findings are validated.

Acceptance criteria:
- `docs/model-tiering.md` exists with a scored distribution table and documented methodology.
- Calibration findings are used to update `complexityScorer.ts` thresholds if any boundary adjustments are warranted.
- `npm run validate` passes.

### Continued multi-agent evolution horizon (post-foundation)

The milestones above establish a working multi-agent baseline (claims, loop parallelism, planning/recovery scaffolding, pipeline phases, review pass, human gates). The next horizon is not “more agents in parallel”; it is a stronger orchestration contract that stays deterministic, file-backed, and operator-legible under higher coordination complexity.

The phases below intentionally borrow proven ideas from CrewAI (role-specialized crews + flows), AutoGen (GraphFlow + handoffs), LangGraph (explicit state graph orchestration), and Swarm-style lightweight delegation — but only where those ideas fit Ralphdex’s durable artifact and verifier-first trust model.

**20. Durable orchestration graph + supervisor ledger**

Why it matters:

Current pipeline checkpoints are phase-oriented (`scaffold` → `loop` → `review` → `scm`) and resumable, but they do not yet express richer multi-agent coordination semantics (conditional branches, bounded loops, fan-out/fan-in joins) as first-class durable state. A graph-backed supervisor ledger makes orchestration explicit, replayable, and auditable without introducing hidden runtime memory.

Concrete work:

- Add `.ralph/orchestration/<runId>/graph.json` (graph definition) and `.ralph/orchestration/<runId>/state.json` (runtime cursor + node outcomes) as durable orchestration artifacts.
- Define a small orchestration DSL with bounded node kinds: `task_exec`, `review`, `verify_gate`, `human_gate`, `handoff`, `fanout`, `fanin`, `replan`, `scm_submit`.
- Add `src/ralph/orchestrationSupervisor.ts` that advances exactly one graph transition per persisted state update (write-then-advance discipline), so each move is inspectable and resumable.
- Enforce deterministic transition guards: each edge transition must cite verifier outcomes, claim status, or explicit operator action id; no freeform “agent decided” transition reasons.
- Persist per-node span artifacts (`node-<id>-span.json`) including start/end timestamps, assigned agent role/id, input artifact references, output artifact references, and stop classification.
- Integrate with existing pipeline artifacting by embedding orchestration graph pointers in `.ralph/artifacts/pipelines/<runId>.json` and latest-pointer surfaces.

Scope boundaries:

- This is an orchestration layer, not a replacement for `tasks.json`; tasks remain the source of truth for work definitions.
- Supervisor execution is intentionally single-writer per run (one durable cursor), even when worker agents run in parallel.
- No opaque external workflow engine runtime is introduced; orchestration state remains repository-local JSON under `.ralph/`.

Acceptance criteria:

- A run interrupted mid-graph resumes from `state.json` without recomputing already-completed node effects.
- `Show Status` (and dashboard surfaces) can display current node, prior node outcomes, and pending branch nodes from persisted graph state alone.
- Every graph transition has a persisted evidence reference set (verifier/human action/claim event); transitions without evidence are rejected as invalid.
- `npm run validate` passes with graph-schema and supervisor regression coverage.

**21. Explicit handoff contract + contested/stale handoff lifecycle**

Why it matters:

Ralphdex already persists session handoff notes for clean loop stops, but multi-agent delegation still lacks a strict handoff contract between roles. Without an explicit contract, delegation can silently widen scope, lose constraints, or create stale “who owns what next” ambiguity. A durable handoff protocol turns delegation into evidence-backed state, not implicit prompt carryover.

Concrete work:

- Introduce `.ralph/handoffs/<handoffId>.json` with required fields: `fromAgentId`, `toRole`, `taskId`, `objective`, `constraints`, `acceptedEvidence`, `expectedOutputContract`, `stopConditions`, `createdAt`, `expiresAt`, `provenanceLinks`.
- Add handoff statuses: `proposed`, `accepted`, `rejected`, `expired`, `superseded`, `contested`, with append-only transition history.
- Add acceptance rules: only eligible receiving roles may accept; acceptance must include an explicit claim/reference to the selected task and current graph node.
- Add stale/contested detection integrated into preflight Agent Health diagnostics, similar to claim stale detection, with explicit operator/watchdog resolution paths.
- Add handoff reconciliation checks in `reconciliation.ts`: completion reports must match accepted handoff scope when one exists; out-of-scope completion claims are downgraded and surfaced for review.
- Add latest-pointer convenience artifacts (`latest-handoff.json`, `latest-handoff-summary.md`) and status/report sections.

Scope boundaries:

- Handoffs do not grant task ownership; claim acquisition remains authoritative for execution exclusivity.
- Group-chat style unconstrained multi-party conversation is not the default coordination model; handoff remains pairwise and explicit.
- Handoff contract does not carry hidden memory blobs; all referenced context must point to durable artifacts.

Acceptance criteria:

- Delegated execution without an `accepted` handoff record is blocked for graph nodes requiring handoff.
- Expired or contested handoffs are surfaced in preflight and status and cannot be silently auto-accepted.
- Completion reconciliation emits a deterministic warning when output violates the accepted handoff output contract.
- `npm run validate` passes with handoff lifecycle tests (propose/accept/expire/contested).

**22. Role topology + least-context execution envelopes**

Why it matters:

Role labels alone are insufficient if every role sees the same broad context and can mutate equivalent surfaces. Reliable multi-agent behavior requires both role-specific permissions and role-specific context windows that are explicit and inspectable. This aligns with CrewAI-style role specialization and LangGraph subagent isolation while preserving Ralphdex’s no-hidden-memory rule.

Concrete work:

- Define a durable role policy map (`.ralph/roles/policy.json`) covering allowed node kinds, allowed task-state mutations, required verifier gates, and human-gate requirements per role (`planner`, `implementer`, `reviewer`, `verifier`, `recovery`, `scm`, optional `operator_proxy`).
- Add context-envelope artifacts per execution (`context-envelope.json`) that enumerate exactly which files/artifacts were exposed to that role, plus omission reasons.
- Extend `promptBuilder.ts` with role-specific context selectors: planners get task graph + constraints; implementers get task-local code context + plan; reviewers/verifiers get diff + acceptance criteria + verifier outputs; SCM agents get only merge/PR metadata.
- Add policy enforcement in execution/reconciliation paths: role attempts to emit disallowed actions (for example, reviewer requesting source edits) are downgraded to policy violations with deterministic stop reasons.
- Add role-policy diagnostics to preflight and status so operators can see the effective policy source (`preset`, `crew`, or explicit override).

Scope boundaries:

- This phase does not introduce autonomous role inference from freeform model output; role assignment remains explicit via config/crew.
- Context isolation is allowlist-based and artifact-referenced; no vector-memory retrieval dependency is introduced.
- Operator overrides remain possible but must be explicit and persisted.

Acceptance criteria:

- For each role, prompt evidence proves only allowed context sections were included, and the envelope is persisted per iteration.
- Policy violation attempts produce deterministic classifications (not silent coercion) and are visible in status/dashboard surfaces.
- Regression tests cover at least one blocked disallowed action per role class.
- `npm run validate` passes.

**23. Adaptive re-planning + deterministic fan-out/fan-in reconciliation**

Why it matters:

Parallel execution currently improves throughput, but reconciliation semantics are still mostly linear: one task, one completion report, one verifier pass at a time. To scale multi-agent execution safely, Ralphdex needs explicit fan-out/fan-in rules and bounded adaptive re-planning when verifier/recovery evidence shows the current plan is wrong.

Concrete work:

- Add plan-graph artifacts (`plan-graph.json`) that map parent tasks to execution waves (fan-out sets) and explicit merge criteria (fan-in gates).
- Define fan-out safety rules: only tasks with no unresolved dependency edges and no shared write-risk label may run in the same wave; violations block wave launch.
- Define fan-in gates executed by verifier/reviewer roles: all child outcomes collected, merge conflict summary resolved, validation aggregate passed, and parent acceptance criteria re-evaluated before marking parent done.
- Add bounded adaptive re-planning node (`replan`) triggered only by specific evidence classes (repeated verifier mismatch, systemic failure alert, unresolved merge conflict set) with strict caps (`maxReplansPerParent`, `maxGeneratedChildren`).
- Persist re-plan decision artifacts documenting trigger evidence, rejected alternatives, chosen mutation, and resulting task-graph diff.
- Add human choke points for high-risk mutations (scope expansion above threshold, dependency rewiring across parent boundaries, SCM actions after contested fan-in).

Scope boundaries:

- Re-planning is not open-ended autonomous planning; it is bounded, evidence-triggered, and capped per parent task.
- Fan-in does not bypass existing task invariants (parent completion monotonicity, dependency validity, lock-guarded writes).
- No silent auto-merge of conflicting child outputs; conflict resolution remains explicit with reviewer/verifier evidence.

Acceptance criteria:

- Parallel wave execution records a durable wave artifact with member tasks, launch guard checks, and completion outcomes.
- Parent tasks cannot transition to `done` until fan-in gates are satisfied and persisted.
- Re-plan cap exhaustion triggers a deterministic `human_review_needed`/operator escalation path instead of infinite planner loops.
- `npm run validate` passes with fan-out/fan-in and replan-cap regression tests.

**99. Operator CLI — deferred, out of scope (future fork)**

A standalone full-featured CLI for headless/CI operator use has been explicitly deferred. It is not a next target for the VS Code extension and must not be introduced as backlog work. Rationale: the extension already drives the `cliExec` strategy which shells out to the `claude` CLI — CI use is already achievable by installing the Claude CLI in the runner environment. A dedicated `ralph-cli` would require a parallel host, config system, and UX contract that would split maintenance effort with no gain for users who work inside VS Code. The developer-loop shim (item 1 above) covers the self-hosting use case without becoming a full product. If a full operator CLI becomes warranted, it will be a separate project fork, not an extension feature.

### Design principles and scope boundaries

**Brand name: Ralphdex.** All user-visible strings — command palette labels, display names, notifications, status messages, README, CHANGELOG, and Marketplace metadata — must use "Ralphdex" as the product name. References to "Ralph Codex", "ralph-codex", "Ralph codex", or similar variants must not appear in any surface the end user can see. Internal identifiers (command IDs such as `ralphCodex.*`, config keys, file/directory names like `.ralph/`) are exempt and may retain their current form to avoid breaking changes.

**Engineering quality is paramount and usability is a first-class concern.** Loop correctness, test coverage, and cost efficiency remain the highest-priority engineering concerns. New UI surfaces are now also justified when they reduce operator error, improve discoverability, or make the system accessible to less technical users. See item 15 for the full principle revision rationale.

**Cost efficiency is a first-class concern.** The model tiering system exists specifically to avoid paying Opus prices for simple tasks. Any new feature that adds iteration overhead (extra prompt sections, additional agent passes, richer context assembly) must justify its cost impact. The prompt budget policy exists for this reason and must be respected.

**Self-hosting is the development model.** Once the developer-loop shim exists, Ralph should be used to develop Ralph. Tasks generated by Ralph's own backlog replenishment prompt, executed by Ralph's own iteration engine, reconciled by Ralph's own completion-report parser. This creates a continuous validation loop and surfaces quality issues in the tool itself.
