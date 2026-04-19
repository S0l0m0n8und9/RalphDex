# Ralphdex

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/s0l0m0n8und9.ralphdex?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

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

For a local package build, run `npm run package` from the repo root and install the generated `ralphdex-<version>.vsix` via `Extensions: Install from VSIX...` or `code --install-extension ./ralphdex-<version>.vsix`. `npm run publish:dry-run` currently aliases that same packaging check. See [docs/release-workflow.md](docs/release-workflow.md) for the full package and Marketplace publish flow, including explicit `vsce publish --dry-run` usage.

### Post-Install Tour

The Marketplace listing should match what you see after install:

1. The Ralphdex activity-bar icon appears in VS Code.
2. `Ralphdex: Show Status` opens the dashboard webview with the current task, pipeline, failure, and artifact snapshot.
3. The Ralphdex sidebar exposes the Dashboard plus the Tasks tree for durable `.ralph/` state, including a compact epic-to-task seeding form that uses the same backlog append pipeline as the command palette.
4. `Ralphdex: Initialize Workspace` scaffolds `.ralph/prd.md`, `.ralph/tasks.json`, and `.ralph/progress.md` for a fresh repo.

For a quick release-candidate demo pass, install the Marketplace build or local VSIX, run `Ralphdex: Show Status`, confirm the dashboard renders, then run `Ralphdex: Initialize Workspace` in a scratch folder and verify the `.ralph/` files are created.

## Release Surface

Ralphdex ships to the VS Code Marketplace under the extension identifier `s0l0m0n8und9.ralphdex`. The maintained release assets for operators are:

- the Marketplace listing for install and update discovery
- the repo-root `README.md` for install, first-run, and command guidance
- [docs/release-workflow.md](docs/release-workflow.md) for version bump, packaging, and publish steps
- [CHANGELOG.md](CHANGELOG.md) for operator-visible release notes

## CLI Shim

Use `node out/shim/main.js <workspace-path>` to run one Ralph CLI iteration outside the VS Code extension host. The shim reads `.ralph-config.json` plus `RALPH_CODEX_*` environment overrides from the target workspace, streams Ralph output to stdout, and stays out of the packaged VSIX payload.

## Getting Started

For a fresh clone, start by installing dependencies and running the validation gate:

1. Install Node.js 20 or newer and VS Code 1.95 or newer.
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
6. Use `Ralphdex: Prepare Prompt`, `Ralphdex: Open Codex IDE`, `Ralphdex: Run CLI Iteration`, or `Ralphdex: Run CLI Loop` depending on the workflow you want.

For a fresh workspace that does not have a `.ralph/` directory, start with `Ralphdex: Initialize Workspace`. The command creates `.ralph/prd.md`, `.ralph/tasks.json`, `.ralph/progress.md`, and `.ralph/.gitignore`. After initialization, replace the placeholder in `.ralph/prd.md` with the real objective before preparing prompts.

