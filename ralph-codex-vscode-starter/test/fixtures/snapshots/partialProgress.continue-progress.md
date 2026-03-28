# Ralph Prompt: continue-progress (cliExec)

A prior Ralph iteration made partial progress. Resume from that durable state and finish the next coherent slice without redoing settled work.

Assume some useful work already landed in the repository. Build on that durable state and avoid redoing completed investigation unless the current files contradict the prior summary.

## Template Selection
The previous iteration recorded partial progress, so the next prompt should continue from that durable state.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.
- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.
- End with a compact change summary Ralph can pair with verifier evidence.

## Preflight Snapshot
- Ready: yes
- Summary: Fixture scenario partialProgress is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Keep prompt rendering deterministic across fresh sessions.

## Repo Context
- Workspace: partial-progress-fixture
- Workspace root: /fixture
- Inspected root: /fixture
- Execution root: /fixture
- Verifier root: /fixture
- Root selection: Using the workspace root because it already exposes shallow repo markers.
- Root policy: Inspect, execute, and verify at the workspace root while storing Ralph artifacts under .ralph there.
- Manifests: package.json, tsconfig.json
- Package managers: npm
- Package manager indicators: package.json, package-lock.json
- Source roots: src
- Test roots: test
- Validation commands: npm run compile
- Test signals: package.json defines a test script.
- Docs: README.md, AGENTS.md
- package.json name: fixture-workspace

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 2
- Next iteration recorded in state: 2
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-001.prompt.md
- Last run: succeeded at iteration 1
- Last iteration outcome: partial_progress at iteration 1
- Last iteration summary: Started fixture rendering coverage but left follow-up assertions pending.

## Task Focus
- Backlog counts: todo 0, in_progress 1, blocked 0, done 1
- Next actionable task: T2 (in_progress)
- Selected task id: T2
- Title: Render prompt fixture coverage
- Status: in_progress
- Parent task: none
- Dependencies: T1 (done)
- Direct children: none
- Remaining descendants: none
- Task validation hint: npm run compile
- Effective validation command: npm run compile
- Validation command normalized from: npm run compile
- Notes: none
- Blocker: none

## Recent Progress
# Progress
- Base helpers landed.
- Prompt rendering assertions still need fixture coverage.

## Prior Iteration Evidence
- Prior iteration: 1
- Prior outcome classification: partial_progress
- Prior execution / verification: succeeded / passed
- Prior summary: Started fixture rendering coverage but left follow-up assertions pending.
- Additional prior-context signals omitted: 3.

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
