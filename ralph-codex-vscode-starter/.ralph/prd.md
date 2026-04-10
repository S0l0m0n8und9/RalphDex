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

- **Phase 5 — `Ralph Codex: Regenerate PRD` command.** Add a new VS Code command `ralphCodex.regeneratePrd` that re-runs PRD generation against the current `.ralph/prd.md` content, producing a refined version. The command should diff the proposed changes and open a VS Code diff editor for operator review before writing. This enables iterative PRD authorship rather than forcing operators to start from scratch when requirements evolve. Wire the command in `registerCommands.ts`.

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

**99. Operator CLI — deferred, out of scope (future fork)**

A standalone full-featured CLI for headless/CI operator use has been explicitly deferred. It is not a next target for the VS Code extension and must not be introduced as backlog work. Rationale: the extension already drives the `cliExec` strategy which shells out to the `claude` CLI — CI use is already achievable by installing the Claude CLI in the runner environment. A dedicated `ralph-cli` would require a parallel host, config system, and UX contract that would split maintenance effort with no gain for users who work inside VS Code. The developer-loop shim (item 1 above) covers the self-hosting use case without becoming a full product. If a full operator CLI becomes warranted, it will be a separate project fork, not an extension feature.

### Design principles and scope boundaries

**Brand name: Ralphdex.** All user-visible strings — command palette labels, display names, notifications, status messages, README, CHANGELOG, and Marketplace metadata — must use "Ralphdex" as the product name. References to "Ralph Codex", "ralph-codex", "Ralph codex", or similar variants must not appear in any surface the end user can see. Internal identifiers (command IDs such as `ralphCodex.*`, config keys, file/directory names like `.ralph/`) are exempt and may retain their current form to avoid breaking changes.

**Engineering quality over UI polish.** Dashboard, sidebar, and status bar improvements are secondary to loop correctness, test coverage, and cost efficiency. New UI surface should only be added when it directly supports operator debugging or safety — not for aesthetics.

**Cost efficiency is a first-class concern.** The model tiering system exists specifically to avoid paying Opus prices for simple tasks. Any new feature that adds iteration overhead (extra prompt sections, additional agent passes, richer context assembly) must justify its cost impact. The prompt budget policy exists for this reason and must be respected.

**Self-hosting is the development model.** Once the developer-loop shim exists, Ralph should be used to develop Ralph. Tasks generated by Ralph's own backlog replenishment prompt, executed by Ralph's own iteration engine, reconciled by Ralph's own completion-report parser. This creates a continuous validation loop and surfaces quality issues in the tool itself.