Newly generated Ralph tasks now share one normalization and persistence pipeline across bootstrap commands, PRD generation, wizard writes, decomposition, remediation, and pipeline scaffolding. In practice that means generated tasks should keep the richest producer-supplied shape Ralph knows at creation time, including fields such as `notes`, `validation`, `acceptance`, `constraints`, `context`, `tier`, and any derived dependency or mode metadata when those values are available. A generated task may still omit some optional fields when the upstream producer genuinely lacked that information or when the canonical contract leaves the field absent by design. See [docs/invariants.md#normalized-task-contract](docs/invariants.md#normalized-task-contract) for the authoritative field-presence rules.

Use `Ralphdex: Add Task`, `Ralphdex: Seed Tasks from Feature Request`, or the dashboard/sidebar seeding form when you already have a stable PRD and need Ralph to append flat backlog tasks for one epic or feature request. Use `Ralphdex: Regenerate PRD` when the product objective or PRD structure itself needs to be rewritten first. The seeding path appends only flat version-2 backlog tasks through the shared normalization boundary; it does not create PRD structure or parent/child task hierarchies. Each seeding attempt also writes a durable artifact under `.ralph/artifacts/task-seeding/task-seeding-<timestamp>.json` so operators can inspect the request, provider launch metadata, generated task drafts, and warnings after the command returns.

The shipped dashboard and sidebar have one production ownership path: shared webview infrastructure lives under `src/webview/`, while the production renderers and VS Code surface adapters live under `src/ui/` in `panelHtml.ts`, `sidebarHtml.ts`, `dashboardPanel.ts`, and `sidebarViewProvider.ts`. The top-level `UXrefresh/` bundle is retained only as a reference-only prototype from the redesign phase and must not be treated as the live implementation.

To build a distributable local package: `npm run package` from the repo root, then install the generated VSIX through `Extensions: Install from VSIX...` or `code --install-extension ./ralphdex-<version>.vsix`.

## Durable Files

Ralph keeps its durable state in the workspace:

- objective: `.ralph/prd.md`
- progress: `.ralph/progress.md`
- tasks: `.ralph/tasks.json`
- runtime state: `.ralph/state.json`
- prompts: `.ralph/prompts/`
- transcripts: `.ralph/runs/`
- clean-stop session handoff notes: `.ralph/handoff/`
- role-to-role handoff contracts: `.ralph/handoffs/`
- artifacts and latest pointers: `.ralph/artifacts/`
- logs: `.ralph/logs/extension.log`

The durable task model is explicit and flat. Newly created tasks also share one producer-facing normalization path, so AI-generated, wizard-reviewed, decomposed, remediated, and pipeline-scaffolded tasks all persist through the same version-2 contract instead of bespoke thinner write paths. See [docs/invariants.md](docs/invariants.md) for the task schema, field-presence rules, and control-plane invariants.

## Artifact Lifecycle

Ralph separates durable source-of-truth files from generated runtime evidence:

- durable operator state: `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, `.ralph/state.json`
- generated execution evidence: prompts, transcripts, iteration artifacts, and provenance bundles under `.ralph/`
- stable latest entry points: `latest-summary.md`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, and related latest-pointer artifacts under `.ralph/artifacts/`

`Ralphdex: Cleanup Runtime Artifacts` is the safe maintenance path — it preserves durable Ralph state and the latest evidence surfaces while pruning older generated artifacts. `Ralphdex: Reset Runtime State` is broader: it clears generated runtime state while still preserving `.ralph/prd.md`, `.ralph/progress.md`, and `.ralph/tasks.json`.

For day-to-day loop inspection:

1. `Ralphdex: Show Status` opens or focuses the dashboard with a fresh snapshot covering the selected task, recent history, and stale surfaces. The raw status report is also written to the `Ralphdex` output channel for audit and debugging.
The dashboard `Work` tab and the sidebar both expose a first-class task-seeding form so operators can turn an epic or feature request into appended backlog tasks without leaving Ralphdex surfaces.
2. `Ralphdex: Open Latest Ralph Summary` for the newest outcome summary as a text artifact.
3. `Ralphdex: Open Latest Prompt Evidence` and `Ralphdex: Open Latest CLI Transcript` to inspect what Ralph prepared and what the provider returned.
4. `Ralphdex: Open Failure Diagnosis` to jump straight to the dashboard diagnostics tab for the selected task's persisted recovery context.
5. `Ralphdex: Open Latest Provenance Bundle` or `Ralphdex: Reveal Latest Provenance Bundle Directory` for the full persisted proof set.

Task-seeding artifacts are separate from iteration provenance. Successful and failed seeding attempts write durable evidence under `.ralph/artifacts/task-seeding/`, while the appended tasks themselves still persist only in `.ralph/tasks.json` through the shared version-2 task pipeline.

See [docs/workflows.md](docs/workflows.md) for the full operator flow and [docs/provenance.md](docs/provenance.md) for the trust model.

## Commands

Source of truth: `package.json` (`contributes.commands`) is authoritative for shipped command IDs and titles.

Current command surface:

- `Ralphdex: Initialize Workspace`
- `Ralphdex: Add Task`
- `Ralphdex: Seed Tasks from Feature Request`
- `Ralphdex: New Project Wizard`
- `Ralphdex: New Project`
- `Ralphdex: Switch Project`
- `Ralphdex: Prepare Prompt`
- `Ralphdex: Open Codex IDE`
- `Ralphdex: Run CLI Iteration`
- `Ralphdex: Run CLI Loop`
- `Ralphdex: Run Multi-Agent Loop`
- `Ralph: Run Review Agent`
- `Ralph: Run Watchdog Agent`
- `Ralph: Run SCM Agent`
- `Ralphdex: Show Status`
- `Ralphdex: Show Multi-Agent Status`
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
- `Ralphdex: Cleanup Runtime Artifacts`
- `Ralphdex: Reset Runtime State`
- `Ralphdex: Show Dashboard`
- `Ralphdex: Open Dashboard`
- `Ralphdex: Run Pipeline`
- `Ralphdex: Approve Human Review`
- `Ralphdex: Open Latest Pipeline Run`
- `Ralphdex: Resume Pipeline`
- `Ralphdex: Construct Recommended Skills`
- `Ralphdex: Regenerate PRD`
- `Ralphdex: Requeue Dead-Letter Task`
- `Ralphdex: Show Sidebar`
- `Ralphdex: Show Tasks`
- `Ralphdex: Set Provider Secret`
- `Ralphdex: Clear Provider Secret`

`npm run check:docs` runs deterministic docs/architecture sanity checks. `npm run validate` is the authoritative compile + type-check + docs + test gate. `npm run test:activation` is the thin real Extension Development Host smoke path.

For the opt-in full pipeline smoke, run `npm run test:e2e-pipeline` with `RALPH_E2E=1`. That path seeds a temp workspace, drives `Ralphdex: Run Pipeline` through the shipped scaffold, loop, review, and SCM commands with a deterministic fake Codex executable, and asserts the resulting pipeline artifact records a PR URL. Without `RALPH_E2E=1`, the script exits with a skip message so it stays out of the default validation gate.

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

Azure-backed providers use grouped settings and secure auth references instead of literal keys in `settings.json`:

- `copilot-foundry` runs GitHub Copilot CLI against Azure OpenAI BYOK while preserving Copilot's tool and harness behavior.
- `azure-foundry` uses RalphDex's direct HTTPS Azure path.
- Supported auth sources for both are `az-bearer`, `env-api-key`, and `vscode-secret`.
- Literal API keys in `ralphCodex.*` settings are not supported.
- Use `Ralphdex: Set Provider Secret` and `Ralphdex: Clear Provider Secret` for `vscode-secret` flows.

**Agent identity**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.agentId` | `"default"` | Identity written into claims and artifacts; set uniquely per concurrent loop |
| `ralphCodex.agentRole` | `"implementer"` | Role contract for iteration selection/policy (`build`, `review`, `watchdog`, `scm`, `planner`, `implementer`, `reviewer`) |
| `ralphCodex.agentCount` | `1` | Number of concurrent agent instances |

**Loop behavior**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.ralphIterationCap` | `5` | Maximum CLI iterations for the loop command (operator presets can raise this) |
| `ralphCodex.autonomyMode` | `"autonomous"` | `supervised` or `autonomous` |
| `ralphCodex.stopOnHumanReviewNeeded` | `true` | Stop the loop on `needs_human_review` classification |
| `ralphCodex.autoReplenishBacklog` | `true` | Continue into backlog replenishment when no actionable task remains |
| `ralphCodex.autoReloadOnControlPlaneChange` | `false` | Reload window automatically after `control_plane_reload_required` |
| `ralphCodex.autoApplyRemediation` | `["decompose_task"]` | Remediation actions to auto-apply |
| `ralphCodex.noProgressThreshold` | `2` | Consecutive no-progress iterations before stopping |
| `ralphCodex.repeatedFailureThreshold` | `2` | Consecutive identical failure classifications before stopping |

**Execution**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.model` | `"claude-sonnet-4-6"` | Default model for CLI runs |
| `ralphCodex.claudeMaxTurns` | `125` | Maximum agentic turns per Claude CLI invocation |
| `ralphCodex.claudePermissionMode` | `"dangerously-skip-permissions"` | Claude CLI permission mode for unattended runs |
| `ralphCodex.reasoningEffort` | `"medium"` | Reasoning effort for Codex CLI runs |
| `ralphCodex.cliExecutionTimeoutMs` | `0` | CLI iteration timeout in ms; `0` disables the timeout |

**Verification**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.verifierModes` | `["validationCommand","gitDiff","taskState"]` | Verifier layers to run after each iteration |
| `ralphCodex.validationCommandOverride` | `""` | Shell command to use as the validator instead of inferred workspace commands |

**SCM**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.gitCheckpointMode` | `"snapshotAndDiff"` | Git safety artifacts: `off`, `snapshot`, or `snapshotAndDiff` |
| `ralphCodex.scmStrategy` | `"commit-on-done"` | SCM automation: `none`, `commit-on-done`, or `branch-per-task` |
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
| `ralphCodex.pipelineHumanGates` | `false` | Pause pipeline after review-agent pass until `Approve Human Review` |
| `ralphCodex.operatorMode` | _unset_ | Optional preset (`simple`, `multi-agent`, `hardcore`) that seeds multiple defaults |
| `ralphCodex.memoryStrategy` | `"verbatim"` | Iteration memory strategy: `verbatim`, `sliding-window`, or `summary` |

**Model tiering**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.enableModelTiering` | `true` | Convenience toggle for `ralphCodex.modelTiering.enabled` |
| `ralphCodex.modelTiering.simpleThreshold` | `2` | Score strictly below this threshold maps to the simple tier |
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
| `ralphCodex.preferredHandoffMode` | `"ideCommand"` | Prompt handoff mode: `ideCommand`, `clipboard`, or `cliExec` |
| `ralphCodex.openSidebarCommandId` | `"claude.openSidebar"` | VS Code command to open the active AI chat surface |
| `ralphCodex.newChatCommandId` | `"claude.newChat"` | VS Code command to start a new AI chat session |

## Document Map

- [AGENTS.md](AGENTS.md): concise repo operating rules and authoritative map
- [docs/architecture.md](docs/architecture.md): module boundaries and end-to-end flow
- [docs/workflows.md](docs/workflows.md): operator workflows for prompt prep, single iterations, loops, and inspection
- [docs/testing.md](docs/testing.md): scripts, coverage, and runtime notes
- [docs/invariants.md](docs/invariants.md): state, task, and artifact invariants
- [docs/provenance.md](docs/provenance.md): plan/prompt/invocation/run trust chain
- [docs/verifier.md](docs/verifier.md): verifier modes, classification rules, and stop semantics
- [docs/boundaries.md](docs/boundaries.md): explicit non-goals and trust limits
- [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md): historical record of the 2026-03-17 multi-agent readiness milestone
- [docs/prompt-calibration.md](docs/prompt-calibration.md): token target derivation, recalibration procedure, and reasoning effort overhead
- [docs/release-workflow.md](docs/release-workflow.md): version bump, packaging, and VS Code Marketplace publish procedure
- [docs/failure-recovery.md](docs/failure-recovery.md): failure category taxonomy, recovery playbooks, and diagnostic cost

## Product Notes

- Prompt templates live in `prompt-templates/` and are selected deterministically.
- Set `ralphCodex.inspectionRootOverride` when an umbrella workspace contains multiple plausible child repos.
- CLI runs default `ralphCodex.reasoningEffort` to `medium`. Raise it to `high` only as an explicit escalation for architecture or hard debugging work.
- Ralphdex ships both sequential CLI loops and built-in multi-agent/pipeline orchestration flows; see [docs/workflows.md](docs/workflows.md) for operator paths and [docs/boundaries.md](docs/boundaries.md) for explicit guardrails.
- For manual prompt-budget recalibration, run `npm run prompt:calibrate -- <workspace-path>` and use [docs/prompt-calibration.md](docs/prompt-calibration.md) as the procedure.
