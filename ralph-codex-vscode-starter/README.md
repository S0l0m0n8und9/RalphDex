# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, state, prompts, run artifacts, and verifier results on disk under `.ralph/` so a fresh Codex run can resume deterministically.

Prompt generation is now template-backed rather than hardcoded inline. Bundled templates live in `prompt-templates/`, can be overridden with config, and are fed by compact deterministic sections instead of raw log dumps.

## What Exists In V2.5

The extension already had modular command wiring, a Codex provider layer, a prompt builder, durable Ralph state, an explicit iteration engine, verifier/classification logic, deterministic stop rules, artifact persistence, shallow workspace inspection, pure logic tests, and Node 20+ packaging gates.

This version hardens the operational layer:

- explicit task graph schema instead of implicit subtask inference
- backward-compatible task-file normalization for simple legacy task lists
- deterministic preflight diagnostics before CLI execution starts, now persisted as first-class artifacts
- temp-workspace integration tests for full loop outcomes
- readable `Show Ralph Status` reporting instead of raw-object logging only
- stable latest-result artifacts plus per-iteration human summaries and latest-preflight pointers
- direct `Open Latest Ralph Summary` command for the newest human-readable artifact
- lightweight command-shell smoke tests for registration and status flows plus one optional real activation smoke path
- clearer git-aware reporting without adding branch/worktree orchestration

## Durable Files

- Objective text: `ralphCodex.prdPath` (`.ralph/prd.md`)
- Progress log: `ralphCodex.progressPath` (`.ralph/progress.md`)
- Task graph: `ralphCodex.ralphTaskFilePath` (`.ralph/tasks.json`)
- Runtime state: `.ralph/state.json`
- Generated prompts: `.ralph/prompts/`
- CLI transcripts and last messages: `.ralph/runs/`
- Iteration artifacts: `ralphCodex.artifactRetentionPath` (`.ralph/artifacts/`)
- Extension log: `.ralph/logs/extension.log`
- Bundled prompt templates in the extension repo: `prompt-templates/`

## Explicit Task Schema

`tasks.json` is now a flat, explicit graph with `parentId` for parent-child relationships and `dependsOn` for prerequisites. The extension normalizes legacy files into this version-2 format when feasible.

```json
{
  "version": 2,
  "tasks": [
    {
      "id": "T1",
      "title": "Harden the iteration engine",
      "status": "in_progress",
      "notes": "Keep loop semantics deterministic."
    },
    {
      "id": "T1.1",
      "title": "Add integration coverage",
      "status": "todo",
      "parentId": "T1",
      "dependsOn": ["T1"]
    },
    {
      "id": "T2",
      "title": "Improve status reporting",
      "status": "todo",
      "dependsOn": ["T1.1"],
      "validation": "npm test"
    }
  ]
}
```

Rules:

- `version` must be `2`.
- `parentId` explicitly declares a subtask relationship.
- `dependsOn` explicitly declares prerequisites that must be `done` before a `todo` task is selected.
- unsupported alias fields that look like schema drift, especially `dependencies`, are rejected with a diagnostic that tells the user to use `dependsOn`
- Task selection stays deterministic: first actionable `in_progress`, then first actionable `todo`.
- `remainingSubtasks` now uses explicit descendants, not ID-prefix guessing.

Preflight diagnostics also check the graph before CLI execution starts and report:

- duplicate task ids
- orphaned `parentId` references
- invalid `dependsOn` references
- dependency cycles
- impossible states such as a `done` task with incomplete required dependencies

When feasible, task diagnostics now include the task id plus task-file source location from `tasks.json` using the task entry index and line/column. This keeps duplicate-id, bad-parent, invalid-dependency, and cycle reports inspectable without adding a heavier parser framework.

Legacy compatibility:

- simple version-1 style files without `version`
- legacy child ids like `T1.1`, `T1-2`, or `T1/3` when the parent task exists

Those files are normalized and rewritten to version 2 when Ralph reads them successfully.

## Prompt Construction

Prompt construction stays shallow and deterministic:

