# Workflows

This document owns operator-facing command flows. Semantic rules for invariants, provenance, verifier behavior, and boundaries live in the focused docs linked below.

Related docs:

- [Invariants](invariants.md)
- [Provenance](provenance.md)
- [Verifier](verifier.md)
- [Boundaries](boundaries.md)

## Develop The Extension

1. Run `npm install`.
2. Run `npm run compile`.
3. Start the Extension Development Host with `F5`.
4. Re-run `npm run compile` after TypeScript changes, or use `npm run watch`.

Use [docs/testing.md](testing.md) for the validation gate and test coverage.

## Package And Install A .vsix

1. Run `npm install` if dependencies are not present yet.
2. Run `npm run package` from the extension root.
3. Wait for `vsce package` to emit `ralph-codex-workbench-<version>.vsix` in the extension root directory.
4. In VS Code, run `Extensions: Install from VSIX...` and select the generated file.
5. Reload VS Code if prompted, then confirm the extension appears as `Ralph Codex Workbench`.

The package command is the supported release-build path for this repo. It first runs `npm run check:runtime` and then delegates to `vsce package`, which also triggers the `vscode:prepublish` compile hook before writing the archive. The published archive is intentionally limited to the compiled extension, prompt templates, bundled license, and operator-facing docs instead of the full development tree.

If you prefer a shell-driven local install, run `code --install-extension ./ralph-codex-workbench-<version>.vsix` from the extension root instead of using the command palette.

This workflow proves that the repo can build a distributable `.vsix`. It does not prove marketplace publishing or host-specific install UX; those remain manual operator checks.

## Initialize A Fresh Workspace

1. Open a fresh clone in VS Code.
2. Run `Ralph Codex: Initialize Workspace`.
3. Replace the placeholder comment in `.ralph/prd.md` with the real repository objective before using any prompt or CLI workflow.

This command is the supported bootstrap path for a new workspace that does not already carry Ralph state. It creates `.ralph/prd.md`, `.ralph/tasks.json`, and `.ralph/progress.md`, and it writes `.ralph/.gitignore` with the standard runtime ignores when that file is not already present.

The safety guard is intentionally narrow: if `.ralph/prd.md` already exists, Ralph warns and aborts instead of overwriting the current workspace state. That keeps initialization for clean clones separate from runtime cleanup or reset flows on an active workspace.

## Prepare A Prompt For IDE Use

1. Run `Ralph Codex: Prepare Prompt` if you only want the next prompt file.
2. Run `Ralph Codex: Open Codex IDE` if you also want clipboard handoff and best-effort sidebar/new-chat commands.
3. Continue manually in the Codex IDE.

This path persists prepared-prompt evidence, not a full executed iteration result.

Task ownership on this path is review-only, not blocking: Ralph may show the next selected task in the prepared prompt and provenance bundle, but it does not write an active durable claim to `.ralph/claims.json`. A later `Run CLI Iteration` must still be able to claim that same task if the operator abandons the handoff.

This is a hard lifecycle boundary, not a best-effort hint: `Prepare Prompt` and `Open Codex IDE` may prepare evidence for the same selected task repeatedly, but they must leave `.ralph/claims.json` unchanged so they never strand a blocking claim that only the CLI path could release safely.

Handoff behavior on this path is intentionally explicit:

- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.

Artifacts written on this path include:

- `prompt.md`
- `prompt-evidence.json`
- `execution-plan.json`
- a run bundle under `.ralph/artifacts/runs/<provenance-id>/`
- stable latest prompt, plan, and provenance pointers

Use this path when a human should inspect or edit the prompt before execution. See [docs/provenance.md](provenance.md) for the prepared-prompt-only trust distinction.

When `ralphCodex.generatedArtifactRetentionCount` is greater than `0`, Ralph also prunes older generated prompt files, older iteration directories, and older transcript or last-message pairs after the prompt provenance write completes. Cleanup applies per category: it keeps the newest `N` entries by iteration first, then unions in only the protected roots from `.ralph/state.json`, the stable latest-pointer JSON artifacts, and the stable latest summary surfaces. Protected older references augment that newest-by-iteration window; they do not evict newer retained entries, and the reported retained list stays in newest-first order. Cleanup summaries also report which retained entries survived only because protection added them after the newest-by-iteration window. The protected state roots are `lastPromptPath`; `lastRun.promptPath`, `lastRun.transcriptPath`, and `lastRun.lastMessagePath`; `lastIteration.artifactDir`, `lastIteration.promptPath`, `lastIteration.execution.transcriptPath`, and `lastIteration.execution.lastMessagePath`; and the same prompt, transcript, last-message, and iteration-directory fields inside every `runHistory[]` and `iterationHistory[]` entry. The protected latest-pointer JSON artifacts are `latest-result.json`, `latest-preflight-report.json`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-bundle.json`, and `latest-provenance-failure.json`. `latest-result.json` can protect an older iteration directory, prompt, and transcript or last-message pair; `latest-preflight-report.json` protects only the referenced iteration directory; `latest-prompt-evidence.json` protects only the prompt file and iteration directory implied by its persisted `kind` and `iteration`; `latest-execution-plan.json` protects an older iteration directory and prompt; `latest-cli-invocation.json` protects an older iteration directory plus its transcript or last-message pair; and `latest-provenance-bundle.json` plus `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths, not prompt or run files in `.ralph/prompts/` or `.ralph/runs/`. As a fallback, `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` can each protect only the iteration directory implied by their persisted iteration heading or `- Iteration:` line.

