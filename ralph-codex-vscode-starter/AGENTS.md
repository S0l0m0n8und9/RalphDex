# AGENTS.md

## Purpose

Ralph Codex Workbench is a VS Code extension that:

- builds Ralph prompts from durable workspace files
- hands prepared prompts to Codex through clipboard plus configurable VS Code command IDs
- runs controlled `codex exec` iterations with deterministic verification, provenance, and stop behavior

## Working Rules

- Edit `src/` and `test/`. Treat `out/`, `out-test/`, and packaged `.vsix` files as generated artifacts.
- Keep `AGENTS.md` thin: AGENTS.md is a routing/control document, not the place for detailed durable rules.
- `package.json` is authoritative for commands, settings, activation events, scripts, and runtime expectations.
- Keep docs aligned with code in the same change.
- Prefer updating the focused doc that owns a rule instead of restating that rule elsewhere.

## Authoritative Doc Map

- [README.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/README.md): product overview, quick start, and doc index
- [docs/architecture.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md): module boundaries and end-to-end flow
- [docs/workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md): command-driven operator workflows
- [docs/testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md): validation gate and test coverage
- [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md): control-plane, task-schema, and artifact-model invariants
- [docs/provenance.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md): prompt/plan/invocation/run trust chain
- [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md): verifier modes, outcome classes, and stop implications
- [docs/boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md): explicit non-goals, trust limits, and Codex boundaries

## Code Owners For Behavior

- `src/commands/registerCommands.ts`: command wiring and user-visible status/reporting behavior
- `src/prompt/promptBuilder.ts`: prompt-kind selection, template rendering, and prompt evidence
- `src/ralph/iterationEngine.ts`: loop orchestration and phase order
- `src/ralph/preflight.ts`: deterministic preflight diagnostics and blocking behavior
- `src/ralph/taskFile.ts`: task schema, normalization, and deterministic selection
- `src/ralph/verifier.ts`: verifier behavior and git-aware summaries
- `src/ralph/loopLogic.ts`: outcome classification and stop decisions
- `src/ralph/integrity.ts`: hashing and execution-integrity helpers
- `src/ralph/artifactStore.ts`: artifact layout, latest pointers, run bundles, and retention cleanup

## Command And Validation Entry Points

User-facing commands come from `package.json` and `src/commands/registerCommands.ts`:

- `Ralph Codex: Prepare Prompt`
- `Ralph Codex: Open Codex IDE`
- `Ralph Codex: Run CLI Iteration`
- `Ralph Codex: Run CLI Loop`
- `Ralph Codex: Show Status`
- `Ralph Codex: Open Latest Ralph Summary`
- `Ralph Codex: Open Latest Provenance Bundle`
- `Ralph Codex: Reveal Latest Provenance Bundle Directory`
- `Ralph Codex: Reset Runtime State`

Validation entry points:

- `npm run check:docs`: deterministic docs/architecture sanity checks for required files, headings, links, and ownership guardrails
- `npm run validate`: authoritative compile + type-check + test gate
- `npm run test:activation`: thin real Extension Development Host smoke path

## Brief Codex Boundaries

- IDE handoff is clipboard plus `vscode.commands.executeCommand(...)`.
- Scripted automation is `codex exec`.
- Do not invent direct composer injection or unsupported Codex IDE APIs.
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI.
- CLI runs can prove prepared-and-executed prompt integrity; IDE handoff only proves the prepared prompt bundle.
