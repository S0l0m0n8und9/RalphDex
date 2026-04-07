# Ralph Prompt: human-review-handoff (cliExec)

A prior Ralph iteration surfaced a blocker that may need human review. Preserve deterministic evidence, do not fake closure, and make the next safe move explicit.

Treat the prior blocker as real until the repository proves otherwise. Keep the next safe action, review point, or missing decision explicit.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.
- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.
- This prompt follows a human-review signal. If the blocker is still real, preserve it cleanly instead of masking it with speculative edits.

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
The previous iteration requested human review, so the next prompt should preserve that blocker explicitly.

## Preflight Snapshot
- Ready: yes
- Summary: Fixture scenario humanReview is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Capture explicit human-review blockers without inventing closure.

## Repo Context
- Workspace: human-review-fixture
- Workspace root: /fixture
- Inspected root: /fixture
- Execution root: /fixture
- Verifier root: /fixture
- Root selection: Using the workspace root because it already exposes shallow repo markers.
- Root policy: Inspect, execute, and verify at the workspace root while storing Ralph artifacts under .ralph there.
- Manifests: package.json, tsconfig.json
- Package managers: npm
- Package manager indicators: package.json, package-lock.json
- package.json name: fixture-workspace

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 2
- Next iteration recorded in state: 2
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-001.prompt.md
- Last run: succeeded at iteration 1
- Last iteration outcome: needs_human_review at iteration 1
- Last iteration summary: The fixture baseline cannot proceed without explicit reviewer confirmation.

## Task Focus
- Backlog counts: todo 0, in_progress 0, blocked 1, done 0
- Next actionable task: none
- Selected task id: T9
- Title: Escalate fixture approval blocker
- Status: blocked
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: npm run compile
- Effective validation command: npm run compile
- Validation command normalized from: npm run compile
- Notes: none
- Blocker: [human-review-needed] Fixture baseline requires explicit reviewer sign-off before proceeding.
- Acceptance criteria: none
- Constraints: none
- Relevant files: none

## Recent Progress
- A prior iteration surfaced a reviewer gate.
- Ralph should now hand that blocker off explicitly.
[trimmed for size]

## Prior Iteration Evidence
- Prior iteration: 1
- Prior outcome classification: needs_human_review
- Prior execution / verification: succeeded / passed
- Prior remediation: Request human review before continuing the fixture workflow.
- Prior summary: The fixture baseline cannot proceed without explicit reviewer confirmation.
- Additional prior-context signals omitted: 2.
