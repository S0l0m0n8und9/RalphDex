# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, prompts, run artifacts, verifier output, and provenance evidence on disk under `.ralph/` so a new Codex session can resume from inspectable state instead of chat history.

The extension has two execution paths:

- prepare a prompt for IDE handoff through clipboard plus configurable VS Code command IDs
- run deterministic `codex exec` iterations with preflight checks, verifier passes, stable artifacts, and explicit stop reasons

## Quick Start

1. Run `npm install`.
2. Run `npm run compile`.
3. Open the repo in VS Code and start the Extension Development Host with `F5`.
4. Use `Ralph Codex: Show Status` to inspect the current workspace state.
5. Use `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop` depending on the workflow you want.

For a distributable local build, run `npm run package` from the extension root and then install the generated `ralph-codex-workbench-<version>.vsix` through `Extensions: Install from VSIX...` or `code --install-extension`. The full operator flow lives in [docs/workflows.md](docs/workflows.md).

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

## Commands

The extension contributes these commands:

- `Ralph Codex: Prepare Prompt`
- `Ralph Codex: Open Codex IDE`
- `Ralph Codex: Run CLI Iteration`
- `Ralph Codex: Run CLI Loop`
- `Ralph Codex: Show Status`
- `Ralph Codex: Open Latest Ralph Summary`
- `Ralph Codex: Open Latest Provenance Bundle`
- `Ralph Codex: Reveal Latest Provenance Bundle Directory`
- `Ralph Codex: Reset Runtime State`

`npm run check:docs` runs deterministic docs/architecture sanity checks for required files, headings, links, and a few cheap code-doc alignment rules. `npm run validate` is the authoritative compile + type-check + docs + test gate. `npm run test:activation` is the thin real Extension Development Host smoke path.

## Document Map

- [AGENTS.md](AGENTS.md): concise repo operating rules and authoritative map
- [docs/architecture.md](docs/architecture.md): module boundaries and end-to-end flow
- [docs/workflows.md](docs/workflows.md): operator workflows for prompt prep, single iterations, loops, and inspection
- [docs/testing.md](docs/testing.md): scripts, coverage, and runtime notes
- [docs/invariants.md](docs/invariants.md): state, task, and artifact invariants
- [docs/provenance.md](docs/provenance.md): plan/prompt/invocation/run trust chain
- [docs/verifier.md](docs/verifier.md): verifier modes, classification rules, and stop semantics
- [docs/boundaries.md](docs/boundaries.md): explicit non-goals and trust limits

## Product Notes

- Prompt templates live in `prompt-templates/` and are selected deterministically.
- Prompt generation uses a deterministic shallow repo scan that inspects the workspace root and, when needed, a better-scoring immediate child repo root. The exact structured repo-context snapshot used for rendering is persisted in `prompt-evidence.json`.
- Set `ralphCodex.inspectionRootOverride` when an umbrella workspace contains multiple plausible child repos and you want Ralph to inspect, execute, and verify from a specific directory inside the workspace.
- When scan selection picks a nested child repo, Ralph keeps `.ralph/` under the workspace root but records an explicit root policy and runs `codex exec` plus CLI verifiers from the selected child root instead of requiring manual `cd ... && ...` prefixes.
- The shipped automation surface is still a sequential single-agent loop. Broad multi-agent orchestration stays deferred until nested root selection, execution, and verification behavior remains deterministic, test-backed, and visible in durable evidence.
- The control plane persists `prompt-evidence.json`, `execution-plan.json`, verifier artifacts, and run-level provenance bundles so the latest prepared or executed attempt remains inspectable.
- CLI runs can prove prompt integrity up to the `codex exec` boundary. IDE handoff only proves the prepared prompt bundle.

See [docs/workflows.md](docs/workflows.md) for command-by-command behavior and [docs/provenance.md](docs/provenance.md) for the trust model.
