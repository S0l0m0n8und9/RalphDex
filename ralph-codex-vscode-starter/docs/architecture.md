# Architecture

This document owns module boundaries and the end-to-end flow. It intentionally links to focused policy docs instead of restating their rules.

Related docs:

- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md)
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md)
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)
- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md)

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
- `src/ralph/taskFile.ts`: explicit task-schema parsing, normalization, deterministic selection, and graph diagnostics
- `src/ralph/preflight.ts`: categorized readiness diagnostics before CLI execution
- `src/ralph/iterationEngine.ts`: explicit Ralph loop orchestration
- `src/ralph/verifier.ts`: validation-command, git/file-change, and task-state verifiers
- `src/ralph/loopLogic.ts`: deterministic outcome classification and stop decisions
- `src/ralph/integrity.ts`: prompt and artifact hashing helpers
- `src/ralph/artifactStore.ts`: per-iteration artifacts, run-level provenance bundles, latest pointers, and retention cleanup
- `src/services/`: logging, process execution, Codex CLI support inspection, and shallow workspace scanning

## End-To-End Flow

1. A trusted command resolves config and workspace paths through `RalphStateManager`.
2. The engine inspects the durable Ralph files and a shallow repo-context snapshot. Repo inspection may select the workspace root or a stronger immediate child repo root when the workspace root is only an umbrella folder.
3. The task layer selects the next actionable task from `.ralph/tasks.json`.
4. The prompt builder chooses a prompt kind and renders the matching template for `cliExec` or `ideHandoff`.
5. The artifact store persists `prompt.md`, `prompt-evidence.json`, and `execution-plan.json`. `prompt-evidence.json` includes the exact structured repo-context object that fed template rendering.
6. Preflight evaluates task-graph, workspace/runtime, Codex-adapter, and verifier-readiness diagnostics.
7. If the path is `cliExec` and preflight is ready, launch verifies plan and prompt integrity and runs `codex exec`.
8. The verifier layer evaluates the result.
9. Loop logic classifies the outcome and decides whether the loop continues.
10. State and artifact layers persist the result, latest pointers, and run-level provenance bundle.

## State Surfaces

Stable state and artifact locations live under `.ralph/`. The durable file model, latest-pointer contract, and iteration artifact requirements are defined in [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md).

The execution trust chain, run-bundle contract, and blocked integrity-failure behavior are defined in [docs/provenance.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md).

## Runtime Constraints

- The workspace scanner is intentionally shallow: workspace root selection is limited to the workspace root plus immediate child directories, and content inspection is limited to deterministic top-level markers plus CI file reads.
- Untrusted workspaces support status inspection only.
- Virtual workspaces are unsupported.
- Git handling is detection/reporting only.

See [docs/boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md) for the explicit non-goals and trust limits behind those constraints.
