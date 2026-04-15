# Architecture

This document owns module boundaries and the end-to-end flow. It intentionally links to focused policy docs instead of restating their rules.

Related docs:

- [Invariants](invariants.md)
- [Provenance](provenance.md)
- [Verifier](verifier.md)
- [Boundaries](boundaries.md)

## Entry Point

- `src/extension.ts` creates the output-channel logger and delegates activation behavior to `registerCommands(...)`.
- Activation is command-based through `package.json`.

## Module Boundaries

- `src/commands/registerCommands.ts`: command registration, trust gating, progress UI, and operator-visible status/reporting behavior
- `src/codex/`: `clipboard`, `ideCommand`, and `cliExec` handoff or execution strategies
- `src/config/`: defaults, setting types, and configuration reads
- `src/prompt/promptBuilder.ts`: deterministic prompt-kind selection, template rendering, strategy-aware prompt shaping, and prompt-evidence generation
- `prompt-templates/`: bundled Markdown templates keyed by prompt kind
- `src/ralph/stateManager.ts`: durable Ralph state persistence and path management
- `src/ralph/taskFile.ts`: explicit task-schema parsing, normalization, deterministic selection, graph diagnostics, and task-claim file coordination
- `src/ralph/preflight.ts`: categorized readiness diagnostics before CLI execution
- `src/ralph/iterationEngine.ts`: explicit Ralph loop orchestration
- `src/ralph/cliOutputFormatter.ts`: claude stream-json event parsing and log-label formatting
- `src/ralph/reviewPolicy.ts`: review-agent file-change anomaly detection and policy enforcement
- `src/ralph/verifier.ts`: validation-command, git/file-change, and task-state verifiers
- `src/ralph/loopLogic.ts`: deterministic outcome classification and stop decisions
- `src/ralph/integrity.ts`: prompt and artifact hashing helpers
- `src/ralph/executionIntegrity.ts`: pre-execution integrity verification — execution-plan hash checking, prompt-artifact hash checking, stdin payload hash reconciliation, and integrity-failure/stale-task error types
- `src/ralph/artifactStore.ts`: per-iteration artifacts, run-level provenance bundles, latest pointers, and retention cleanup, including newest-first generated-artifact retention that can add older protected references without displacing the retained window
- `src/ralph/pipeline.ts`: end-to-end pipeline orchestration — PRD-fragment intake, task decomposition, agent loop, review-agent pass, SCM/PR submission, human-review gate coordination, and pipeline-run provenance artifact
- `src/ralph/orchestrationSupervisor.ts`: durable graph-backed orchestration — graph/state schema types, single-transition-per-write `advanceState`, evidence-gated transition guards, and orchestration artifact persistence under `.ralph/orchestration/<runId>/`
- `src/ralph/handoffManager.ts`: durable handoff contract lifecycle — propose/accept/reject/expire state machine with role-gated acceptance, contested-status detection for concurrent accepts, expiry evaluation, and atomic file-backed persistence under `.ralph/handoffs/<handoffId>.json`
- `src/services/`: logging, process execution, HTTPS client, Codex CLI support inspection, and shallow workspace scanning

## End-To-End Flow

1. A trusted command resolves config and workspace paths through `RalphStateManager`.
2. The engine inspects the durable Ralph files and a shallow repo-context snapshot. Repo inspection may select the workspace root, a stronger immediate child repo root when the workspace root is only an umbrella folder, or an explicit `inspectionRootOverride` directory inside the workspace.
3. The task layer selects the next actionable task from `.ralph/tasks.json`, or detects that the durable backlog is exhausted.
4. The prompt builder chooses a prompt kind and renders the matching template for `cliExec` or `ideHandoff`. When no actionable task remains and the backlog is exhausted, Ralph emits a backlog-replenishment prompt that refreshes `.ralph/tasks.json` instead of silently stopping.
5. The artifact store persists `prompt.md`, `prompt-evidence.json`, and `execution-plan.json`. `prompt-evidence.json` includes the exact structured repo-context object that fed template rendering, plus the explicit workspace/inspection/execution/verification root policy for the iteration.
6. Preflight evaluates task-graph, workspace/runtime, Codex-adapter, and verifier-readiness diagnostics.
7. If the path is `cliExec` and preflight is ready, launch verifies plan and prompt integrity and runs `codex exec` from the policy’s execution root. `.ralph` artifact storage still stays under the workspace root.
8. The verifier layer evaluates the result from the policy’s verification root.
9. Loop logic classifies the outcome and decides whether the loop continues.
10. State and artifact layers persist the result, latest pointers, and run-level provenance bundle.

## State Surfaces

Stable state and artifact locations live under `.ralph/`. The durable file model, latest-pointer contract, and iteration artifact requirements are defined in [docs/invariants.md](invariants.md).

The execution trust chain, run-bundle contract, and blocked integrity-failure behavior are defined in [docs/provenance.md](provenance.md).

`src/ralph/taskFile.ts` owns task normalization and the thin task-claim ledger used by agent coordination. The canonical field-presence rules — required, preserve-source, derive-if-possible, and leave-absent categories — are enforced by `normalizeTask` and documented in [docs/invariants.md § Normalized Task Contract](invariants.md#normalized-task-contract). Claim acquisition and release stay file-backed and local to one JSON file, guarded by a sibling lock file plus a write-then-verify readback so callers can detect contested ownership without depending on in-memory session state.

`src/ralph/iterationEngine.ts` is within the target line budget (≤1100 lines). Stream-formatting helpers live in `src/ralph/cliOutputFormatter.ts`, auto-remediation helpers live in `src/ralph/taskDecomposition.ts`, and review-agent policy lives in `src/ralph/reviewPolicy.ts`.

`src/ralph/orchestrationSupervisor.ts` adds a separate durable orchestration layer under `.ralph/orchestration/<runId>/`. `graph.json` stores the bounded node/edge DSL and required evidence references for each transition, while `state.json` stores the current cursor plus per-node outcomes and timestamps so interrupted runs can resume without hidden runtime memory.

## Runtime Constraints

- The workspace scanner is intentionally shallow: workspace root selection is limited to the workspace root plus immediate child directories, and content inspection is limited to deterministic top-level markers plus CI file reads.
- `inspectionRootOverride` is the escape hatch for ambiguous umbrella workspaces: it must resolve to a directory inside the workspace, it bypasses shallow scoring when valid, and invalid overrides are recorded before Ralph falls back to automatic selection.
- Nested-root policy is intentionally simple: execution root and verifier root currently follow the inspected root exactly; Ralph does not infer a second deeper execution target.
- Untrusted workspaces support status inspection only.
- Virtual workspaces are unsupported.
- Git handling is detection/reporting only.

See [docs/boundaries.md](boundaries.md) for the explicit non-goals and trust limits behind those constraints.
