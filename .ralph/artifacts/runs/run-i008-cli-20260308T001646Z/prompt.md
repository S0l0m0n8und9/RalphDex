# Ralph Prompt: iteration (cliExec)

You are continuing Ralph work from durable repository state, not from chat memory. Re-inspect the repo and selected task before editing.

## Template Selection
A prior Ralph prompt exists and there is no stronger prior-iteration signal that requires a specialized follow-up prompt.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.
- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.
- End with a compact change summary Ralph can pair with verifier evidence.

## Preflight Snapshot
- Ready: yes
- Summary: Preflight ready: Selected task T8. Validation cd ralph-codex-vscode-starter && npm run validate. Executable confirmed. Task graph: ok | Workspace/runtime: ok | Codex adapter: 1 warning, 1 info | Validation/verifier: 1 info
- codexAdapter warning: Codex CLI will be resolved from PATH at runtime: codex. Availability is assumed until execution starts.

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
- Inspected root: /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter
- Root selection: Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.
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
- Workspace root: /home/admin/Documents/repos/Ralph
- package.json name: ralph-codex-workbench
- Notes: Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 8
- Next iteration recorded in state: 8
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-007.prompt.md
- Last run: succeeded at iteration 7
- Last iteration outcome: complete at iteration 7
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts
- Last iteration summary: Selected T7: Exercise a real CLI iteration against a temp workspace and tighten any artifact or verifier gaps it exposes | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 0

## Task Focus
- Backlog counts: todo 8, in_progress 0, blocked 0, done 7
- Next actionable task: T8 (todo)
- Selected task id: T8
- Title: Align nested inspection-root and execution-root semantics across prompting, execution, and verification
- Status: todo
- Parent task: none
- Dependencies: T3 (done), T4 (done), T7 (done)
- Direct children: T8.1 (todo), T8.2 (todo), T8.3 (todo), T8.4 (todo) (+2 more)
- Remaining descendants: T8.1 (todo), T8.2 (todo), T8.3 (todo), T8.4 (todo) (+2 more)
- Task validation hint: cd ralph-codex-vscode-starter && npm run validate
- Selected validation command: cd ralph-codex-vscode-starter && npm run validate
- Notes: Ralph can now inspect the nested `ralph-codex-vscode-starter` repo from the umbrella root, but execution and verifier working directories may still follow the workspace root unless commands manually `cd` into the nested repo. Make root-selection policy explicit, durable, and evidence-backed before expanding broader multi-agent behavior.
- Blocker: none

## Recent Progress
- Ralph workspace initialized.
- Refined `.ralph/prd.md` into a concrete objective for a durable, file-backed multi-agent delivery framework spanning requirements, implementation, testing, and orchestration.
- Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
- Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
- Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
- Completed T6 by documenting the manual `.vsix` install workflow, making `npm run package` succeed with `vsce package --no-dependencies` plus repository-aware README links, and validating a fresh `ralph-codex-workbench-0.1.0.vs
[trimmed for size]

## Prior Iteration Evidence
- Prior iteration: 7
- Prior outcome classification: complete
- Prior execution / verification: succeeded / passed
- Prior follow-up action: stop
- Prior summary: Selected T7: Exercise a real CLI iteration against a temp workspace and tighten any artifact or verifier gaps it exposes | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 0
- Prior stop reason: no_actionable_task
- Prior validation failure signature: none
- Additional prior-context signals omitted: 6.

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported Codex IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository’s real validation commands when they exist.
- Update durable Ralph progress/tasks when the task state materially changes.

## Execution Contract
1. Inspect the workspace facts and selected Ralph task before editing.
2. Execute only the selected task, or explain deterministically why no safe task is available.
3. Implement the smallest coherent improvement that advances the task.
4. Update durable Ralph files when task state or progress changes.
5. Run the selected validation command when available and report the concrete result.
6. End with a compact result Ralph can pair with verifier and artifact evidence.

## Final Response Contract
- Changed files.
- Validation results.
- Assumptions or blockers.
- Known limitations or follow-up work.
