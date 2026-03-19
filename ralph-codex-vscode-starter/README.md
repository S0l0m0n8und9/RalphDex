# Ralph Codex Workbench

This document is the implementation README for the VS Code extension source under `ralph-codex-vscode-starter/`. For the public repository landing page, setup summary, license, and repo structure, start with the root `README.md`.

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, prompts, run artifacts, verifier output, and provenance evidence on disk under `.ralph/` so a new Codex session can resume from inspectable state instead of chat history.

The extension has two execution paths:

- prepare a prompt for IDE handoff through clipboard plus configurable VS Code command IDs
- run deterministic `codex exec` iterations with preflight checks, verifier passes, stable artifacts, and explicit stop reasons

## Getting Started

For a fresh clone that does not have a `.ralph/` directory yet, start with `Ralph Codex: Initialize Workspace`. The command creates:

- `.ralph/prd.md` with a placeholder objective comment
- `.ralph/tasks.json` with version `2` and an empty `tasks` array
- `.ralph/progress.md` as an empty progress log
- `.ralph/.gitignore` with the standard Ralph runtime ignores when that file is not already present

The initializer refuses to run when `.ralph/prd.md` already exists so it does not overwrite an active Ralph workspace. After initialization, replace the placeholder comment in `.ralph/prd.md` with the real objective before preparing prompts or running CLI iterations.

## Quick Start

1. Run `npm install`.
2. Run `npm run compile`.
3. Open the repo in VS Code and start the Extension Development Host with `F5`.
4. Use `Ralph Codex: Show Status` to inspect the current workspace state.
5. Use `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop` depending on the workflow you want.

For a distributable local build, run `npm run package` from the extension root and then install the generated `ralph-codex-workbench-<version>.vsix` through `Extensions: Install from VSIX...` or `code --install-extension`. The package now ships a curated runtime payload plus the bundled license and operator docs instead of the full development tree. The full operator flow lives in [docs/workflows.md](docs/workflows.md).

## Durable Files

Ralph keeps its durable state in the workspace:

- objective: `.ralph/prd.md`
- progress: `.ralph/progress.md`
- tasks: `.ralph/tasks.json`
- runtime state: `.ralph/state.json`
- prompts: `.ralph/prompts/`
- transcripts: `.ralph/runs/`
- artifacts and latest pointers: `.ralph/artifacts/`
- logs: `.ralph/logs/extension.log`

The durable task model is explicit and flat. See [docs/invariants.md](docs/invariants.md) for the version-2 task schema and control-plane rules.

## Artifact Lifecycle

Ralph separates durable source-of-truth files from generated runtime evidence:

- durable operator state: `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, `.ralph/state.json`
- generated execution evidence: prompts in `.ralph/prompts/`, transcripts and last messages in `.ralph/runs/`, iteration artifacts in `.ralph/artifacts/iteration-###/`, and provenance bundles in `.ralph/artifacts/runs/`
- stable latest entry points: `latest-summary.md`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-summary.md`, and related latest-pointer artifacts under `.ralph/artifacts/`

During long-running loops, Ralph keeps the newest generated prompt, run, iteration, and provenance artifacts first, then adds any older artifacts that are still protected by `.ralph/state.json` or the stable latest pointers. `Ralph Codex: Cleanup Runtime Artifacts` is the safe maintenance path: it may delete older generated prompts, transcripts, last-message files, iteration directories, older provenance bundles, and logs, but it preserves durable Ralph state and the latest evidence surfaces needed for inspection. `Ralph Codex: Reset Runtime State` is broader: it clears generated runtime state and artifacts while still preserving the durable PRD, progress log, and task file.

If a latest human-readable summary surface is deleted manually, Ralph attempts to repair it from the surviving latest JSON record before treating it as stale. `Ralph Codex: Show Status` reports repaired or still-stale latest surfaces, and the open/reveal commands give the main long-loop inspection path: latest summary, latest provenance bundle, latest prompt evidence, latest CLI transcript, and latest provenance bundle directory. See [docs/workflows.md](docs/workflows.md) for the operator flow and [docs/provenance.md](docs/provenance.md) for the trust chain behind those artifacts.

When repeated-stop remediation proposes a bounded task decomposition, Ralph still defaults to propose-only behavior. Use `Ralph Codex: Apply Latest Task Decomposition Proposal` only after you have reviewed the persisted remediation artifact and want Ralph to add the proposed child tasks to `.ralph/tasks.json` and gate the parent task behind them.

For long-loop maintenance, use this quick distinction:

- keep working and inspect: use the stable latest files under `.ralph/artifacts/` plus `Show Status`, `Open Latest Ralph Summary`, `Open Latest Prompt Evidence`, `Open Latest CLI Transcript`, and `Open Latest Provenance Bundle`
- reclaim disk without breaking continuity: use `Cleanup Runtime Artifacts`, which preserves `.ralph/state.json`, the durable PRD/progress/tasks, and the latest evidence entry points while pruning older generated prompts, run artifacts, iteration directories, provenance bundles, and logs
- start fresh intentionally: use `Reset Runtime State`, which removes generated runtime artifacts and loop state but still preserves `.ralph/prd.md`, `.ralph/progress.md`, and `.ralph/tasks.json`

Recovery is intentionally narrow:

- Ralph can rebuild `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` from their surviving latest JSON records
- Ralph can fall back from a missing CLI transcript to the latest last-message artifact when the latest CLI invocation still points at it
- Ralph does not recreate missing latest JSON pointers, prompt files, transcript files, or provenance bundle directories; those surfaces are reported as stale instead

For day-to-day loop inspection, use the commands in this order:

1. `Ralph Codex: Show Status` for the selected task, recent history, retention windows, and repaired or stale latest surfaces.
2. `Ralph Codex: Open Latest Ralph Summary` for the newest outcome summary.
3. `Ralph Codex: Open Latest Prompt Evidence` and `Ralph Codex: Open Latest CLI Transcript` when you need to inspect what Ralph prepared and what Codex returned.
4. `Ralph Codex: Open Latest Provenance Bundle` or `Ralph Codex: Reveal Latest Provenance Bundle Directory` when you need the full persisted proof set.

## Commands

The extension contributes these commands:

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

`npm run check:docs` runs deterministic docs/architecture sanity checks for required files, headings, links, and a few cheap code-doc alignment rules. `npm run validate` is the authoritative compile + type-check + docs + test gate. `npm run test:activation` is the thin real Extension Development Host smoke path.

For manual prompt-budget recalibration, run `npm run prompt:calibrate -- <workspace-path>` from the extension root and use [docs/prompt-calibration.md](docs/prompt-calibration.md) as the procedure.

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

## Product Notes

- Prompt templates live in `prompt-templates/` and are selected deterministically.
- Prompt generation uses a deterministic shallow repo scan that inspects the workspace root and, when needed, a better-scoring immediate child repo root. The exact structured repo-context snapshot used for rendering is persisted in `prompt-evidence.json`.
- Set `ralphCodex.inspectionRootOverride` when an umbrella workspace contains multiple plausible child repos and you want Ralph to inspect, execute, and verify from a specific directory inside the workspace.
- CLI runs default `ralphCodex.reasoningEffort` to `medium` to control token burn. Raise it to `high` only as an explicit escalation for architecture, hard debugging, or remediation-heavy work; the chosen value is recorded in the CLI transcript and iteration integrity artifacts.
- When scan selection picks a nested child repo, Ralph keeps `.ralph/` under the workspace root but records an explicit root policy and runs `codex exec` plus CLI verifiers from the selected child root instead of requiring manual `cd ... && ...` prefixes.
- The shipped automation surface is still a sequential single-agent loop, and multi-agent orchestration remains a planned milestone with explicit acceptance criteria in [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md).
- The control plane persists `prompt-evidence.json`, `execution-plan.json`, verifier artifacts, and run-level provenance bundles so the latest prepared or executed attempt remains inspectable.
- Generated artifact cleanup stays deterministic and file-backed: Ralph keeps the newest configured prompt/run/iteration artifacts by parsed iteration first, then adds any older state-linked or latest-pointer-protected entries without evicting the newer retained window.
- CLI runs can prove prompt integrity up to the `codex exec` boundary. IDE handoff only proves the prepared prompt bundle.

See [docs/workflows.md](docs/workflows.md) for command-by-command behavior and [docs/provenance.md](docs/provenance.md) for the trust model.