## Run One CLI Iteration

1. Run `Ralph Codex: Run CLI Iteration`.
2. Ralph emits a short preflight summary covering task graph, workspace/runtime, Codex adapter, and verifier readiness, including warnings when latest artifact surfaces are stale, retention cleanup roots overlap unsafely, or retention settings disable expected cleanup before a loop starts.
3. If preflight is blocked, Ralph persists blocked-start evidence and stops before `codex exec`.
4. Otherwise Ralph selects the next task, renders the prompt, writes the execution plan, verifies launch integrity, runs `codex exec`, verifies the outcome, reconciles the structured completion report, and persists the iteration result.

Operator-facing artifacts for this path include:

- `.ralph/artifacts/latest-summary.md`
- `.ralph/artifacts/latest-preflight-summary.md`
- `.ralph/artifacts/latest-prompt.md`
- `.ralph/artifacts/latest-execution-plan.json`
- `.ralph/artifacts/latest-cli-invocation.json`
- `.ralph/artifacts/latest-provenance-summary.md`

When a CLI iteration stops cleanly instead of crashing, Ralph also writes a compact session handoff note under `.ralph/handoff/<agentId>-<iteration>.json`. This handoff file is the durable carry-forward surface for the next fresh session. It records the selected task, stop reason, completion classification, any progress note or blocker, the latest validation failure signature when one exists, and the remaining-task summary at the moment the loop stopped.

Clean handoff notes are written only for terminal stop reasons that preserve inspectable continuity instead of failure ambiguity:

- `task_marked_complete`
- `iteration_cap_reached`
- `control_plane_reload_required`
- `human_review_needed`
- `no_actionable_task`
- `verification_passed_no_remaining_subtasks`

On the next iteration for the same `agentId`, Ralph reads the immediately previous handoff note first and injects a compact `Session Handoff` block into the next prompt ahead of broader prior-iteration evidence. Preflight also surfaces this as an informational `session_handoff_available` diagnostic so the operator can see that the next run is resuming from a durable handoff instead of reconstructing context from the full iteration history.

Per-iteration artifacts now also include `completion-report.json`, which records the parsed report, parse errors, or rejection warnings that explain whether Ralph applied the model's requested selected-task update.

When the same selected task stops with repeated no-progress, repeated blocked starts, or repeated identical failure evidence, the persisted iteration result, latest-result pointer, latest summary, and status report now also carry a bounded remediation recommendation. That recommendation stays deterministic and human-review-first; it does not trigger an automatic extra model pass.

If the latest remediation artifact proposes `decompose_task`, the default behavior is still propose-only. Review the artifact first, then run `Ralph Codex: Apply Latest Task Decomposition Proposal` when you explicitly want Ralph to write the proposed child tasks into `.ralph/tasks.json`. That apply step uses the same shared proposal write path as loop-time auto-apply, adds the approved child tasks, and makes the parent depend on them so the bounded subtasks run before the parent is retried.

Ralph may also auto-apply `decompose_task` during `Run CLI Iteration` or `Run CLI Loop`, but only when `ralphCodex.autoApplyRemediation` includes `decompose_task` or `ralphCodex.autonomyMode = autonomous` makes that setting effective at runtime. In that mode Ralph still persists the remediation artifact first, then applies the suggested child tasks through the same task-file validation and `withTaskFileLock` write path used by the explicit apply command. If validation fails, Ralph leaves `.ralph/tasks.json` unchanged and records a warning on the iteration result instead of forcing the edit.

The operator approval boundary is strict on purpose:

- Ralph can persist the proposal artifact automatically, and it changes `.ralph/tasks.json` only through the bounded proposal write path used by `Apply Latest Task Decomposition Proposal` or by the explicit `autoApplyRemediation` opt-in
- the apply command is still the manual path for the latest approved `decompose_task` artifact; `reframe_task` and `request_human_review` stay operator decisions outside automatic task-file edits, while `mark_blocked` has its own separate opt-in auto-apply path
- approval is still validated at write time, so stale, duplicate, or graph-invalid proposed children are rejected instead of being forced into the task graph
- the approved write is narrow: Ralph appends the proposed child tasks and adds them as parent dependencies, but it does not reorder or rewrite unrelated tasks

On execution failures, the structured iteration result and latest-result pointer should also carry the summarized `codex exec` message, while the transcript and `stderr.log` keep the full raw process output for inspection.

For normal task execution, the prompt explicitly tells the model not to edit `.ralph/tasks.json` or `.ralph/progress.md` directly. Backlog replenishment is the exception: that prompt kind still updates the durable task file and progress log itself.

