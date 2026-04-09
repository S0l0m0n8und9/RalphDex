# Ralph Codex Workbench

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/s0l0m0n8und9.ralph-codex-workbench?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralph-codex-workbench) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A VS Code extension for durable, file-backed agentic coding loops. Ralph keeps your objective, task graph, prompts, run artifacts, and provenance evidence on disk under `.ralph/` so any new Codex session can resume from inspectable state instead of chat history.

**Key capabilities:**

- **File-backed state** — PRD, progress log, and task graph survive across sessions without relying on chat history
- **Multiple CLI backends** — `codex exec`, Claude CLI (`claude -p`), and GitHub Copilot CLI
- **Deterministic loop control** — preflight checks, multi-verifier passes, explicit stop reasons, and bounded remediation
- **Full provenance** — every iteration writes prompt evidence, git snapshots, and a verifiable trust chain to disk
- **IDE handoff** — clipboard plus configurable VS Code command delivery for chat-first workflows

The extension has two execution paths:

- prepare a prompt for AI-IDE handoff through clipboard plus configurable VS Code command IDs
- run deterministic CLI iterations through the configured provider (`codex`, `claude`, or `copilot`) with preflight checks, verifier passes, stable artifacts, and explicit stop reasons

## Who This Is For

This project is for operators who want Codex work to survive across sessions as files instead of chat history, and for developers who want a VS Code extension that can prepare prompts, hand work off to Codex, and run deterministic `codex exec` loops with persisted evidence.

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralph-codex-workbench):

1. Open VS Code.
2. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **Ralph Codex Workbench**.
4. Click **Install**.

Alternatively, install from the command line:

```bash
code --install-extension s0l0m0n8und9.ralph-codex-workbench
```

Or install a local `.vsix` build via `Extensions: Install from VSIX...` in the VS Code command palette. See [docs/release-workflow.md](docs/release-workflow.md) for how to build and publish a new `.vsix`.

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
5. Use `Ralph Codex: Show Status` to inspect the current workspace state.
6. Use `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop` depending on the workflow you want.

For a fresh workspace that does not have a `.ralph/` directory, start with `Ralph Codex: Initialize Workspace`. The command creates `.ralph/prd.md`, `.ralph/tasks.json`, `.ralph/progress.md`, and `.ralph/.gitignore`. After initialization, replace the placeholder in `.ralph/prd.md` with the real objective before preparing prompts.

To build a distributable local package: `npm run package` then install the generated VSIX through `Extensions: Install from VSIX...` or `code --install-extension`.

## Durable Files

Ralph keeps its durable state in the workspace:

- objective: `.ralph/prd.md`
- progress: `.ralph/progress.md`
- tasks: `.ralph/tasks.json`
- runtime state: `.ralph/state.json`
- prompts: `.ralph/prompts/`
- transcripts: `.ralph/runs/`
- clean-stop session handoffs: `.ralph/handoff/`
- artifacts and latest pointers: `.ralph/artifacts/`
- logs: `.ralph/logs/extension.log`

The durable task model is explicit and flat. See [docs/invariants.md](docs/invariants.md) for the version-2 task schema and control-plane rules.

## Artifact Lifecycle

Ralph separates durable source-of-truth files from generated runtime evidence:

- durable operator state: `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, `.ralph/state.json`
- generated execution evidence: prompts, transcripts, iteration artifacts, and provenance bundles under `.ralph/`
- stable latest entry points: `latest-summary.md`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, and related latest-pointer artifacts under `.ralph/artifacts/`

`Ralph Codex: Cleanup Runtime Artifacts` is the safe maintenance path — it preserves durable Ralph state and the latest evidence surfaces while pruning older generated artifacts. `Ralph Codex: Reset Runtime State` is broader: it clears generated runtime state while still preserving `.ralph/prd.md`, `.ralph/progress.md`, and `.ralph/tasks.json`.

For day-to-day loop inspection:

1. `Ralph Codex: Show Status` for the selected task, recent history, and stale surfaces.
2. `Ralph Codex: Open Latest Ralph Summary` for the newest outcome summary.
3. `Ralph Codex: Open Latest Prompt Evidence` and `Ralph Codex: Open Latest CLI Transcript` to inspect what Ralph prepared and what Codex returned.
4. `Ralph Codex: Open Latest Provenance Bundle` or `Ralph Codex: Reveal Latest Provenance Bundle Directory` for the full persisted proof set.

See [docs/workflows.md](docs/workflows.md) for the full operator flow and [docs/provenance.md](docs/provenance.md) for the trust model.

## Commands

- `Ralph Codex: Initialize Workspace`
- `Ralph Codex: Prepare Prompt`
- `Ralph Codex: Open Codex IDE`
- `Ralph Codex: Run CLI Iteration`
- `Ralph Codex: Run CLI Loop`
- `Ralph Codex: Show Status`
- `Ralph Codex: Open Latest Ralph Summary`
- `Ralph Codex: Open Latest Provenance Bundle`
- `Ralph Codex: Open Latest Prompt Evidence`
- `Ralph Codex: Open Latest CLI Transcript`
- `Ralph Codex: Apply Latest Task Decomposition Proposal`
- `Ralph Codex: Resolve Stale Task Claim`
- `Ralph Codex: Reveal Latest Provenance Bundle Directory`
- `Ralph Codex: Cleanup Runtime Artifacts`
- `Ralph Codex: Reset Runtime State`
- `Ralph Codex: Run Pipeline`
- `Ralph Codex: Approve Human Review`
- `Ralph Codex: Open Latest Pipeline Run`
- `Ralph Codex: Resume Pipeline`

`npm run check:docs` runs deterministic docs/architecture sanity checks. `npm run validate` is the authoritative compile + type-check + docs + test gate. `npm run test:activation` is the thin real Extension Development Host smoke path.

## Configuration

All settings are under the `ralphCodex.*` namespace in VS Code settings (`Ctrl+,` / `Cmd+,`).

**Provider**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.cliProvider` | `"claude"` | CLI backend: `codex`, `claude`, or `copilot` |
| `ralphCodex.codexCommandPath` | `"codex"` | Codex CLI executable path or name |
| `ralphCodex.claudeCommandPath` | `"claude"` | Claude CLI executable path or name |
| `ralphCodex.copilotCommandPath` | `"copilot"` | Copilot CLI executable path or name |

**Agent identity**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.agentId` | `"default"` | Identity written into claims and artifacts; set uniquely per concurrent loop |
| `ralphCodex.agentRole` | `"build"` | Role contract: `build`, `review`, `watchdog`, or `scm` |
| `ralphCodex.agentCount` | `1` | Number of concurrent agent instances |

**Loop behavior**

| Setting | Default | Description |
|---|---|---|
| `ralphCodex.ralphIterationCap` | `5` | Maximum CLI iterations for the loop command |
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
| `ralphCodex.claudeMaxTurns` | `50` | Maximum agentic turns per Claude CLI invocation |
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
| `ralphCodex.promptBudgetProfile` | `"claude"` | Prompt-budget policy: `codex`, `claude`, or `custom` |
| `ralphCodex.promptTemplateDirectory` | `""` | Path to custom prompt templates; empty uses bundled templates |
| `ralphCodex.clipboardAutoCopy` | `true` | Copy generated prompts to clipboard automatically |

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
- [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md): acceptance criteria for lifting the single-agent deferral
- [docs/prompt-calibration.md](docs/prompt-calibration.md): token target derivation, recalibration procedure, and reasoning effort overhead
- [docs/release-workflow.md](docs/release-workflow.md): version bump, packaging, and VS Code Marketplace publish procedure

## Product Notes

- Prompt templates live in `prompt-templates/` and are selected deterministically.
- Set `ralphCodex.inspectionRootOverride` when an umbrella workspace contains multiple plausible child repos.
- CLI runs default `ralphCodex.reasoningEffort` to `medium`. Raise it to `high` only as an explicit escalation for architecture or hard debugging work.
- The shipped automation surface is a sequential single-agent loop; multi-agent orchestration is a planned milestone with explicit acceptance criteria in [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md).
- For manual prompt-budget recalibration, run `npm run prompt:calibrate -- <workspace-path>` and use [docs/prompt-calibration.md](docs/prompt-calibration.md) as the procedure.
