# Architecture

## Entry Point

- `src/extension.ts` creates the output channel logger and delegates all behavior to `registerCommands(...)`.
- Activation is command-based through `package.json` activation events.

## Module Boundaries

- `src/commands/registerCommands.ts`: command registration, trust gating, progress UI, and user-visible messaging.
- `src/codex/`: handoff and execution strategies for `clipboard`, `ideCommand`, and `cliExec`.
- `src/config/`: defaults, setting types, and VS Code configuration reads.
- `src/prompt/promptBuilder.ts`: deterministic prompt-kind selection, template loading/rendering, strategy-aware prompt shaping, compact repo-context packaging, and prompt-evidence generation.
- `prompt-templates/`: editable bundled Markdown templates keyed by prompt kind.
- `src/ralph/stateManager.ts`: durable Ralph state persistence and path management.
- `src/ralph/iterationEngine.ts`: the explicit Ralph loop phase runner.
- `src/ralph/preflight.ts`: deterministic preflight diagnostics across task graph, workspace/runtime, Codex adapter, and verifier readiness.
- `src/ralph/loopLogic.ts`: pure classification, no-progress detection, and stop-decision logic.
- `src/ralph/verifier.ts`: validation-command, file-change, and task-state verifiers.
- `src/ralph/artifactStore.ts`: deterministic per-iteration artifact writing plus stable latest-result and latest-provenance pointers.
- `src/ralph/integrity.ts`: prompt hashing used by execution-plan and CLI-payload integrity checks.
- `src/services/`: logging, child-process execution, Codex CLI support inspection, and shallow workspace scanning.

## Prompt And Execution Flow

1. A trusted command resolves config and workspace paths through `RalphStateManager`.
2. `RalphIterationEngine` inspects durable Ralph files and a shallow workspace summary.
3. The engine deterministically selects the next actionable task from `.ralph/tasks.json`, using explicit `parentId` and `dependsOn` fields rather than implicit ID-prefix inference.
4. `promptBuilder.ts` deterministically chooses a prompt kind (`bootstrap`, `iteration`, `fix-failure`, `continue-progress`, or `human-review-handoff`) and loads the matching file from `prompt-templates/`.
5. The prompt builder packages compact objective, repo, runtime, task, progress, preflight, and optional prior-verifier sections, then renders the template for either `cliExec` or `ideHandoff`.
6. `artifactStore.ts` persists `prompt.md`, `prompt-evidence.json`, `execution-plan.json`, and stable latest-prompt/latest-plan pointers before execution continues.
7. The execution plan binds selected task, prompt kind, prompt target, template path, prompt artifact path, and a stable prompt hash.
8. `preflight.ts` emits a concise readiness summary, persists preflight evidence under the iteration artifact directory, and blocks CLI execution when severe issues are present.
9. CLI execution uses `CliExecCodexStrategy`, which re-reads the persisted prompt artifact, verifies its hash against the execution plan, runs `codex exec`, sends the verified prompt over stdin, writes `.last-message.md`, and saves a transcript.
10. CLI runs also persist `cli-invocation.json`, which records the exact command path, args, workspace root, prompt artifact path, planned prompt hash, and stdin hash.
11. The verifier layer runs the configured verifier modes.
12. `loopLogic.ts` classifies the outcome and decides whether the loop continues.
13. `artifactStore.ts` and `stateManager.ts` persist the machine-readable iteration result and related artifacts.

## State Model

- `.ralph/state.json` stores versioned runtime state plus a compact run history and a machine-readable iteration history.
- `.ralph/tasks.json` stores an explicit version-2 task graph with flat tasks, `parentId`, and `dependsOn`.
- `.ralph/prompts/`, `.ralph/runs/`, `.ralph/logs/`, and `.ralph/artifacts/` are generated artifact directories.
- `.ralph/artifacts/latest-summary.md` and `.ralph/artifacts/latest-result.json` are the stable discovery paths for the newest Ralph evidence, including blocked preflight starts.
- `.ralph/artifacts/latest-preflight-report.json` and `.ralph/artifacts/latest-preflight-summary.md` always point to the newest preflight snapshot.
- `.ralph/artifacts/latest-prompt.md` and `.ralph/artifacts/latest-prompt-evidence.json` always point to the newest generated prompt and its structured rendering inputs.
- `.ralph/artifacts/latest-execution-plan.json` and `.ralph/artifacts/latest-cli-invocation.json` always point to the newest execution-provenance records.
- `Ralph Codex: Open Latest Ralph Summary` resolves the newest human-readable artifact from those stable paths.
- `inspectWorkspace()` is the non-destructive read path used for status inspection.
- `resetRuntimeState()` preserves PRD/progress/task files and removes generated runtime artifacts.

## Ralph Iteration Rules

- The first actual `codex exec` run is `bootstrap`. Later runs are `iteration`.
- Specialized follow-up prompts are deterministic: human-review signals prefer `human-review-handoff`, `partial_progress` prefers `continue-progress`, and failed/blocked/no-progress outcomes prefer `fix-failure`.
- Task selection is deterministic: first `in_progress`, then first `todo`.
- Preflight diagnostics are deterministic, categorized before CLI execution starts, and persisted as artifacts.
- Prompt context stays intentionally compact. Ralph does not build a repo index or inject raw transcripts into the next prompt.
- Execution provenance is deterministic. CLI runs must be traceable from prompt-kind selection to template path to prompt hash to stdin hash.
- Task diagnostics preserve lightweight source metadata from the task file so duplicate-id, parent, dependency, cycle, and likely schema-drift errors can cite array index plus line/column.
- The loop phases are explicit and timestamped.
- Stop behavior is semantic, not cap-or-failure only.
- Selected-task completion is distinct from backlog completion; backlog state is persisted into iteration results and rendered in status/latest-summary surfaces.
- No-progress detection is deterministic and based on repeated signals, not inferred intent.

## Boundaries And Constraints

- `src/codex/ideCommandStrategy.ts` uses clipboard plus `vscode.commands.executeCommand(...)`; it does not inject text directly into a Codex composer.
- CLI integrity guarantees stop at the `codex exec` boundary: Ralph proves the prompt artifact it sent, not what the model chose to do with it.
- IDE handoff integrity is intentionally weaker: Ralph proves the prompt it prepared and copied, but not any later human edits before execution.
- Codex adapter reporting distinguishes verified explicit CLI paths, missing/non-executable explicit paths, PATH-only assumptions, and unavailable IDE command handoff registrations.
- Validation-command readiness reporting distinguishes a selected command from an executable that was or was not confirmed cheaply before execution.
- `src/services/workspaceScanner.ts` inspects repo-root markers, selected CI files, and a small amount of manifest data. It is intentionally shallow.
- Untrusted workspaces have limited support: status inspection only.
- Virtual workspaces are unsupported.
- Git checkpointing is intentionally non-destructive.