Use this path when you need repeatable execution plus deterministic result recording.

When `ralphCodex.scmStrategy = branch-per-task`, CLI iteration also owns branch placement for the selected task. Top-level tasks claim a dedicated `ralph/<taskId>` branch from the branch that was active when the claim was acquired. Child tasks claim both `ralph/integration/<parentId>` and `ralph/<taskId>`, record those branch names plus the original base branch in `.ralph/claims.json`, and run the task on the child feature branch. When the child task reconciles `done`, Ralph commits the remaining work on `ralph/<taskId>`, merges that feature branch into `ralph/integration/<parentId>`, and, if that completion also auto-completes the parent aggregate task, performs one atomic merge from `ralph/integration/<parentId>` back into the recorded base branch. If `ralphCodex.scmPrOnParentDone = true`, Ralph also pushes `ralph/integration/<parentId>` to `origin` and runs `gh pr create` with the parent title plus the completed child summaries, targeting the base branch recorded on the first child claim. Push or PR failures are surfaced in iteration warnings only; they do not roll back the completed task state. Ralph never auto-deletes either branch. If any of those merges conflict, Ralph leaves the conflicting branch checked out, reopens the affected task as `in_progress` with a merge-conflict blocker, releases the active claim, and records the conflict path in the iteration warnings instead of silently forcing the merge.

If `Show Status` reports a stale canonical task claim that blocks reselection, use `Ralph Codex: Resolve Stale Task Claim` instead of editing `.ralph/claims.json` manually. The command inspects the current canonical claim, refuses to proceed unless the claim is still stale, checks that no `codex exec` process is currently running, and then asks for explicit operator approval before it marks that claim `stale` in `.ralph/claims.json`. Ralph records the resolved task id, provenance id, resolution timestamp, and recovery reason on the claim so later status output can explain why the claim became eligible for recovery.

After that recovery step, the task is eligible for normal deterministic reselection again. The next `Run CLI Iteration` must acquire a fresh CLI claim for that task if it is still the next actionable item, and it must release that CLI claim again when the iteration finishes.

When `ralphCodex.generatedArtifactRetentionCount` is greater than `0`, Ralph prunes older generated prompt files, iteration directories, transcript or last-message pairs, and session handoff files after iteration provenance is persisted. Cleanup applies per category: it keeps the newest `N` entries by iteration first, then unions in only the protected roots from `.ralph/state.json`, the stable latest-pointer JSON artifacts, and the stable latest summary surfaces. Protected older references augment that newest-by-iteration window; they do not evict newer retained entries, and the reported retained list stays in newest-first order. Cleanup summaries also report which retained entries survived only because protection added them after the newest-by-iteration window. The protected state roots are `lastPromptPath`; `lastRun.promptPath`, `lastRun.transcriptPath`, and `lastRun.lastMessagePath`; `lastIteration.artifactDir`, `lastIteration.promptPath`, `lastIteration.execution.transcriptPath`, and `lastIteration.execution.lastMessagePath`; and the same prompt, transcript, last-message, and iteration-directory fields inside every `runHistory[]` and `iterationHistory[]` entry. Session handoff files are retained by newest iteration only; they are not protected by latest-pointer JSON artifacts. The protected latest-pointer JSON artifacts are `latest-result.json`, `latest-preflight-report.json`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-bundle.json`, and `latest-provenance-failure.json`. `latest-result.json` can protect an older iteration directory, prompt, and transcript or last-message pair; `latest-preflight-report.json` protects only the referenced iteration directory; `latest-prompt-evidence.json` protects only the prompt file and iteration directory implied by its persisted `kind` and `iteration`; `latest-execution-plan.json` protects an older iteration directory and prompt; `latest-cli-invocation.json` protects an older iteration directory plus its transcript or last-message pair; and `latest-provenance-bundle.json` plus `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths, not prompt or run files in `.ralph/prompts/` or `.ralph/runs/`. As a fallback, `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` can each protect only the iteration directory implied by their persisted iteration heading or `- Iteration:` line.

## Prompt Budgeting And Quota Control

Ralph keeps prompt generation deterministic, but it does not render every prompt shape at the same size. Prompt budget policy is selected by prompt kind plus target so CLI execution gets enough context to act while IDE handoff stays tighter and easier to review.

The current built-in budget tiers are:

- bootstrap: largest budget because Ralph still needs broad repo and objective context
- replenish-backlog: large budget because task generation needs wider PRD and backlog context
- continue-progress and normal iteration: medium budget with task-focused repo and prior-iteration context
- fix-failure and human-review-handoff: tighter budget that favors failure signatures, remediation, and the current blocker over broad history
- IDE handoff variants: smaller than their CLI counterparts because they prepare a human-reviewed prompt instead of a full automated run

Every built-in prompt policy keeps the same minimum required sections. Ralph never drops these, even when quota pressure trims optional context:

- `strategyContext`
- `preflightContext`
- `objectiveContext`
- `taskContext`
- `operatingRules`
- `executionContract`
- `finalResponseContract`

