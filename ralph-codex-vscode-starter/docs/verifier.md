# Verifier

This document owns verifier modes, outcome classifications, and how verification affects loop stopping and review behavior.

Related docs:

- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md) for loop and artifact requirements
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for execution trust
- [Workflows](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md) for operator-facing command paths

## Verifier Modes

Configured through `ralphCodex.verifierModes`:

- `validationCommand`: runs `validationCommandOverride`, then task-level validation, then inferred workspace validation
- `gitDiff`: records git/file-change summaries and relevant changed files
- `taskState`: compares durable Ralph task/progress state before and after the iteration

Preflight must report verifier readiness separately from verifier results. A selected validation command is not the same as an executable confirmed before execution.

For normal CLI task execution, the model does not directly edit `.ralph/tasks.json` or `.ralph/progress.md`. Instead it ends with a structured completion-report JSON block, and Ralph reconciles the selected-task status, blocker, and at most one sanitized progress bullet locally after verification.

For nested workspaces, verifier cwd follows the iteration root policy: `.ralph` still lives at the workspace root, validation-command and git/file-change verifiers run from the selected inspection root, and task-state verification still compares durable Ralph files under `.ralph`. When `inspectionRootOverride` is configured, the override becomes the verifier cwd if it resolves to a directory inside the workspace; otherwise Ralph records the invalid override and falls back to automatic root selection.

## Verifier Artifacts

Each iteration persists a machine-readable `verifier-summary.json`.

Verifier-specific artifacts may also include:

- `validation-command.json`
- `task-state.json`
- `diff-summary.json`
- `git-status-before.txt`
- `git-status-after.txt`

Those artifacts explain why a verification status was `passed`, `failed`, or `skipped`.

## Outcome Classifications

Classification is deterministic and comes from execution status plus verifier signals, not from freeform model judgment.

Current classes:

- `complete`
- `partial_progress`
- `no_progress`
- `blocked`
- `failed`
- `needs_human_review`

Operational meaning:

- `needs_human_review`: human review markers or task-state evidence explicitly require a person
- `blocked`: the selected task is blocked even if the process itself ran
- `failed`: execution failed
- `complete`: the selected task completed
- `partial_progress`: execution or verification shows meaningful progress without completion
- `no_progress`: no relevant file changes or durable state changes, often with repeated failure signals

## No-Progress Detection

No-progress detection remains deterministic. Current signals include:

- same task selected repeatedly
- same validation failure signature
- no relevant file changes
- task and progress state unchanged
- same failure classification across consecutive iterations

`partial_progress` may be promoted to `no_progress` when the strong no-progress signals line up.

Do not replace this with an open-ended "AI decides progress" rule.

## Stop Reasons

The loop may stop for:

- `task_marked_complete`
- `verification_passed_no_remaining_subtasks`
- `control_plane_reload_required`
- `iteration_cap_reached`
- `repeated_no_progress`
- `repeated_identical_failure`
- `human_review_needed`
- `execution_failed`
- `no_actionable_task`

The stop decision uses durable task state, verifier results, and configured thresholds such as `noProgressThreshold`, `repeatedFailureThreshold`, and `stopOnHumanReviewNeeded`.

`control_plane_reload_required` is a deliberate safety barrier. If an iteration changes control-plane runtime files such as `src/**`, `out/**`, `prompt-templates/**`, or `package.json`, Ralph records the current iteration normally and then stops the loop so the next run starts in a fresh extension process.

## Precedence Rules

These rules are strict:

- `needs_human_review` must not be masked by verifier-driven completion
- verifier-driven completion only applies to genuine `partial_progress` with no remaining subtasks
- repeated no-progress and repeated identical failure detection stay deterministic
- selected-task completion is distinct from total backlog completion

## Feedback Into The Next Prompt

When `ralphCodex.promptIncludeVerifierFeedback` is enabled, the next prompt may carry forward a compact structured summary of:

- prior classification
- execution and verifier status
- follow-up action and stop reason
- validation failure signature
- no-progress signals
- useful diff summary and relevant changed files
- prior prompt/result artifact references

This context is trimmed by `ralphCodex.promptPriorContextBudget`. It should stay inspectable and should not turn into transcript dumping.
