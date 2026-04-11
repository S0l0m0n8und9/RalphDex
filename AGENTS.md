# AGENTS.md

## Purpose

Ralphdex is a VS Code extension that:

- builds Ralph prompts from durable workspace files
- hands prepared prompts to Codex through clipboard plus configurable VS Code command IDs
- runs controlled `codex exec` iterations with deterministic verification, provenance, and stop behavior

## Working Rules

- Edit `src/` and `test/`. Treat `out/`, `out-test/`, and packaged `.vsix` files as generated artifacts.
- Keep `AGENTS.md` thin: AGENTS.md is a routing/control document, not the place for detailed durable rules.
- `package.json` is authoritative for commands, settings, activation events, scripts, and runtime expectations.
- Keep docs aligned with code in the same change; prefer the focused doc that owns a rule over restating it elsewhere.

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
- `src/ralph/pipeline.ts`: end-to-end pipeline orchestration — PRD-fragment intake, task decomposition, agent loop, review-agent pass, SCM/PR submission, human-review gate coordination, and pipeline-run provenance artifact

## Command And Validation Entry Points

User-facing commands come from `package.json` and `src/commands/registerCommands.ts`:

- `Ralphdex: Prepare Prompt`
- `Ralphdex: Open Codex IDE`
- `Ralphdex: Run CLI Iteration`
- `Ralphdex: Run CLI Loop`
- `Ralphdex: Run Multi-Agent Loop`
- `Ralphdex: Show Status`
- `Ralphdex: Show Multi-Agent Status`
- `Ralphdex: Open Latest Ralph Summary`
- `Ralphdex: Open Latest Provenance Bundle`
- `Ralphdex: Open Latest Prompt Evidence`
- `Ralphdex: Open Latest CLI Transcript`
- `Ralphdex: Apply Latest Task Decomposition Proposal`
- `Ralphdex: Resolve Stale Task Claim`
- `Ralphdex: Reveal Latest Provenance Bundle Directory`
- `Ralphdex: Cleanup Runtime Artifacts`
- `Ralphdex: Reset Runtime State`
- `Ralphdex: Run Pipeline`
- `Ralphdex: Approve Human Review`
- `Ralphdex: Open Latest Pipeline Run`
- `Ralphdex: Resume Pipeline`
- `Ralphdex: Construct Recommended Skills`
- `Ralphdex: Regenerate PRD`

Validation entry points:

- `npm run check:docs`: deterministic docs/architecture sanity checks for required files, headings, links, and ownership guardrails
- `npm run validate`: authoritative compile + type-check + test gate
- `npm run test:activation`: thin real Extension Development Host smoke path

## Operator Mode Presets

`ralphCodex.operatorMode` applies a curated setting bundle; individual overrides take precedence. `Show Status` reports each preset-affected setting's source (`preset` vs `explicit`). Source of truth: `src/config/readConfig.ts` (`OPERATOR_PRESETS`). See [docs/workflows.md](docs/workflows.md#operator-mode-presets) for the `hardcore` safety warning.

| Preset | Settings applied |
|---|---|
| `simple` | autonomyMode=supervised, agentCount=1, preferredHandoffMode=ideCommand, ralphIterationCap=20, stopOnHumanReviewNeeded=true, scmStrategy=none, memoryStrategy=verbatim, autoReplenishBacklog=false, pipelineHumanGates=true, autoReviewOnParentDone=false, autoWatchdogOnStall=false, autoApplyRemediation=[], modelTiering.enabled=false |
| `multi-agent` | autonomyMode=autonomous, agentCount=3, preferredHandoffMode=cliExec, ralphIterationCap=20, stopOnHumanReviewNeeded=true, scmStrategy=branch-per-task, memoryStrategy=sliding-window, autoReplenishBacklog=true, pipelineHumanGates=true, autoReviewOnParentDone=true, autoWatchdogOnStall=true, autoApplyRemediation=[], modelTiering.enabled=true |
| `hardcore` | autonomyMode=autonomous, agentCount=3, preferredHandoffMode=cliExec, ralphIterationCap=100, stopOnHumanReviewNeeded=false, scmStrategy=branch-per-task, memoryStrategy=summary, autoReplenishBacklog=true, pipelineHumanGates=false, autoReviewOnParentDone=true, autoWatchdogOnStall=true, autoApplyRemediation=decompose_task+mark_blocked, modelTiering.enabled=true |

## Task Schema

`tasks.json` tasks may include an optional `tier` field (`simple` | `medium` | `complex`). When present, it overrides runtime heuristic scoring and forces `selectModelForTask` to use the declared tier directly. Omit it to let dynamic scoring decide.

```json
{
  "id": "T5",
  "title": "Implement caching layer",
  "status": "todo",
  "tier": "complex"
}
```

Full schema rules and invariants live in [docs/invariants.md](docs/invariants.md#task-graph-invariants).

## Brief Codex Boundaries

- IDE handoff is clipboard plus `vscode.commands.executeCommand(...)`; do not invent direct composer injection or unsupported Codex IDE APIs.
- Scripted automation is `codex exec`.
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI.
- CLI runs can prove prepared-and-executed prompt integrity; IDE handoff only proves the prepared prompt bundle.
