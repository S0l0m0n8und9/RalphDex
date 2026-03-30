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

- [README.md](README.md): product overview, quick start, and doc index
- [docs/architecture.md](docs/architecture.md): module boundaries and end-to-end flow
- [docs/workflows.md](docs/workflows.md): command-driven operator workflows
- [docs/testing.md](docs/testing.md): validation gate and test coverage
- [docs/invariants.md](docs/invariants.md): control-plane, task-schema, and artifact-model invariants
- [docs/provenance.md](docs/provenance.md): prompt/plan/invocation/run trust chain
- [docs/verifier.md](docs/verifier.md): verifier modes, outcome classes, and stop implications
- [docs/boundaries.md](docs/boundaries.md): explicit non-goals, trust limits, and Codex boundaries
- [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md): acceptance criteria for lifting the single-agent deferral
- [docs/prompt-calibration.md](docs/prompt-calibration.md): token target derivation, recalibration procedure, and reasoning effort overhead

## Code Owners For Behavior

- `src/commands/registerCommands.ts`: command wiring and user-visible status/reporting behavior
- `src/prompt/promptBuilder.ts`: prompt-kind selection, template rendering, and prompt evidence
- `src/ralph/iterationEngine.ts`: loop orchestration and phase order
- `src/ralph/completionReportParser.ts`: completion-report parsing and structured extraction from Codex output
- `src/ralph/taskDecomposition.ts`: remediation artifact shaping, deterministic child-task decomposition, and auto-remediation application (mark_blocked, decompose_task)
- `src/ralph/cliOutputFormatter.ts`: claude stream-json line formatting for log output
- `src/ralph/reviewPolicy.ts`: review-agent file-change anomaly detection and policy enforcement
- `src/ralph/reconciliation.ts`: completion-report reconciliation into task-state updates and warnings
- `src/ralph/preflight.ts`: deterministic preflight diagnostics and blocking behavior
- `src/ralph/taskFile.ts`: task schema, normalization, and deterministic selection
- `src/ralph/verifier.ts`: verifier behavior and git-aware summaries
- `src/ralph/loopLogic.ts`: outcome classification and stop decisions
- `src/ralph/integrity.ts`: hashing and execution-integrity helpers
- `src/ralph/executionIntegrity.ts`: pre-execution integrity verification, integrity-failure error types, and stale-task detection
- `src/ralph/artifactStore.ts`: artifact layout, latest pointers, run bundles, and retention cleanup
- `src/codex/claudeCliProvider.ts`: claude -p execution strategy and transcript builder

## Command And Validation Entry Points

User-facing commands come from `package.json` and `src/commands/registerCommands.ts`:

- `Ralph Codex: Prepare Prompt`
- `Ralph Codex: Open Codex IDE`
- `Ralph Codex: Run CLI Iteration`
- `Ralph Codex: Run CLI Loop`
- `Ralph Codex: Run Multi-Agent Loop`
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
