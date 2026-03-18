# Verifier

This document owns verifier modes, outcome classifications, and how verification affects loop stopping and review behavior.

Related docs:

- [Invariants](invariants.md) for loop and artifact requirements
- [Provenance](provenance.md) for execution trust
- [Workflows](workflows.md) for operator-facing command paths

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
- `control_plane_reload_required`
- `iteration_cap_reached`
- `claim_contested`
- `repeated_no_progress`
- `repeated_identical_failure`
- `human_review_needed`
- `execution_failed`
- `no_actionable_task`

The stop decision uses durable task state, verifier results, and configured thresholds such as `noProgressThreshold`, `repeatedFailureThreshold`, and `stopOnHumanReviewNeeded`.

Repeated-stop detection for `repeated_no_progress` and `repeated_identical_failure` is scoped per `agentId` on the selected task. Multi-agent deployments should assign distinct stable `agentId` values so one agent's interleaved history does not consume another agent's retry budget, while the default sentinel preserves existing single-agent behavior when no explicit agent id is provided.

`control_plane_reload_required` is a deliberate safety barrier. If an iteration changes control-plane runtime files such as `src/**`, `out/**`, `prompt-templates/**`, or `package.json`, Ralph records the current iteration normally and then stops the loop so the next run starts in a fresh extension process.

## Task Remediation

When a stop is caused by `repeated_no_progress`, repeated blocked starts on the same selected task, or `repeated_identical_failure` on the same selected task, Ralph now records a bounded `remediation` recommendation on the iteration result and latest-result surfaces.

Ralph also persists a dedicated `task-remediation.json` artifact in the iteration directory and mirrors the newest one to `.ralph/artifacts/latest-remediation.json`. That proposal records the triggering history, deterministic rationale, bounded proposed action, and any suggested child-task decomposition hints.

For `decompose_task`, the remediation artifact may now include a bounded proposed child-task set when the selected task looks clearly compound. Those proposals stay one level deep, inherit only the parent task and dependency context, cap the number of proposed children, and never rewrite `.ralph/tasks.json` automatically.

This remediation is deterministic and evidence-backed:

- it is derived only from stop reason, repeated classification history, no-progress signals, and the validation failure signature
- it activates only for repeated no-progress on the same selected task, repeated blocked starts on the same selected task, or repeated identical failure signatures on the same selected task
- it proposes one bounded outcome: `decompose_task`, `reframe_task`, `mark_blocked`, `request_human_review`, or `no_action`
- it is human-review-first guidance, not an automatic extra model pass and not an open-ended planner

Operators should read the proposal artifact as a recommendation, not as an implicit state change:

- `decompose_task` means Ralph found repeated stop evidence on a task that still looks compound enough to split into smaller deterministic steps
- `reframe_task` means repeated failure evidence points to a narrower failure signature that should become the next explicit task
- `mark_blocked` means the task keeps stopping before useful execution and the missing precondition should be captured directly
- `request_human_review` means the recorded evidence no longer supports another safe automatic retry
- `no_action` means Ralph saw repeated-stop evidence but could not justify a stronger bounded remediation

The proposal artifact is intentionally small and inspectable:

- `triggeringHistory` includes only the contiguous same-task history that caused the stop
- `evidence` records only the deterministic signals used to justify the recommendation
- `suggestedChildTasks` is populated only for bounded decomposition or narrowing cases
- `artifactDir` and `iterationResultPath` tie the proposal back to the persisted iteration evidence

Hard limits keep remediation from turning into ad hoc planning:

- remediation is emitted only after at least two matching same-task attempts, never from a single failure
- decomposition proposals are capped at 3 suggested child tasks
- suggested child tasks stay one level deep under the parent task instead of recursively generating descendants
- child tasks inherit only the parent validation command and dependency context plus sequential dependencies between the suggested siblings
- applying a proposal is rejected if the parent task is missing or already done, if a child id duplicates an existing task or the parent id, or if a proposed dependency does not resolve inside the approved task set
- even after approval, Ralph only adds the proposed children and gates the parent on them; it does not rewrite unrelated tasks or the broader plan

`decompose_task` has a deliberately narrow shape so the operator can predict what Ralph will propose before opening the artifact:

- the proposal can only split the currently selected task, never a sibling, ancestor, or unrelated backlog item
- proposed children must form a short sequential chain under that parent instead of branching into another planning tree
- the first narrowed child should reproduce the blocker against the inherited validation command so the next fix stays tied to the same deterministic verification target
- the next narrowed child should implement the smallest bounded fix for that reproduced blocker instead of bundling extra cleanup or another planning pass
- each child should describe one deterministic next step that can be validated with the parent's existing validation command
- if Ralph cannot describe that small bounded set confidently from recorded evidence, it must fall back to `reframe_task`, `request_human_review`, or `no_action` instead of inventing a broader decomposition

This keeps repeated-stop remediation focused on removing the concrete blocker that caused the retry loop, not on using verifier output as a second backlog planner.

The human-readable iteration summary and status report surface the remediation summary, action, attempt count, human-review recommendation, and latest remediation artifact path so operators can decide whether to rerun, narrow the task, or review the blocker before another iteration. `Show Status` prefers the persisted `latest-remediation.json` artifact when it exists, so remediation guidance remains visible even if the latest iteration state is stale or unavailable.

## Precedence Rules

These rules are strict:

- `needs_human_review` must not be masked by verifier-driven completion
- verifier-driven completion only applies to genuine `partial_progress` with no remaining subtasks
- repeated no-progress and repeated identical failure detection stay deterministic
- repeated-stop remediation guidance must stay deterministic, bounded, and grounded in recorded evidence
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

Ralph also applies a built-in prompt budget policy per prompt kind and target. Prompt evidence records the selected policy, estimated token count and range, and any omitted lower-priority sections so operators can inspect why a prompt was compacted before CLI execution or IDE handoff.

For `codex exec` runs, Ralph also defaults CLI reasoning effort to `medium` and treats `high` as an explicit operator escalation. The selected value is passed through to Codex CLI and persisted in the transcript plus iteration integrity surfaces so quota-sensitive runs remain inspectable.