Budget pressure drops only lower-priority sections, in a fixed order captured in `prompt-evidence.json`. Lower-priority sections may be omitted in this order depending on prompt kind and target:

- runtime context
- repo context
- progress context
- prior-iteration context

For `fix-failure` and `human-review-handoff`, that policy is intentionally biased toward blocker evidence: Ralph drops recent progress before it drops prior-iteration remediation or stop-reason context for the same task.

The built-in `codex` policy matrix is the default selected by `ralphCodex.promptBudgetProfile`. Operators can switch to the higher-context placeholder `claude` profile or provide `ralphCodex.customPromptBudget` overrides for a `custom` profile, but only the `codex` matrix below is calibrated for production use today. See [docs/prompt-calibration.md](prompt-calibration.md) before treating a non-`codex` profile as a stable baseline.

The default policy matrix is:

| Prompt kind | Target | Target tokens | Required sections | Minimum context bias | Optional sections | Drop-first order |
| --- | --- | ---: | --- | --- | --- | --- |
| `bootstrap` | `cliExec` | 2100 | strategy, preflight, objective, task, rules, execution, final response | broad objective, expanded repo scan, standard runtime pointers | `priorIterationContext` | prior iteration |
| `bootstrap` | `ideHandoff` | 1500 | strategy, preflight, objective, task, rules, execution, final response | broad objective, lighter runtime and repo detail for human review | `runtimeContext`, `repoContext`, `progressContext`, `priorIterationContext` | runtime -> repo -> progress -> prior iteration |
| `iteration` | `cliExec` | 1600 | strategy, preflight, objective, task, rules, execution, final response | selected task plus compact repo/runtime context | `runtimeContext`, `repoContext`, `progressContext`, `priorIterationContext` | runtime -> repo -> progress -> prior iteration |
| `iteration` | `ideHandoff` | 1000 | strategy, preflight, objective, task, rules, execution, final response | selected task plus compact review-oriented context | `runtimeContext`, `repoContext`, `priorIterationContext`, `progressContext` | runtime -> repo -> prior iteration -> progress |
| `continue-progress` | `cliExec` | 1600 | strategy, preflight, objective, task, rules, execution, final response | selected task plus compact recent progress and prior iteration state | `runtimeContext`, `repoContext`, `progressContext`, `priorIterationContext` | runtime -> repo -> progress -> prior iteration |
| `continue-progress` | `ideHandoff` | 1000 | strategy, preflight, objective, task, rules, execution, final response | selected task plus compact carry-forward state for human review | `runtimeContext`, `repoContext`, `priorIterationContext`, `progressContext` | runtime -> repo -> prior iteration -> progress |
| `fix-failure` | `cliExec` | 1700 | strategy, preflight, objective, task, rules, execution, final response | failure signature, blocker, remediation, validation context | `runtimeContext`, `repoContext`, `progressContext` | runtime -> repo -> progress |
| `fix-failure` | `ideHandoff` | 1100 | strategy, preflight, objective, task, rules, execution, final response | failure signature and blocker summary for manual inspection | `runtimeContext`, `repoContext`, `progressContext` | runtime -> repo -> progress |
| `human-review-handoff` | `cliExec` | 1500 | strategy, preflight, objective, task, rules, execution, final response | blocker, remediation, and current task state over broad history | `runtimeContext`, `repoContext`, `progressContext` | runtime -> repo -> progress |
| `human-review-handoff` | `ideHandoff` | 1100 | strategy, preflight, objective, task, rules, execution, final response | blocker and review decision points over broad history | `runtimeContext`, `repoContext`, `progressContext` | runtime -> repo -> progress |
| `replenish-backlog` | `cliExec` | 1800 | strategy, preflight, objective, task, rules, execution, final response | PRD, backlog counts, and expanded repo/runtime context for task generation | `priorIterationContext` | prior iteration |
| `replenish-backlog` | `ideHandoff` | 1300 | strategy, preflight, objective, task, rules, execution, final response | PRD, backlog counts, and explicit next-task generation context | `priorIterationContext` | prior iteration |

Ralph also compacts high-volume inputs before omission:

- objective text is clipped to a prompt-kind budget instead of copying the full PRD
- progress history is clipped to recent lines instead of replaying the whole durable log
- prior-iteration feedback is filtered toward the selected task so unrelated failures and file lists do not crowd out the current task
- repo context includes only the fields that match the selected task, prompt kind, and execution path, so docs-focused CLI work can skip source-root, package-manager, and test inventory when those fields are not relevant

When quota pressure matters, inspect `latest-prompt-evidence.json` first. The `promptBudget` block records the selected policy name, target token budget, minimum-context bias, estimated token count and range, whether the final prompt actually landed within target, the token delta from that target, which sections are always required, which sections are optional for that policy, the fixed omission order for optional sections, the sections that survived, and any sections Ralph omitted to stay compact.