- prompt text comes from file-based Markdown templates in `prompt-templates/`
- template selection is deterministic and easy to inspect
- the prompt builder packages concise objective, repo, runtime, task, progress, preflight, and prior-iteration sections
- prior verifier feedback is summarized, trimmed by budget, and never replaced with raw transcript dumps
- CLI-targeted prompts and IDE-handoff prompts share the same operational model but differ in execution guidance
- every generated prompt now also produces an `execution-plan.json` artifact that binds task selection, prompt kind, target mode, template path, prompt artifact path, and a stable prompt hash

Current prompt kinds:

- `bootstrap`: no prior Ralph prompt or iteration is recorded yet
- `iteration`: default follow-up when no stronger prior-iteration signal applies
- `fix-failure`: previous iteration failed, stalled, or carried a blocking verifier/failure signature
- `continue-progress`: previous iteration recorded `partial_progress`
- `human-review-handoff`: previous iteration recorded `needs_human_review` or stopped for human review

Strategy-aware shaping:

- `cliExec` prompts assume scripted `codex exec`, autonomous execution, and concise result reporting for verifier pairing
- `ideHandoff` prompts assume clipboard/VS Code-command handoff, human review of blockers, and no guaranteed transcript/verifier automation

Prompt selection rules remain deterministic:

- no prior Ralph prompt or iteration: `bootstrap`
- prior `needs_human_review` or `human_review_needed`: `human-review-handoff`
- prior `partial_progress`: `continue-progress`
- prior failed/blocked/no-progress execution or verifier failure signature: `fix-failure`
- otherwise: `iteration`

What stays intentionally shallow:

- no repo indexer
- no raw transcript injection
- no hidden Codex IDE APIs
- no non-deterministic “AI chooses the next task” behavior

## Loop Lifecycle

Each CLI iteration runs these phases:

1. `inspect`
2. `select task`
3. `generate prompt`
4. `execute`
5. `collect result`
6. `verify`
7. `classify outcome`
8. `persist state`
9. `decide whether to continue`

The loop does not delegate completion to model judgment. Outcome and stop behavior come from durable task state, verifier results, diff signals, and deterministic thresholds.

Before `codex exec` starts, Ralph now emits a short preflight summary and categorizes findings under:

- task graph issues
- workspace/runtime issues
- Codex adapter availability issues
- validation/verifier issues

If any preflight item is severe, the iteration or loop is blocked before execution.

Adapter confidence is now explicit:

- explicit executable path verified: info-level confidence that the configured CLI path is executable
- explicit executable path missing: blocking error
- explicit executable path not executable: blocking error
- PATH lookup only: warning that availability is assumed until launch time
- IDE command handoff unavailable: warning when configured Codex sidebar/new-chat commands are not actually registered in VS Code

Validation-command readiness is also explicit:

- no validation command selected
- validation command selected but the executable was not cheaply checked
- validation command executable confirmed before execution
- validation command selected but the executable could not be confirmed before execution

## Verifiers And Outputs

Configured through `ralphCodex.verifierModes`:

- `validationCommand`: runs `validationCommandOverride`, then task-level validation, then inferred workspace validation
- `gitDiff`: records git/file-change summaries and relevant changed files
- `taskState`: compares durable Ralph task/progress state before and after the iteration

Each iteration persists machine-readable verifier output in `verifier-summary.json` and verifier-specific artifacts such as:

- `validation-command.json`
- `task-state.json`
- `diff-summary.json`
- `git-status-before.txt`
- `git-status-after.txt`

## Outcome Classes And Stop Reasons

Outcome classes:

- `complete`
- `partial_progress`
- `no_progress`
- `blocked`
- `failed`
- `needs_human_review`

Stop reasons:

- `iteration_cap_reached`
- `task_marked_complete`
- `verification_passed_no_remaining_subtasks`
- `repeated_no_progress`
- `repeated_identical_failure`
- `human_review_needed`
- `execution_failed`
- `no_actionable_task`

Important precedence:

- `needs_human_review` does not get masked by verifier-driven completion.
- verifier-driven completion only applies to `partial_progress` with no remaining subtasks.
- `complete` records selected-task completion. When durable backlog remains, Ralph keeps that visible in iteration summaries, latest-summary surfaces, and status output instead of implying the entire queue is done.
- repeated no-progress and repeated identical failure detection remain deterministic.

## Verifier Feedback Into The Next Prompt

When a prior iteration exists and `ralphCodex.promptIncludeVerifierFeedback` is enabled, the next prompt carries forward a compact deterministic summary of:

- prior outcome classification
- execution and verifier status
- follow-up action and stop reason when present
- validation failure signature when present
- no-progress signals when present
- prior diff summary and relevant changed files when useful
- prior prompt/result artifact references

This context is trimmed with `ralphCodex.promptPriorContextBudget` so the prompt stays inspectable.

## Artifact Layout And Latest Result Discovery

Per iteration, Ralph writes a predictable folder such as `.ralph/artifacts/iteration-003/` with:

- `preflight-report.json`
- `preflight-summary.md`
- `prompt.md`
- `prompt-evidence.json`
- `execution-plan.json`
- `cli-invocation.json` for CLI runs
- `summary.md`
- `execution-summary.json`
- `verifier-summary.json`
- `iteration-result.json`
- `diff-summary.json` when available
- `stdout.log`
- `stderr.log`
- verifier-specific JSON and git snapshot files

Artifact-root pointers:

- `.ralph/artifacts/latest-summary.md`
- `.ralph/artifacts/latest-result.json`
- `.ralph/artifacts/latest-preflight-report.json`
- `.ralph/artifacts/latest-preflight-summary.md`
- `.ralph/artifacts/latest-prompt.md`
- `.ralph/artifacts/latest-prompt-evidence.json`
- `.ralph/artifacts/latest-execution-plan.json`
- `.ralph/artifacts/latest-cli-invocation.json`

These stable files point to the newest Ralph evidence. Successful CLI iterations refresh the usual latest iteration pointers. Blocked preflight starts also refresh the latest-summary/latest-result surfaces so the newest failure is easy to find, while the dedicated latest-preflight files always point to the newest preflight snapshot.

The command palette now includes `Ralph Codex: Open Latest Ralph Summary`, which opens `latest-summary.md` when it exists and falls back to `latest-preflight-summary.md` when the newest persisted evidence is a blocked preflight.

Execution-integrity checks:

- Ralph writes `execution-plan.json` before execution and records selected task id, prompt kind, target mode, template path, prompt artifact path, and prompt hash
- CLI execution now reads the persisted prompt artifact back from disk, verifies its hash against the plan, and sends that verified artifact content to `codex exec`
- CLI runs also record `cli-invocation.json` with the exact command path, args, workspace root, prompt artifact path, planned prompt hash, and stdin hash
- if the rendered prompt artifact and the execution payload diverge, the run fails before launch instead of silently drifting

## Show Ralph Status

`Ralph Codex: Show Status` now produces a readable report with:

- preflight readiness plus categorized issues
- source-located task graph diagnostics where available
- current task plus latest planned prompt kind
- latest iteration outcome
- backlog remaining after the latest iteration
- last task and last prompt kind
- template path and target mode
- whether the execution payload matched the rendered prompt artifact
- stop reason
- adapter confidence and IDE-command availability
- verifier results
- artifact locations, including latest preflight pointers plus latest execution-plan / CLI-invocation pointers
- latest prompt and prompt-evidence pointers
- git repository detection and working-tree snapshot when available

The command writes the report to the `Ralph Codex` output channel and offers `Open Latest Summary` when `latest-summary.md` exists.

## Verifying What Ran

For a CLI iteration, the minimum provenance chain is:

- inspect `.ralph/artifacts/latest-execution-plan.json`
- confirm `promptKind`, `promptTarget`, `templatePath`, `promptArtifactPath`, and `promptHash`
- inspect the prompt text at `.ralph/artifacts/latest-prompt.md` or the iteration-local `prompt.md`
- inspect `.ralph/artifacts/latest-cli-invocation.json` and confirm `stdinHash === promptHash`
- inspect `latest-summary.md` or `Show Status` to confirm `Payload matched rendered artifact: yes`

