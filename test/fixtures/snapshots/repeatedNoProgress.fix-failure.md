# Ralph Prompt: fix-failure (cliExec)

A prior Ralph iteration failed, stalled, or produced a blocking verifier signal. Repair the concrete cause instead of repeating the same attempt.

Focus first on the concrete failure or no-progress signal carried forward from the previous iteration. Avoid broad rewrites unless they are required to remove that blocker.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.
- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.
- End with a compact change summary Ralph can pair with verifier evidence.

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository's real validation commands when they exist.
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

## Template Selection
The previous iteration failed, stalled, or produced a blocking verifier signal, so the next prompt should focus on fixing that concrete issue.

## Preflight Snapshot
- Ready: yes
- Summary: Fixture scenario repeatedNoProgress is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Keep fixture generation reproducible when remediation is required.

## Repo Context
- Workspace: repeated-no-progress-fixture
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
- Lifecycle commands: npm run compile, npm run test
- CI files: .github/workflows/ci.yml
- CI commands: npm test
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
- Last iteration outcome: no_progress at iteration 1
- Last iteration summary: Two retries produced no durable movement on the fixture task.

## Task Focus
- Backlog counts: todo 0, in_progress 1, blocked 0, done 0
- Next actionable task: T3 (in_progress)
- Selected task id: T3
- Title: Build prompt test fixture framework with representative workspace and task scenarios
- Status: in_progress
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: npm run compile
- Effective validation command: npm run compile
- Validation command normalized from: npm run compile
- Notes: Create fixtures and a small proposed child-task set with dependencies.
- Blocker: none
- Acceptance criteria: none
- Constraints: none
- Relevant files: none

## Recent Progress
# Progress
- Prior retries did not move the selected task.
- Ralph proposed decomposing the task before another retry.

## Prior Iteration Evidence
- Prior iteration: 1
- Prior outcome classification: no_progress
- Prior execution / verification: succeeded / passed
- Prior remediation: Decompose T3 into smaller bounded child tasks before retrying.
- Prior summary: Two retries produced no durable movement on the fixture task.
- Additional prior-context signals omitted: 5.