For CLI runs, quota control also includes reasoning effort. `ralphCodex.reasoningEffort` defaults to `medium`; raise it to `high` only as an explicit escalation for architecture-heavy work, hard debugging, or remediation-heavy retries where the additional token cost is justified.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. Each iteration uses the same preflight, prompt, execution, verification, and classification pipeline.
3. The loop repeats until it hits `ralphCodex.ralphIterationCap` or a semantic stop reason.
4. The built-in loop stays sequential and single-agent; Ralph does not expand into broader multi-agent orchestration here.

### Run The Multi-Agent Loop

1. Set `ralphCodex.agentCount` to the number of concurrent agents you want (minimum 2 for parallel mode).
2. Run `Ralph Codex: Run Multi-Agent Loop`.
3. Ralph spawns `ralphCodex.agentCount` concurrent iteration loops, each using a distinct `agentId` derived from `ralphCodex.agentId` (e.g., `default-1`, `default-2`).
4. Each agent loop acquires task claims independently using the existing claim mechanism in `.ralph/claims.json`, so agents pick up different tasks without coordination overhead.
5. All agent loops run concurrently and Ralph waits for all of them to finish before reporting the combined summary.
6. If `ralphCodex.agentCount` is 1 the command behaves like `Run CLI Loop` and surfaces a warning suggesting you increase the count.
7. If any agent hits `control_plane_reload_required` and `autoReloadOnControlPlaneChange` is enabled, Ralph reloads the extension host once all other loops have settled.

Ensure each concurrent loop instance has `ralphCodex.agentId` set to a unique base value (or rely on the auto-suffix scheme) so claim attribution in `.ralph/claims.json` stays distinct.

### Autonomous Loop Mode

`ralphCodex.autonomyMode` is the high-level loop-control shortcut. `supervised` is the default and leaves the underlying loop settings as configured. `autonomous` forces three effective settings at runtime regardless of their stored values: `autoReloadOnControlPlaneChange = true`, `autoApplyRemediation = ["decompose_task", "mark_blocked"]`, and `autoReplenishBacklog = true`.

Autonomous mode widens what Ralph may do without another click, but it does not remove hard stops. These stops are never automated and still require an operator decision even when autonomy mode is `autonomous`:

- `needs_human_review` outcomes still stop the loop and surface `request_human_review` as the next action instead of auto-continuing
- remediation artifacts that recommend `request_human_review` still remain operator-owned decisions
- initial PRD authorship is always manual; autonomous mode assumes `.ralph/prd.md` already contains a human-authored repository objective
- blocked preflight remains a hard stop; autonomous mode does not bypass missing PRD requirements, task-ledger drift, claim conflicts, or other blocking control-plane diagnostics

Enable autonomous mode only when the safety dependencies are already satisfied:

- the T28 ledger gate is passing, so preflight is not reporting task-ledger drift or other blocking control-plane inconsistencies
- the T24 claim-ownership path is active before concurrent multi-agent use, so each worker has a unique `agentId` and durable claim attribution in `.ralph/claims.json`

Recommended pre-flight checklist before switching to `autonomous`:

- the durable ledger is clean and preflight is not surfacing drift or stale-claim blockers
- `.ralph/tasks.json` has already been human-reviewed for the next bounded work slice
- the selected validation command has been confirmed executable in the current workspace

Treat `autonomous` as a trust-conserving convenience mode, not a principal change. The operator still decides the objective, owns the backlog, and must handle the hard stops before another loop run begins.

If a stop reason is `repeated_no_progress` or `repeated_identical_failure` on the same selected task, Ralph records a narrow remediation action so the operator can decide whether to decompose the task, reframe it around a deterministic failure, mark it blocked after repeated blocked starts, or request human review before starting another run.

`ralphCodex.autoApplyRemediation` accepts only `decompose_task` and `mark_blocked`. Configuring `reframe_task` or `request_human_review` has no effect: `reframe_task` requires an operator decision about task scope before the next attempt, and `request_human_review` signals that the loop evidence no longer supports automated continuation. Auto-applying either would bypass the human judgment each action is designed to surface. Auto-application of a supported action is recorded in the iteration result warnings so operators can confirm what changed.

Use the remediation surfaces in this order when a loop stops repeatedly:

1. `Show Status` to read the remediation summary, action, attempt count, human-review flag, and proposal path.
2. `Open Latest Ralph Summary` when you want the newest human-readable iteration narrative.
3. Open `.ralph/artifacts/latest-remediation.json` or the iteration-local `task-remediation.json` when you need the exact trigger history, evidence list, and suggested child tasks.
4. Run `Apply Latest Task Decomposition Proposal` only after you have decided that the bounded child-task set is the right next step when auto-apply is not enabled.

Before treating `decompose_task` as the next move, confirm the proposal still fits Ralph's bounded decomposition shape:

- the proposal only targets the currently selected task that triggered the repeated stop
- it suggests at most 3 child tasks
- the suggested children stay one level deep under that parent instead of introducing grandchildren or unrelated backlog edits
- the first child should reproduce the blocker with the same inherited validation command before the later child tries to fix it
- the next child should be the smallest bounded fix for that reproduced blocker, leaving any verification rerun as its own later step when needed
- the children form a short sequential chain and reuse the parent's validation command rather than inventing a new validation path
- if the recorded evidence cannot justify that small deterministic set, Ralph should prefer `reframe_task`, `request_human_review`, or `no_action`

