# Ralph Prompt: bootstrap (cliExec)

You are starting a fresh Ralph-guided Codex run inside an existing repository. Treat the repository and durable Ralph files as the source of truth.

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

## Template Selection
No prior Ralph prompt or iteration has been recorded.

## Preflight Snapshot
- Ready: yes
- Summary: Fixture scenario freshWorkspace is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Build durable prompt fixtures for deterministic testing.

## Repo Context
- Workspace: fresh-fixture
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
- Backlog counts: todo 1, in_progress 0, blocked 0, done 0
- Next actionable task: T1 (todo)
- Selected task id: T1
- Title: Initialize prompt fixture coverage
- Status: todo
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: npm run compile
- Effective validation command: npm run compile
- Validation command normalized from: npm run compile
- Notes: none
- Blocker: none
- Acceptance criteria: none
- Constraints: none
- Relevant files: none

## Recent Progress
# Progress
No iterations have been recorded yet.

## Prior Iteration Evidence
- No prior Ralph iteration has been recorded.
