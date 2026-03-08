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
- Summary: Preflight ready: Selected task T3. Validation cd ralph-codex-vscode-starter && npm test. Executable confirmed. Task graph: ok | Workspace/runtime: ok | Codex adapter: 1 warning, 1 info | Validation/verifier: 1 info
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
- Root path: /home/admin/Documents/repos/Ralph
- Manifests: none
- Source roots: none
- Package managers: none
- Validation commands: none
- Lifecycle commands: none
- CI files: none
- Docs: none
- Test signals: none

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 3
- Next iteration recorded in state: 3
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-002.prompt.md
- Last run: succeeded at iteration 2
- Last iteration outcome: complete at iteration 2
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts
- Last iteration summary: Selected T2: Replace this seed task list with repo-specific work | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 5

## Task Focus
- Backlog counts: todo 5, in_progress 0, blocked 0, done 2
- Next actionable task: T3 (todo)
- Selected task id: T3
- Title: Detect nested project roots so Ralph can inspect the starter extension from the repo root
- Status: todo
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: cd ralph-codex-vscode-starter && npm test
- Selected validation command: cd ralph-codex-vscode-starter && npm test
- Notes: The current root-level workspace summary misses `ralph-codex-vscode-starter/package.json`, `src/`, and the extension validation scripts.
- Blocker: none

## Recent Progress
# Progress
- Ralph workspace initialized.
- Refined `.ralph/prd.md` into a concrete objective for a durable, file-backed multi-agent delivery framework spanning requirements, implementation, testing, and orchestration.
- Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
- Use this file for durable progress notes between fresh Codex runs.

## Prior Iteration Evidence
- Prior iteration: 2
- Prior outcome classification: complete
- Prior execution / verification: succeeded / passed
- Prior follow-up action: continue_next_task
- Prior summary: Selected T2: Replace this seed task list with repo-specific work | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 5
- Prior stop reason: none
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