Backlog replenishment is a different path. Use it only when the durable task ledger is consistent and there is genuinely no actionable work left. If a parent task is marked `done` while descendants are still `todo`, `in_progress`, or `blocked`, that is task-ledger drift, not clean exhaustion, and the next step is to repair `.ralph/tasks.json` instead of adding fresh tasks.

### Backlog Replenishment

`ralphCodex.autoReplenishBacklog` lets the loop continue into the replenish-backlog prompt kind after a `no_actionable_task` stop, but that is only safe when preflight says the durable ledger is still internally consistent.

On activation, Ralph writes the effective autonomy mode and those three resolved settings to the `Ralph Codex` output channel so the operator can confirm whether the extension is running in supervised or autonomous mode.

The safety gate is the preflight drift check. Ralph only auto-replenishes when the selector found no actionable task, the current result recorded `no_actionable_task`, and preflight found no error-severity ledger-drift diagnostics such as `ledger_drift` or `done_parent_unfinished_descendants`.

That check matters because “no actionable task” can mean two very different things:

- the backlog is genuinely clean and ready for the next bounded slice
- the task graph is contradictory, so safe selection stopped before Ralph could trust the ledger

Use the setting only for the first case. Leave it off when you want explicit operator review before Ralph adds more backlog, and treat any drift diagnostic as a repair-first stop even if auto-replenishment is enabled.

If an iteration changes control-plane runtime files, the loop stops with `control_plane_reload_required` after persisting the current iteration so the operator can rerun Ralph in a fresh process.

### Control-Plane Reload

`ralphCodex.autoReloadOnControlPlaneChange` defaults to `false`. Leave it off when you want to inspect the persisted result first and restart the loop manually after a control-plane stop.

When the setting is `true`, only `Run CLI Loop` auto-reloads. `Run CLI Iteration` stays single-shot even if the result stop reason is `control_plane_reload_required`.

When auto-reload is enabled, the loop waits 1500 ms before it invokes the VS Code reload command `workbench.action.reloadWindow`. That short flush delay gives the extension host time to finish writing the already-persisted iteration result, latest pointers, and operator-facing summary surfaces before VS Code tears the process down.

`workbench.action.reloadWindow` is only safe in this narrow path because the iteration outcome was already durably recorded before the reload fires. Ralph is not relying on in-memory loop state surviving the reload.

Stop reasons and precedence rules are defined in [docs/verifier.md](verifier.md).

## Artifact Lifecycle During Long Loops

Use this mental model while a loop runs for hours or across fresh sessions:

- Durable operator state stays in `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, and `.ralph/state.json`.
- Generated execution evidence accumulates in `.ralph/prompts/`, `.ralph/runs/`, `.ralph/artifacts/iteration-###/`, `.ralph/artifacts/runs/<provenance-id>/`, and clean-stop handoff notes in `.ralph/handoff/`.
- Stable latest entry points under `.ralph/artifacts/` are the supported inspection surface for the newest prompt, plan, CLI invocation, summary, preflight, and provenance evidence.

Automatic cleanup on prompt or iteration writes is bounded by two settings:

- `ralphCodex.generatedArtifactRetentionCount` keeps the newest generated prompts, run artifacts, iteration directories, and handoff notes first, then adds older protected references from `.ralph/state.json`, latest-pointer JSON artifacts, and latest summary surfaces.
- `ralphCodex.provenanceBundleRetentionCount` keeps the newest provenance bundles first, then adds older bundles that a latest pointer still references.

The practical effect is that Ralph may delete older generated artifacts once they fall outside the newest retained window and no protected reference still points at them. It should not delete the current durable state or the latest inspection entry points just because retention ran.

Manual maintenance has two different scopes:

- `Ralph Codex: Cleanup Runtime Artifacts` preserves the durable PRD, progress log, task file, `.ralph/state.json`, and stable latest evidence surfaces while pruning older generated prompts, transcript and last-message files, iteration directories, older provenance bundles, and extension logs.
- `Ralph Codex: Reset Runtime State` is broader and removes generated runtime state, prompts, runs, iteration artifacts, and logs. It still preserves the durable PRD, progress log, and task file, but it is not the right command when you want to keep loop continuity.

Recovery is intentionally narrow and deterministic:

- If `latest-summary.md`, `latest-preflight-summary.md`, or `latest-provenance-summary.md` is missing but the matching latest JSON record still exists, Ralph repairs the Markdown surface from that JSON record.
- `Open Latest CLI Transcript` falls back to the newest last-message artifact when the latest CLI invocation has no transcript path or the transcript is unavailable.
- When the latest JSON artifact is gone too, Ralph reports the surface as stale instead of fabricating new provenance.

Use this recovery matrix when artifacts go missing mid-loop:

- missing latest Markdown summary, matching latest JSON still present: run `Show Status` or the matching open-latest command and let Ralph repair the derived Markdown surface
- missing transcript, latest CLI invocation still points to a surviving last-message file: use `Open Latest CLI Transcript` and inspect the last-message fallback
- missing latest JSON pointer or missing provenance-bundle directory: treat the newest summary as incomplete evidence, inspect the remaining latest files, and rerun Ralph instead of expecting synthetic repair
- disk pressure from long runs with continuity still needed: use `Cleanup Runtime Artifacts`, then re-check `Show Status` for the retained windows and any stale latest paths
- operator wants to discard loop runtime history intentionally: use `Reset Runtime State`, then prepare or run a fresh iteration from the remaining durable PRD, progress log, and task graph

Use the inspection commands by question, not just by file name:

- `Show Status`: "What is Ralph doing now, what did the last few iterations do, and did retention or latest-surface repair change anything?"
- `Open Latest Ralph Summary`: "What was the newest iteration outcome in human-readable form?"
- `Open Latest Prompt Evidence`: "Which template, task context, and inspected root snapshot produced the current prompt?"
- `Open Latest CLI Transcript`: "What did `codex exec` print, or what last message survived when the transcript is unavailable?"
- `Open Latest Provenance Bundle` or `Reveal Latest Provenance Bundle Directory`: "Which persisted proof artifacts back the newest attempt end to end?"

## Inspect State

- `Ralph Codex: Show Status` writes a readable summary to the `Ralph Codex` output channel.
- The status summary includes the current loop/preflight snapshot, the latest iteration, the latest prompt-budget policy, required versus optional prompt sections plus omission order and kept versus omitted sections, current planned prompt byte count, current CLI reasoning effort when available, recent iteration and run history from `.ralph/state.json`, the latest remediation summary plus action, attempt count, human-review flag, proposed child-task count and dependency sketch when available, and proposal path when repeated-stop guidance exists, the current generated-artifact and provenance-bundle retention windows including protected retained entries, and whether any missing latest-summary/latest-provenance surfaces were repaired or remain stale during the status refresh.
- The same status summary also keeps the task-claim lifecycle explicit: it shows the current claim holder for the selected task, groups all active claims by `agentId` with task id, task title, claim timestamp, and stale/fresh state, reminds the operator that only CLI execution owns blocking claim acquire/release, and points stale-claim recovery through `Ralph Codex: Resolve Stale Task Claim` when a stale canonical holder is blocking reselection.
- If preflight blocks on task-ledger drift such as a parent marked `done` while any descendant remains `todo`, `in_progress`, or `blocked`, repair `.ralph/tasks.json` first instead of retrying Codex on the same stale graph.
- A clean repair usually means one of two changes:
- reopen the parent to `todo` or `in_progress` so the unfinished descendants remain visible under an active parent
- or, if the parent is truly complete, finish or deliberately block each remaining descendant so the tree no longer contradicts itself
- Do not replenish the backlog while that contradiction exists. The replenish-backlog prompt kind can appear because the selector found no actionable task, but when the summary says `No task selected because task-ledger drift blocks safe selection: ...`, treat it as a repair instruction, not permission to invent more work.
- After the repair, rerun `Show Status` or preflight. Replenish the backlog only if task counts still show no actionable `todo` or `in_progress` work on a now-consistent graph.
- `Ralph Codex: Open Latest Ralph Summary` opens the newest human-readable summary surface.
- `Ralph Codex: Open Latest Provenance Bundle` opens the newest provenance summary surface.
- `Ralph Codex: Open Latest Prompt Evidence` opens `latest-prompt-evidence.json` for direct prompt-context inspection.
- `Ralph Codex: Open Latest CLI Transcript` opens the newest CLI transcript and falls back to the newest last-message artifact when a transcript path is unavailable.
- `Ralph Codex: Apply Latest Task Decomposition Proposal` requires explicit operator confirmation before it manually applies the latest approved `decompose_task` proposal into `.ralph/tasks.json`.
- `Ralph Codex: Reveal Latest Provenance Bundle Directory` reveals the newest run-bundle directory for folder-level inspection.
- `Ralph Codex: Cleanup Runtime Artifacts` preserves `.ralph/state.json`, the durable PRD/progress/tasks, and latest Ralph evidence while pruning older generated prompts, run artifacts, iteration directories, older provenance bundles, and extension logs.

For routine long-loop inspection, use these commands in order:

1. `Show Status` to confirm the selected task, recent history, retention windows, and any repaired or stale latest surfaces.
2. `Open Latest Ralph Summary` to read the newest human-readable iteration outcome.
3. `Open Latest Prompt Evidence` plus `Open Latest CLI Transcript` when you need to inspect what Ralph rendered and what Codex returned.
4. `Open Latest Provenance Bundle` or `Reveal Latest Provenance Bundle Directory` when you need the full persisted proof set for the newest attempt.

These commands rely on the stable latest-pointer contract described in [docs/invariants.md](invariants.md).

## Multi-Agent Team

Use concurrent Ralph operators only when each running loop instance has its own durable agent identity.

### Configure `agentId`

