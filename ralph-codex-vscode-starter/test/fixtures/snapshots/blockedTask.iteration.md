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
- Summary: Fixture scenario blockedTask is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Surface blocked tasks without mutating the durable backlog unexpectedly.

## Repo Context
- Workspace: blocked-task-fixture
- Workspace root: /fixture
- Inspected root: /fixture
- Execution root: /fixture
- Verifier root: /fixture
- Root selection: Using the workspace root because it already exposes shallow repo markers.
- Root policy: Inspect, execute, and verify at the workspace root while storing Ralph artifacts under .ralph there.
- Manifests: package.json, tsconfig.json
- Package managers: npm
- Package manager indicators: package.json, package-lock.json
- Test roots: test
- Validation commands: npm run compile
- Test signals: package.json defines a test script.
- package.json name: fixture-workspace

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 2
- Next iteration recorded in state: 2
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-001.prompt.md
- Last run: succeeded at iteration 1
- Last iteration outcome: complete at iteration 1
- Last iteration summary: Completed a prior helper task cleanly.

## Task Focus
- Backlog counts: todo 1, in_progress 0, blocked 1, done 0
- Next actionable task: none
- Selected task id: T4
- Title: Capture missing verifier prerequisite
- Status: blocked
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: npm run compile
- Effective validation command: npm run compile
- Validation command normalized from: npm run compile
- Notes: none
- Blocker: Waiting on a reproducible fixture input from an external dependency.
- Acceptance criteria: none
- Constraints: none
- Relevant files: none

## Recent Progress
# Progress
- The current task is blocked on external input.
- No failure remediation has been recorded yet.

## Prior Iteration Evidence
- Prior iteration: 1
- Prior outcome classification: complete
- Prior execution / verification: succeeded / passed
- Prior summary: Completed a prior helper task cleanly.
- Prior follow-up action: continue_next_task

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository’s real validation commands when they exist.
- For normal CLI task execution, do not edit `.ralph/tasks.json` or `.ralph/progress.md` directly; return the structured completion report instead.
- Update durable Ralph progress/tasks only when the prompt explicitly targets backlog replenishment.

## Execution Contract
1. Inspect the workspace facts and selected Ralph task before editing.
2. Execute only the selected task, or explain deterministically why no safe task is available.
3. Implement the smallest coherent improvement that advances the task.
4. Do not edit `.ralph/tasks.json` or `.ralph/progress.md` for normal task execution; Ralph will reconcile selected-task state from your completion report.
5. Run the selected validation command when available and report the concrete result.
6. End with a fenced `json` completion report block for the selected task using `selectedTaskId`, `requestedStatus`, optional `progressNote`, optional `blocker`, optional `validationRan`, and optional `needsHumanReview`.

## Final Response Contract
- Changed files.
- Validation results.
- Assumptions or blockers.
- Known limitations or follow-up work.
- End with a fenced `json` completion report block for the selected task.
