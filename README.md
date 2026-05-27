# Ralphdex
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/s0l0m0n8und9.ralphdex?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/s0l0m0n8und9.ralphdex?label=installs)](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/s0l0m0n8und9.ralphdex?label=rating)](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex) 
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[Ask DeepWiki](https://deepwiki.com/S0l0m0n8und9/RalphDex)

A VS Code extension for durable, file-backed agentic coding loops. Ralph keeps your objective, task graph, prompts, run artifacts, and provenance evidence on disk under `.ralph/` so any new provider-backed session can resume from inspectable state instead of chat history.

**Key capabilities:**

- **File-backed state** — PRD, progress log, and task graph survive across sessions without relying on chat history
- **Multiple CLI backends** — Codex CLI (`codex exec`), Claude CLI (`claude -p`), GitHub Copilot CLI, Copilot CLI with Azure OpenAI BYOK (`copilot-foundry`), Azure direct HTTPS (`azure-foundry`), and Google Gemini CLI (`gemini`)
- **Deterministic loop control** — preflight checks, multi-verifier passes, explicit stop reasons, and bounded remediation
- **Full provenance** — every iteration writes prompt evidence, git snapshots, and a verifiable trust chain to disk
- **IDE handoff** — clipboard plus configurable VS Code command delivery for chat-first workflows

The extension has two execution paths:

- prepare a prompt for AI-IDE handoff through clipboard plus configurable VS Code command IDs
- run deterministic CLI iterations through the configured provider (`codex`, `claude`, `copilot`, `copilot-foundry`, `azure-foundry`, or `gemini`) with preflight checks, verifier passes, stable artifacts, and explicit stop reasons

## Who This Is For

This project is for operators who want file-backed AI delivery workflows that survive across sessions, and for developers who want a VS Code extension that can prepare prompts, hand work off to an IDE chat surface, and run deterministic CLI iterations with persisted evidence.

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex):

1. Open VS Code.
2. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **Ralphdex**.
4. Click **Install**.

Alternatively, install from the command line:

```bash
code --install-extension s0l0m0n8und9.ralphdex
```

For a local package build, run `npm run package` from the repo root and install the generated `ralphdex-<version>.vsix` via `Extensions: Install from VSIX...` or `code --install-extension ./ralphdex-<version>.vsix`. `npm run publish:dry-run` currently aliases that same packaging check. The release package now includes runtime dependencies and excludes local worktree and prior-package artifacts. See [docs/release-workflow.md](docs/release-workflow.md) for the full package and Marketplace publish flow.

### Post-Install Tour

The Marketplace listing should match what you see after install:

1. The Ralphdex activity-bar icon appears in VS Code.
2. `Ralphdex: Show Status` opens the dashboard webview with the current task, pipeline, failure, and artifact snapshot.
3. The Ralphdex sidebar is a compact operator surface for durable `.ralph/` state: simple mode shows run/stop, progress, current work, PRD setup, task seeding, and dashboard access; advanced mode adds compact task triage, recent outputs, and dead-letter attention without cloning the full dashboard.
4. `Ralphdex: Show Status` and `Ralphdex: Open PRD Wizard` scaffold `.ralph/prd.md`, `.ralph/tasks.json`, and `.ralph/progress.md` for a fresh repo (the PRD wizard opens automatically when workspace state is incomplete).

For a quick release-candidate demo pass, install the Marketplace build or local VSIX, run `Ralphdex: Show Status` to confirm the dashboard renders, then run `Ralphdex: Open PRD Wizard` in a scratch folder and verify the `.ralph/` files are created.

## Release Surface

Ralphdex ships to the VS Code Marketplace under the extension identifier `s0l0m0n8und9.ralphdex`. The maintained release assets for operators are:

- the Marketplace listing for install and update discovery
- the repo-root `README.md` for install, first-run, and command guidance
- [docs/release-workflow.md](docs/release-workflow.md) for version bump, packaging, and publish steps
- [CHANGELOG.md](CHANGELOG.md) for operator-visible release notes

## Website And Technical Documentation

