# Ralph Prompt: replenish-backlog (cliExec)

The durable Ralph backlog is exhausted. Re-inspect the repository, PRD, and recent progress, then generate the next coherent tasks directly in the durable task file.

## Why This Prompt Exists
The current durable Ralph backlog is exhausted, so the next prompt should replenish `.ralph/tasks.json` before normal task execution resumes.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- The current durable Ralph backlog is exhausted; this run should replenish `.ralph/tasks.json`, not start broad feature work.
- Generate only the next coherent task slice grounded in the PRD, repo state, and recent durable progress.
- Leave the task file explicit, flat, version 2, and immediately actionable.

## Preflight Snapshot
- Ready: yes
- Summary: Preflight ready: No task selected. Validation none. Task graph: ok | Workspace/runtime: ok | Codex adapter: 1 warning, 1 info | Validation/verifier: 1 warning
- codexAdapter warning: Codex CLI will be resolved from PATH at runtime: codex. Availability is assumed until execution starts.
- validationVerifier warning: Validation-command verifier is enabled but no validation command was selected for this iteration.

## Objective Snapshot
# Product / project brief

## Objective

Build Ralph into a durable, file-backed multi-agent delivery framework that can move a repository from requirements analysis through implementation, testing, and orchestration without depending on chat memory.

## Product direction

Ralph should let an operator define the work once in `.ralph/`, then execute repeatable Codex-driven iterations that stay inspectable across fresh sessions. The framework needs to strengthen both the quality of agent work and the control plane around it, so each step is deterministic, resumable, and supported by durable evidence.

## Core outcomes

- Turn requirements, progress, and task state into the shared source of truth for all agent activity.
- Support end-to-end delivery flow across requirements analysis, implementation, validation, and orchestration.
[trimmed for size]

## Repo Context
- Workspace: Ralph
- Workspace root: /home/admin/Documents/repos/Ralph
- Inspected root: /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter
- Execution root: /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter
- Verifier root: /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter
- Root selection: Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.
- Root policy: Inspect ralph-codex-vscode-starter, run Codex and verifiers there, and keep Ralph artifacts under the workspace-root .ralph directory.
- Manifests: package.json, tsconfig.json
- Source roots: src
- Test roots: test
- Package managers: npm
- Package manager indicators: package.json, package-lock.json
- Validation commands: npm run validate, npm run check:docs, npm run check:runtime, npm run lint (+5 more)
- Lifecycle commands: npm run validate, npm run check:docs, npm run check:runtime, npm run lint (+5 more)
- CI files: none
- CI commands: none
- Docs: README.md, docs, AGENTS.md
- Test signals: package.json defines a test script., package.json defines a lint script., package.json defines a validate/check script. (+3 more)
- package.json name: ralph-codex-workbench
- Notes: Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 13
- Next iteration recorded in state: 13
- Last prompt kind: replenish-backlog
- Last prompt path: .ralph/prompts/replenish-backlog-013.prompt.md
- Last run: succeeded at iteration 10
- Last iteration outcome: complete at iteration 12
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts
- Last iteration summary: No actionable Ralph task selected. | Execution: skipped | Verification: skipped | Outcome: complete | Backlog remaining: 0

## Backlog Replenishment Focus
- Backlog counts: todo 0, in_progress 0, blocked 0, done 16
- Next actionable task: none
- The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.
- Preserve done-task history and keep the task file at version 2 with explicit `id`, `title`, `status`, optional `parentId`, and optional `dependsOn`.
- Do not duplicate already-completed work or mark speculative tasks done.
- Leave at least one actionable `todo` or `in_progress` task when the repo state supports it.
- Validation command: none selected for backlog replenishment

## Recent Progress
- Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
- Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
- Completed T6 by documenting the manual `.vsix` install workflow, making `npm run package` succeed with `vsce package --no-dependencies` plus repository-aware README links, and validating a fresh `ralph-codex-workbench-0.1.0.vsix` build while capturing the remaining packaging warnings.
- Completed T7 by adding an optional real `codex exec` temp-workspace smoke command, documenting its environment-sensitive usage, and surfacing summarized execution failure messages into the structured Ralph iteration/latest-result/status artifacts after a sandboxed real-run preserved backend-connect failure evidence.
-
[trimmed for size]

## Prior Iteration Evidence
- Prior iteration: 12
- Prior outcome classification: complete
- Prior execution / verification: skipped / skipped
- Prior follow-up action: stop
- Prior summary: No actionable Ralph task selected. | Execution: skipped | Verification: skipped | Outcome: complete | Backlog remaining: 0
- Prior stop reason: no_actionable_task
- Prior validation failure signature: none
- Additional prior-context signals omitted: 4.

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported Codex IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository’s real validation commands when they exist.
- Update durable Ralph progress/tasks when the task state materially changes.

## Execution Contract
1. Inspect the PRD, durable progress log, and current repo state before editing the task file.
2. Replenish `.ralph/tasks.json` with the next coherent tasks only; do not broaden into unrelated planning.
3. Keep tasks explicit, flat, and dependency-aware so the next Ralph iteration can select deterministically.
4. Update `.ralph/progress.md` with a short note explaining why backlog replenishment was needed and what was added.
5. Do not run broad validation just for backlog generation unless you also changed runnable code.
6. End with the generated task ids and the next actionable task.

## Final Response Contract
- Generated or updated task ids.
- Why those tasks are the next coherent slice.
- Whether a new actionable task now exists.
- Any blocker that prevented safe backlog replenishment.
