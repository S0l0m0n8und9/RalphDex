# Ralph Prompt: bootstrap (ideHandoff)

You are starting a fresh Ralph-guided Codex run inside an existing repository. Treat the repository and durable Ralph files as the source of truth.

## Template Selection
No prior Ralph prompt or iteration has been recorded.

## Prompt Strategy
- Target: manual Codex IDE handoff via clipboard plus VS Code commands.
- A human may inspect or adjust the prompt before execution; keep blockers and review points easy to scan.
- Do not assume `codex exec` transcript capture or automated verifier reruns inside the IDE handoff path.
- Still rely on repo files as the source of truth and update durable Ralph files when work meaningfully changes.

## Preflight Snapshot
- Ready: yes
- Summary: Preflight ready: Selected task T1. Validation none. Task graph: ok | Workspace/runtime: 1 info | Codex adapter: 1 warning, 1 info | Validation/verifier: 1 warning
- codexAdapter warning: Codex CLI will be resolved from PATH at runtime: codex. Availability is assumed until execution starts.
- validationVerifier warning: Validation-command verifier is enabled but no validation command was selected for this iteration.

## Objective Snapshot
# Product / project brief

enhance and harden flow with multi agent framework across requirements analysis, delivery, testing and orchestration

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
- Prompt target: ideHandoff
- Current iteration number: 1
- Next iteration recorded in state: 1
- Last prompt kind: none yet
- Last prompt path: none
- Last run: none yet
- Last iteration outcome: none yet
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts

## Task Focus
- Backlog counts: todo 2, in_progress 0, blocked 0, done 0
- Next actionable task: T1 (todo)
- Selected task id: T1
- Title: Write or refine the project objective in the PRD file
- Status: todo
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: none
- Selected validation command: none detected
- Notes: The prompt generator reads the PRD file directly.
- Blocker: none

## Recent Progress
# Progress
- Ralph workspace initialized.
- Use this file for durable progress notes between fresh Codex runs.

## Prior Iteration Evidence
- No prior Ralph iteration has been recorded.

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
5. If a blocker needs human judgment, surface it plainly instead of burying it.
6. End with the concrete next step a human can verify or run in the IDE.

## Final Response Contract
- Changed files or inspected files.
- What is ready for human review.
- Validation run or still needed.
- The next concrete IDE or terminal step.