The public landing page for Ralphdex is maintained in [`website/`](website/) and published at [ralphdex.com](https://ralphdex.com). It presents the product, installation path, workflow, and evidence-first operating model using the same visual language as the shipped dashboard.

For generated architecture navigation and code-grounded exploration, use the [Ralphdex DeepWiki](https://deepwiki.com/S0l0m0n8und9/RalphDex). Repository code, `package.json`, and the focused documents under [`docs/`](docs/) remain authoritative for shipped commands, configuration, verifier behavior, provenance, and security boundaries.

## CLI Shim

Use `node out/shim/main.js <workspace-path>` to run one Ralph CLI iteration outside the VS Code extension host. The shim reads `.ralph-config.json` plus `RALPH_CODEX_*` environment overrides from the target workspace, streams Ralph output to stdout, and stays out of the packaged VSIX payload.

## Getting Started

For a fresh clone, start by installing dependencies and running the validation gate:

1. Install Node.js 22 or newer and VS Code 1.95 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Build and validate:

   ```bash
   npm run compile
   npm run validate
   ```

4. Press `F5` to launch the Extension Development Host.
5. Use `Ralphdex: Show Status` to open the dashboard and inspect the current workspace state.
6. Use `Ralphdex: Prepare IDE Prompt`, `Ralphdex: Open Codex IDE`, `Ralphdex: Run Single Iteration`, or `Ralphdex: Run Loop` depending on the workflow you want.

For a fresh workspace that does not have a `.ralph/` directory, open the PRD wizard using `Ralphdex: Open PRD Wizard`, or run any provider-facing command. Provider-facing commands such as Prepare IDE Prompt, Open Codex IDE, Run Single Iteration, Run Loop, Run Multi-Agent Loop, and Run Full Workflow automatically open the PRD wizard when `.ralph/prd.md` is missing or still contains the default placeholder. Finish the wizard before starting the first run.

For an established Ralph workspace that already has `.ralph/prd.md`, `.ralph/tasks.json`, and `.ralph/progress.md` but is missing `.ralph/doctrine/`, use `Ralphdex: Initialize Doctrine Pack`. That command only scaffolds missing doctrine files and repairs an invalid `evidence-index.json`; it does not rerun workspace bootstrap or act like cleanup/reset.

Newly generated Ralph tasks now share one normalization and persistence pipeline across bootstrap commands, PRD generation, decomposition, remediation, and pipeline scaffolding. In practice that means generated tasks should keep the richest producer-supplied shape Ralph knows at creation time, including fields such as `notes`, `validation`, `acceptance`, `constraints`, `context`, `tier`, and any derived dependency or mode metadata when those values are available. A generated task may still omit some optional fields when the upstream producer genuinely lacked that information or when the canonical contract leaves the field absent by design. See [docs/invariants.md#normalized-task-contract](docs/invariants.md#normalized-task-contract) for the authoritative field-presence rules.

Use `Ralphdex: Regenerate PRD` when you need Ralphdex to help turn a fuzzy brief or an outdated `.ralph/prd.md` into a reviewable PRD draft plus a reviewable starter backlog before writing durable files. The wizard is intentionally narrow: it is an authoring workflow, not a settings cockpit. It walks through project shape, draft generation, PRD review, task review, and confirm-write, then writes only `.ralph/prd.md` and `.ralph/tasks.json`.

Use `Ralphdex: Add Task`, `Ralphdex: Seed Tasks from Feature Request`, or the dashboard/sidebar seeding form when you already have a stable PRD and need Ralph to append flat backlog tasks for one epic or feature request. Use `Ralphdex: Regenerate PRD` when the product objective or PRD structure itself needs to be rewritten first. The seeding path appends only flat version-2 backlog tasks through the shared normalization boundary; it does not create PRD structure or parent/child task hierarchies. Each seeding attempt also writes a durable artifact under `.ralph/artifacts/task-seeding/task-seeding-<timestamp>.json` so operators can inspect the request, provider launch metadata, generated task drafts, and warnings after the command returns.

The sidebar is for quick operation and compact triage. The dashboard remains the deeper inspection surface for full work history, settings, diagnostics, and artifact review.

The shipped dashboard and sidebar have one production ownership path: shared webview infrastructure lives under `src/webview/`, the bundled React shell lives under `src/webview-ui/`, and the VS Code surface adapters live under `src/ui/dashboardPanel.ts` and `src/ui/sidebarViewProvider.ts`. The older `src/ui/panelHtml.ts` and `src/ui/sidebarHtml.ts` string renderers are retained as compatibility fixture/fallback surfaces during the incremental migration, including debug fallback when the local webview bundle has not been emitted yet. The top-level `UXrefresh/` bundle is retained only as a reference-only prototype from the redesign phase and must not be treated as the live implementation.

To build a distributable local package: `npm run package` from the repo root, then install the generated VSIX through `Extensions: Install from VSIX...` or `code --install-extension ./ralphdex-<version>.vsix`.

## Durable Files

Ralph keeps persistent state in the workspace under `.ralph/`, organized into committed durable artifacts and operator-local runtime artifacts:

**Committed project state** (tracked in version control):
- objective: `.ralph/prd.md`
- progress: `.ralph/progress.md`
- tasks: `.ralph/tasks.json`
- memory state: `.ralph/memory-summary.md` (when using summary memory strategy)

**Operator-local runtime state** (machine-specific, not committed):
- session state: `.ralph/state.json` (cursor, claims, iteration count)
- prompts: `.ralph/prompts/` (generated per iteration)
- transcripts: `.ralph/runs/` (raw provider responses)
- clean-stop session handoff notes: `.ralph/handoff/`
- role-to-role handoff contracts: `.ralph/handoffs/`
- agent history metadata: `.ralph/agents/`
- logs: `.ralph/logs/extension.log`

**Generated execution evidence** (iteration artifacts and provenance):
- artifacts and latest pointers: `.ralph/artifacts/` (provenance bundles, diagnostic reports, latest-pointer files)

See [docs/boundaries.md](docs/boundaries.md#repository-layout-and-workspace-state) for the authoritative classification and [docs/invariants.md](docs/invariants.md) for the task schema, field-presence rules, and control-plane invariants.

## Artifact Lifecycle

Ralph separates committed durable state from operator-local runtime evidence:

- **Committed durable state** (safe to track in version control): `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, `.ralph/memory-summary.md`
- **Operator-local runtime state** (machine-specific, should be ignored): `.ralph/state.json`, `.ralph/logs/`, `.ralph/agents/`, `.ralph/handoff/`
- **Generated execution evidence** (iteration artifacts): prompts, transcripts, provenance bundles, diagnostic reports under `.ralph/artifacts/`
- **Latest stable entry points** (convenient access): `.ralph/artifacts/latest-summary.md`, `latest-prompt-evidence.json`, `latest-execution-plan.json` and related latest-pointer artifacts

`Ralphdex: Clean Up Old Run Artifacts` is the safe maintenance path — it preserves committed durable Ralph state and the latest evidence surfaces while pruning older generated artifacts. `Ralphdex: Reset Runtime State` is broader: it clears generated runtime state while still preserving `.ralph/prd.md`, `.ralph/progress.md`, and `.ralph/tasks.json`.

For day-to-day loop inspection:

1. `Ralphdex: Show Status` opens or focuses the dashboard with a fresh snapshot covering the selected task, recent history, and stale surfaces. The raw status report is also written to the `Ralphdex` output channel for audit and debugging.
2. The dashboard `Work` tab and the sidebar both expose a task-seeding form so operators can turn an epic or feature request into appended backlog tasks without leaving Ralphdex surfaces.
3. Dashboard actions are grouped by intent: run controls stay in the Overview hero (and sidebar Run tab), while prompt/status/artifact shortcuts are grouped under `Prepare & Inspect` in the rail/sidebar.
4. Dead-letter recovery is surfaced as operational triage in the dashboard overview/work areas and the sidebar advanced mode, with direct requeue, diagnosis, and auto-recover actions where available. Diagnostics still carries deeper technical details.
5. `Ralphdex: Open Latest Ralph Summary` for the newest outcome summary as a text artifact.
6. `Ralphdex: Open Latest Prompt Evidence` and `Ralphdex: Open Latest CLI Transcript` to inspect what Ralph prepared and what the provider returned.
7. `Ralphdex: Open Failure Diagnosis` to jump straight to the dashboard diagnostics tab for the selected task's persisted recovery context.
8. `Ralphdex: Open Latest Provenance Bundle` or `Ralphdex: Reveal Latest Provenance Bundle Directory` for the full persisted proof set.

Task-seeding artifacts are separate from iteration provenance. Successful and failed seeding attempts write durable evidence under `.ralph/artifacts/task-seeding/`, while the appended tasks themselves still persist only in `.ralph/tasks.json` through the shared version-2 task pipeline.

See [docs/workflows.md](docs/workflows.md) for the full operator flow and [docs/provenance.md](docs/provenance.md) for the trust model.

## Commands

Source of truth: `package.json` (`contributes.commands`) is authoritative for shipped command IDs and titles.

Current command surface:

- `Ralphdex: Initialize Doctrine Pack`
- `Ralphdex: Add Task`
- `Ralphdex: Seed Tasks from Feature Request`
- `Ralphdex: Prepare IDE Prompt`
- `Ralphdex: Open Codex IDE`
- `Ralphdex: Run Single Iteration`
- `Ralphdex: Run Loop`
- `Ralphdex: Run Multi-Agent Loop`
- `Ralphdex: Run Review Agent`
- `Ralphdex: Run Watchdog Agent`
- `Ralphdex: Run SCM Agent`
- `Ralphdex: Show Status`
- `Ralphdex: Open Failure Diagnosis`
- `Ralphdex: Auto-Recover Task`
- `Ralphdex: Skip Task`
- `Ralphdex: Open Latest Ralph Summary`
- `Ralphdex: Open Latest Provenance Bundle`
- `Ralphdex: Open Latest Prompt Evidence`
- `Ralphdex: Open Latest CLI Transcript`
- `Ralphdex: Apply Latest Task Decomposition Proposal`
- `Ralphdex: Resolve Stale Task Claim`
- `Ralphdex: Reveal Latest Provenance Bundle Directory`
- `Ralphdex: Clean Up Old Run Artifacts`
- `Ralphdex: Reset Runtime State`
- `Ralphdex: Focus Dashboard`
- `Ralphdex: Open Dashboard`
- `Ralphdex: Run Full Workflow`
- `Ralphdex: Open Latest Run Report`
- `Ralphdex: Open Latest Doctrine Proposal`
- `Ralphdex: Apply Latest Doctrine Proposal`
- `Ralphdex: Reject Latest Doctrine Proposal`
- `Ralphdex: Open PRD Wizard`
- `Ralphdex: Regenerate PRD`
- `Ralphdex: Requeue Recovery Task`
- `Ralphdex: Show Sidebar`
- `Ralphdex: Show Tasks`
- `Ralphdex: Set Provider Secret`
- `Ralphdex: Clear Provider Secret`
- `Ralphdex: Open RalphDex Settings`

`npm run check:docs` runs deterministic docs/architecture sanity checks. `npm run validate` is the authoritative compile + type-check + docs + test gate. `npm run test:activation` is the thin real Extension Development Host smoke path.

For the opt-in full pipeline smoke, run `npm run test:e2e-pipeline` with `RALPH_E2E=1`. That path seeds a temp workspace, drives `Ralphdex: Run Full Workflow` through the shipped scaffold, loop, review, and SCM commands with a deterministic fake Codex executable, and asserts the resulting pipeline artifact records a PR URL. Without `RALPH_E2E=1`, the script exits with a skip message so it stays out of the default validation gate.

## Configuration

All settings are under the `ralphCodex.*` namespace in VS Code settings (`Ctrl+,` / `Cmd+,`).

This section lists **core settings** only. Source of truth for the full settings surface (including defaults and enum values) is `package.json` (`contributes.configuration.properties`).

**Provider**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.cliProvider` | `"claude"` | CLI backend: `codex`, `claude`, `copilot`, `copilot-foundry`, `azure-foundry`, or `gemini` |
| `ralphCodex.codexCommandPath` | `"codex"` | Codex CLI executable path or name; on Windows, bare command names also resolve `codex.cmd`/`codex.bat` wrappers |
| `ralphCodex.claudeCommandPath` | `"claude"` | Claude CLI executable path or name |
| `ralphCodex.copilotCommandPath` | `"copilot"` | Copilot CLI executable path or name |

**Azure-backed providers** *(maturity: beta)* — both `copilot-foundry` and `azure-foundry` are functional and available for use. They require grouped settings and secure auth references instead of literal keys in `settings.json`:

- `copilot-foundry` runs GitHub Copilot CLI against Azure OpenAI BYOK while preserving Copilot's tool and harness behavior.
- `azure-foundry` uses RalphDex's direct HTTPS Azure path via the Azure AI Foundry inference API.
- Supported auth sources for both are `az-bearer` (Azure AD / Managed Identity), `env-api-key` (environment variable), and `vscode-secret` (VS Code SecretStorage).
- Literal API keys in `ralphCodex.*` settings are not supported.
- Use `Ralphdex: Set Provider Secret` and `Ralphdex: Clear Provider Secret` for `vscode-secret` flows.
- For detailed configuration, see [docs/workflows.md — Azure AI Foundry Provider](docs/workflows.md#azure-ai-foundry-provider).

**Agent identity**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.agentId` | `"default"` | Identity written into claims and artifacts; set uniquely per concurrent loop |
| `ralphCodex.agentRole` | `"implementer"` | Role contract for iteration selection/policy (`build`, `review`, `watchdog`, `scm`, `planner`, `implementer`, `reviewer`) |
| `ralphCodex.agentCount` | `2` | Number of concurrent agent instances |

**Loop behavior**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.ralphIterationCap` | `20` | Maximum CLI iterations for the loop command (operator presets can raise this) |
| `ralphCodex.autonomyMode` | `"autonomous"` | `supervised` or `autonomous` |
| `ralphCodex.planningPass` | `{"enabled":true,"mode":"inline"}` | Pre-execution planning pass defaults used by iteration commands |
| `ralphCodex.stopOnHumanReviewNeeded` | `true` | Stop the loop on `needs_human_review` classification |
| `ralphCodex.autoReplenishBacklog` | `true` | Continue into backlog replenishment when no actionable task remains |
| `ralphCodex.autoApplyRemediation` | `["decompose_task","mark_blocked"]` | Remediation actions to auto-apply |
| `ralphCodex.taskReadinessGate` | `"auto"` | Planning readiness gate mode: `off`, `warn`, `auto`, or `strict` |
| `ralphCodex.noProgressThreshold` | `2` | Consecutive no-progress iterations before stopping |
| `ralphCodex.repeatedFailureThreshold` | `2` | Consecutive identical failure classifications before stopping |

`autonomous` is the shipped default. Switch to `supervised` when you want Ralph to stop forcing backlog replenishment and remediation auto-apply at runtime.

**Execution**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.model` | `"claude-sonnet-4-6"` | Default model for CLI runs |
| `ralphCodex.claudeMaxTurns` | `125` | Maximum agentic turns per Claude CLI invocation |
| `ralphCodex.claudePermissionMode` | `"default"` | Claude CLI permission mode |
| `ralphCodex.copilotApprovalMode` | `"allow-tools-only"` | Approval posture for Copilot CLI runs |
| `ralphCodex.reasoningEffort` | `"medium"` | Reasoning effort for Codex CLI runs |
| `ralphCodex.cliExecutionTimeoutMs` | `0` | CLI iteration timeout in ms; `0` disables the timeout |

Permissive provider modes (`dangerously-skip-permissions`, `allow-all`) are available but should be operator-selected, not assumed as workspace defaults.

**Verification**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.verifierModes` | `["validationCommand","gitDiff","taskState"]` | Verifier layers to run after each iteration |
| `ralphCodex.validationCommandOverride` | `""` | Shell command to use as the validator instead of inferred workspace commands |

**SCM**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.gitCheckpointMode` | `"snapshotAndDiff"` | Git safety artifacts: `off`, `snapshot`, or `snapshotAndDiff` |
| `ralphCodex.scmStrategy` | `"none"` | SCM automation: `none`, `commit-on-done`, or `branch-per-task` |
| `ralphCodex.scmPrOnParentDone` | `false` | Open a GitHub PR when `branch-per-task` completes a parent task |

**Prompt**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.promptIncludeVerifierFeedback` | `true` | Include prior iteration and verifier feedback in the next prompt |
| `ralphCodex.promptPriorContextBudget` | `8` | Maximum prior-iteration bullet lines carried into the next prompt |
| `ralphCodex.promptBudgetProfile` | `"codex"` | Prompt-budget policy: `codex`, `claude`, or `custom` |
| `ralphCodex.promptTemplateDirectory` | `""` | Path to custom prompt templates; empty uses bundled templates |
| `ralphCodex.clipboardAutoCopy` | `true` | Copy generated prompts to clipboard automatically |

**Multi-agent and pipeline**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.memoryStrategy` | `"sliding-window"` | Iteration memory strategy: `verbatim`, `sliding-window`, or `summary` |

**Model tiering**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.enableModelTiering` | `true` | Convenience toggle for `ralphCodex.modelTiering.enabled` |
| `ralphCodex.modelTiering.simpleThreshold` | `3` | Score strictly below this threshold maps to the simple tier |
| `ralphCodex.modelTiering.complexThreshold` | `6` | Score at or above this threshold maps to the complex tier |

**Artifacts**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.artifactRetentionPath` | `".ralph/artifacts"` | Directory for per-iteration artifacts |
| `ralphCodex.generatedArtifactRetentionCount` | `25` | Number of newest generated artifact directories to keep |
| `ralphCodex.provenanceBundleRetentionCount` | `25` | Number of newest provenance bundle directories to keep |

**Handoff**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.preferredHandoffMode` | `"clipboard"` | Prompt handoff mode: `ideCommand`, `clipboard`, or `cliExec` |
| `ralphCodex.openSidebarCommandId` | `"claude.openSidebar"` | VS Code command to open the active AI chat surface |
| `ralphCodex.newChatCommandId` | `"claude.newChat"` | VS Code command to start a new AI chat session |

## Document Map

- [AGENTS.md](AGENTS.md): concise repo operating rules and authoritative map
- [docs/architecture.md](docs/architecture.md): module boundaries and end-to-end flow
- [docs/workflows.md](docs/workflows.md): operator workflows for prompt prep, single iterations, loops, and inspection
- [docs/testing.md](docs/testing.md): scripts, coverage, and runtime notes
- [docs/invariants.md](docs/invariants.md): state, task, and artifact invariants
- [docs/provenance.md](docs/provenance.md): plan/prompt/invocation/run trust chain
- [docs/security.md](docs/security.md): security and data-handling boundary for harness use
- [docs/verifier.md](docs/verifier.md): verifier modes, classification rules, and stop semantics
- [docs/boundaries.md](docs/boundaries.md): explicit non-goals and trust limits
- [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md): historical record of the 2026-03-17 multi-agent readiness milestone
- [docs/prompt-calibration.md](docs/prompt-calibration.md): token target derivation, recalibration procedure, and reasoning effort overhead
- [docs/release-workflow.md](docs/release-workflow.md): version bump, packaging, and VS Code Marketplace publish procedure
- [docs/dogfooding-runbook.md](docs/dogfooding-runbook.md): manual live-provider runbook, evidence contract, redaction rules, and pass/fail criteria
- [docs/failure-recovery.md](docs/failure-recovery.md): failure category taxonomy, recovery playbooks, and diagnostic cost
- [docs/ui-state-fixtures.md](docs/ui-state-fixtures.md): deterministic dashboard/sidebar fixture catalogue for UI review and regression checks
- [docs/ui-evidence-checklist.md](docs/ui-evidence-checklist.md): required UI evidence checklist for user-facing UI changes

## Product Notes

- Prompt templates live in `prompt-templates/` and are selected deterministically.
- Set `ralphCodex.inspectionRootOverride` when an umbrella workspace contains multiple plausible child repos.
- CLI runs default `ralphCodex.reasoningEffort` to `medium`. Raise it to `high` only as an explicit escalation for architecture or hard debugging work.
- Ralphdex ships both sequential CLI loops and built-in multi-agent/pipeline orchestration flows; see [docs/workflows.md](docs/workflows.md) for operator paths and [docs/boundaries.md](docs/boundaries.md) for explicit guardrails.
- For manual prompt-budget recalibration, run `npm run prompt:calibrate -- <workspace-path>` and use [docs/prompt-calibration.md](docs/prompt-calibration.md) as the procedure.