Current trust boundary:

- guaranteed for `cliExec`: Ralph proves which prompt artifact it selected, rendered, hashed, and sent to `codex exec`
- not guaranteed for `ideHandoff`: Ralph proves which prompt it prepared and copied, but a human can still edit or replace that prompt before running it in the IDE

## Git Safety

`ralphCodex.gitCheckpointMode` remains non-destructive:

- `off`: no git artifacts
- `snapshot`: capture pre/post `git status`
- `snapshotAndDiff`: capture status plus diff summary/checkpoint naming guidance

The extension does not create branches, tags, commits, or worktrees.

## Commands

- `Ralph Codex: Prepare Prompt`
- `Ralph Codex: Open Codex IDE`
- `Ralph Codex: Run CLI Iteration`
- `Ralph Codex: Run CLI Loop`
- `Ralph Codex: Show Status`
- `Ralph Codex: Open Latest Ralph Summary`
- `Ralph Codex: Reset Runtime State`

## Configuration And Recommended Defaults

The config surface remains intentionally small and operationally relevant. Current defaults are tuned for a solo developer running CLI-driven iterations:

- `approvalMode = never`
- `sandboxMode = workspace-write`
- `verifierModes = [validationCommand, gitDiff, taskState]`
- `gitCheckpointMode = snapshotAndDiff`
- `noProgressThreshold = 2`
- `repeatedFailureThreshold = 2`
- `promptIncludeVerifierFeedback = true`
- `promptPriorContextBudget = 8`

Recommended settings for day-to-day CLI loops:

```json
{
  "ralphCodex.approvalMode": "never",
  "ralphCodex.sandboxMode": "workspace-write",
  "ralphCodex.gitCheckpointMode": "snapshotAndDiff",
  "ralphCodex.stopOnHumanReviewNeeded": true,
  "ralphCodex.promptIncludeVerifierFeedback": true
}
```

Prompt-specific settings:

- `ralphCodex.promptTemplateDirectory`: optional workspace-relative or absolute override for template files; empty uses bundled `prompt-templates/`
- `ralphCodex.promptIncludeVerifierFeedback`: include compact prior iteration and verifier feedback in the next prompt
- `ralphCodex.promptPriorContextBudget`: maximum number of concise prior-context lines carried into the next prompt

## Codex Boundary

This repo intentionally does not invent unsupported Codex IDE APIs.

- IDE handoff is clipboard plus configurable VS Code command IDs.
- scripted automation is `codex exec`
- `preferredHandoffMode = cliExec` does not make `Open Codex IDE` run the CLI
- direct Codex composer injection is not implemented because the public APIs used here do not support it

## Activation, Trust, And Runtime

- Activation is command-driven.
- Untrusted workspaces support `Show Status` only.
- Prompt generation, reset, IDE handoff, and CLI execution require workspace trust.
- Virtual workspaces are unsupported.
- Packaging/runtime support requires Node 20+.

## Command-Shell Smoke Coverage

The lightweight Node test harness now covers:

- registration of the key extension commands
- `Show Status` rendering and latest-summary opening with mocked Ralph state/artifacts
- `Open Latest Ralph Summary` behavior when the summary exists or is missing

Optional real activation smoke:

- `npm run test:activation` launches a real Extension Development Host through `@vscode/test-electron`
- coverage is intentionally thin: extension activation, command registration, and one basic `Show Status` invocation
- if the default downloaded VS Code executable is not usable in your environment, rerun with `RALPH_VSCODE_EXECUTABLE_PATH=/absolute/path/to/code`
- it does not add UI automation, real Codex execution, or richer integration harnessing

Still intentionally lightweight:

- no heavy Extension Development Host UI automation
- no rich VS Code integration framework beyond one activation smoke path
- no live `codex exec` process testing

Authoritative local commands:

```bash
npm install
npm run compile
npm run validate
npm run package
```

## Reference Docs

- `docs/architecture.md`
- `docs/workflows.md`
- `docs/testing.md`