Set `ralphCodex.agentId` to a unique stable value for each concurrent CLI loop or single-iteration worker. The default value is `default`, which is fine for one operator but intentionally surfaces a preflight warning when another active `default` claim already exists.

That setting is persisted onto active claims, run records, and iteration records so Ralph can attribute ownership durably across fresh sessions instead of inferring it from transient process state.

### Read The Multi-Agent Status View

`Show Status` and the human-readable preflight output now group active claims by `agentId`. Each group shows the claimed task id and title, the `claimedAt` timestamp, and whether the claim is still fresh or has gone stale.

Use that grouped view to answer three operator questions quickly:

- which agent currently owns which task
- whether a claim is old enough to investigate as stale before starting another loop
- whether a misconfigured shared `agentId` is making two workers look like the same actor

### Review Agent

Run `Ralph: Run Review Agent` when you want a bounded review pass over the currently selected Ralph task instead of another implementation attempt. This is the right pass after a build agent lands a change and you want Ralph to validate it, inspect the changed files, and call out missing tests, documentation gaps, or invariant violations before more code work continues.

The review agent is propose-only. It runs a single CLI iteration in `agentRole = review`, uses the dedicated review prompt template, and tells the model not to implement fixes. When the review finds gaps, it emits proposed follow-up tasks in `suggestedChildTasks` instead of editing source files or mutating `.ralph/tasks.json` directly.

If a review pass still edits relevant workspace files, Ralph treats that as an anomaly rather than progress: git-diff verification fails for the review run, the completion report cannot cleanly mark the task done, and the unexpected file list is surfaced in the persisted warnings.

Operator approval remains explicit:

- the review pass may persist a proposal artifact and surface suggested follow-up tasks
- the review pass does not commit those proposals into the durable task ledger by itself
- review proposals become real tasks only after the operator explicitly runs `Apply Latest Task Decomposition Proposal`

### Watchdog Agent

Run `Ralph: Run Watchdog Agent` when the multi-agent claim graph or recent iteration history suggests a worker is stuck, stale, or repeatedly failing and you want Ralph to attempt bounded recovery before escalating to a human.

The watchdog runs a single CLI iteration in `agentRole = watchdog` with a fixed `agentId = watchdog`. That gives it a stable recovery identity while keeping it outside the normal build-agent claim pool.

The watchdog may take these autonomous recovery actions when the evidence is strong enough:

- resolve a stale claim held by another agent when the canonical claim is still active but no fresh execution evidence exists
- apply a valid `decompose_task` proposal for a stalled task through the same bounded task-file write path used by the explicit decomposition apply command
- escalate a task to human review by appending a durable progress entry and writing a blocker on the affected task when no safe automated recovery exists

Use this escalation rule when the watchdog cannot recover safely:

- if the watchdog records an escalation, inspect the blocker and progress entry first, then decide whether to repair the task graph, reassign the work, or intervene manually before running more loops

### Source Control Agent

Run `Ralph: Run SCM Agent` when you want a single bounded SCM follow-through pass over the currently selected task, or use `agentRole = scm` for loops that are meant to watch the durable branch-per-task state and finish repository plumbing after build agents complete child slices.

The SCM-specific branch automation is still driven by the main CLI iteration flow rather than a separate hidden channel. With `ralphCodex.scmStrategy = branch-per-task`, the relevant branch names and base branch are recorded durably in `.ralph/claims.json`. With `ralphCodex.scmPrOnParentDone = true`, the parent auto-complete path will push `ralph/integration/<parentId>` and open a GitHub pull request through the `gh` CLI after the final child finishes.

That PR creation step is intentionally failure-tolerant:

- task completion still applies before Ralph attempts the push or PR
- a failed `git push` or missing `gh` executable is reported in iteration warnings
- those warnings do not reopen the completed parent or undo the child completion

## Reset State

`Ralph Codex: Cleanup Runtime Artifacts` is the narrower maintenance path. It keeps the current Ralph state and latest evidence surfaces intact, but trims older generated runtime clutter so operators can recover disk space or reduce stale artifacts without wiping loop continuity.

`Ralph Codex: Reset Runtime State` removes generated runtime state, prompts, run artifacts, iteration artifacts, and logs while preserving the durable PRD, progress log, and task file.

## Diagnostics

Preflight and status reporting surface:

- task graph errors, including source locations when available
- tracker drift such as done parents with unfinished descendants
- likely task-schema drift such as `dependencies` instead of `dependsOn`
- Codex CLI path verification state
- IDE command availability
- validation-command readiness

Use this operator decision rule when those surfaces mention backlog exhaustion and drift together:

- `The current durable Ralph backlog is exhausted...`: replenish `.ralph/tasks.json` with the next bounded task slice.
- `The task ledger is inconsistent...` or `No task selected because task-ledger drift blocks safe selection...`: repair `.ralph/tasks.json` first.
- `Task-ledger drift: Task <parent> is marked done but descendant tasks are still unfinished...`: inspect the parent/descendant statuses directly and make them agree before running another normal iteration.

Detailed semantics for those diagnostics live in [docs/invariants.md](invariants.md) and [docs/boundaries.md](boundaries.md).
