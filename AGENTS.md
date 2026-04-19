# AGENTS.md

## Purpose

Ralphdex is a VS Code extension that:

- builds Ralph prompts from durable workspace files
- hands prepared prompts to AI IDE surfaces through clipboard plus configurable VS Code command IDs
- runs controlled CLI iterations (`codex`, `claude`, `copilot`, `copilot-foundry`, `azure-foundry`, `gemini`) with deterministic verification, provenance, and stop behavior

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
- [docs/boundaries.md](docs/boundaries.md): explicit non-goals, trust limits, and orchestration boundaries
- [docs/multi-agent-readiness.md](docs/multi-agent-readiness.md): historical acceptance record for the multi-agent readiness milestone
- [docs/prompt-calibration.md](docs/prompt-calibration.md): token target derivation, recalibration procedure, and reasoning effort overhead

## Code Owners For Behavior

- `src/commands/registerCommands.ts`: command wiring and user-visible status/reporting behavior
- `src/prompt/promptBuilder.ts`: prompt-kind selection, template rendering, and prompt evidence
- `src/ralph/iterationEngine.ts`: loop orchestration and phase order
- `src/ralph/completionReportParser.ts`: completion-report parsing and structured extraction from Codex output
- `src/ralph/taskDecomposition.ts`: remediation artifact shaping, deterministic child-task decomposition, and auto-remediation application (mark_blocked, decompose_task)
- `src/ralph/taskCreation.ts`: shared producer-facing task-creation pipeline for append, replace, and child-task persistence
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
- `src/ralph/orchestrationSupervisor.ts`: durable graph-backed orchestration — graph/state schema, single-transition-per-write advanceState, evidence-gated transitions, and orchestration artifact persistence
- `src/ralph/handoffManager.ts`: durable handoff contract lifecycle — propose/accept/reject/expire state machine, role-gated acceptance, contested-status detection, and atomic file-backed persistence under `.ralph/handoffs/`
- `src/webview/`: reusable webview infrastructure — WebviewPanelManager (named-panel lifecycle), MessageBridge (typed extension↔webview messaging), and shared stylesheet

## Command And Validation Entry Points

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
- `Ralphdex: Show Sidebar`

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

Full schema rules and invariants live in [docs/invariants.md](docs/invariants.md#task-graph-invariants). The canonical normalized-task contract — field-presence categories, coercion rules, and child-task conversion behavior — lives in [docs/invariants.md § Normalized Task Contract](docs/invariants.md#normalized-task-contract).

## Crew Configuration

`.ralph/crew.json` is an optional JSON array that defines a named crew for multi-agent loops. Each entry requires `id` (string) and `role` (`planner` | `implementer` | `reviewer`), and accepts optional `goal` and `backstory` strings. When absent, Ralph synthesizes a uniform crew from `ralphCodex.agentCount`. `ralphCodex.agentRole` sets the active role for one running agent; the default is `implementer`.

`ralphCodex.planningPass.enabled` and `ralphCodex.planningPass.mode` control the pre-execution planning pass. Default: `enabled=false`, `mode='inline'`. Full workflow: [docs/workflows.md](docs/workflows.md#planning-pass).

Example `.ralph/crew.json` with one planner and two implementers:

```json
[
  { "id": "planner-1", "role": "planner",      "goal": "Decompose each task into a clear, executable plan.", "backstory": "An experienced software architect." },
  { "id": "impl-1",   "role": "implementer",  "goal": "Implement assigned tasks with complete, tested code.", "backstory": "A senior full-stack developer." },
  { "id": "impl-2",   "role": "implementer",  "goal": "Implement assigned tasks and write unit tests.",      "backstory": "A backend engineer focused on correctness." }
]
```

## Brief Codex Boundaries

- IDE handoff is clipboard plus `vscode.commands.executeCommand(...)`; do not invent direct composer injection or unsupported Codex IDE APIs.
- Scripted automation is `codex exec`.
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI.
- CLI runs can prove prepared-and-executed prompt integrity; IDE handoff only proves the prepared prompt bundle.
