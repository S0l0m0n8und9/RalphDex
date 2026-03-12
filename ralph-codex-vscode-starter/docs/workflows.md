# Workflows

This document owns operator-facing command flows. Semantic rules for invariants, provenance, verifier behavior, and boundaries live in the focused docs linked below.

Related docs:

- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md)
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md)
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)
- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md)

## Develop The Extension

1. Run `npm install`.
2. Run `npm run compile`.
3. Start the Extension Development Host with `F5`.
4. Re-run `npm run compile` after TypeScript changes, or use `npm run watch`.

Use [docs/testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md) for the validation gate and test coverage.

## Package And Install A .vsix

1. Run `npm install` if dependencies are not present yet.
2. Run `npm run package` from the extension root.
3. Wait for `vsce package` to emit `ralph-codex-workbench-<version>.vsix` in the extension root directory.
4. In VS Code, run `Extensions: Install from VSIX...` and select the generated file.
5. Reload VS Code if prompted, then confirm the extension appears as `Ralph Codex Workbench`.

The package command is the supported release-build path for this repo. It first runs `npm run check:runtime` and then delegates to `vsce package`, which also triggers the `vscode:prepublish` compile hook before writing the archive. The published archive is intentionally limited to the compiled extension, prompt templates, bundled license, and operator-facing docs instead of the full development tree.

If you prefer a shell-driven local install, run `code --install-extension ./ralph-codex-workbench-<version>.vsix` from the extension root instead of using the command palette.

This workflow proves that the repo can build a distributable `.vsix`. It does not prove marketplace publishing or host-specific install UX; those remain manual operator checks.

## Prepare A Prompt For IDE Use

1. Run `Ralph Codex: Prepare Prompt` if you only want the next prompt file.
2. Run `Ralph Codex: Open Codex IDE` if you also want clipboard handoff and best-effort sidebar/new-chat commands.
3. Continue manually in the Codex IDE.

This path persists prepared-prompt evidence, not a full executed iteration result.

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

Use this path when a human should inspect or edit the prompt before execution. See [docs/provenance.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for the prepared-prompt-only trust distinction.

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

Per-iteration artifacts now also include `completion-report.json`, which records the parsed report, parse errors, or rejection warnings that explain whether Ralph applied the model's requested selected-task update.

When the same selected task stops with repeated no-progress, repeated blocked starts, or repeated identical failure evidence, the persisted iteration result, latest-result pointer, latest summary, and status report now also carry a bounded remediation recommendation. That recommendation stays deterministic and human-review-first; it does not trigger an automatic extra model pass.

If the latest remediation artifact proposes `decompose_task`, the default behavior is still propose-only. Review the artifact first, then run `Ralph Codex: Apply Latest Task Decomposition Proposal` only when you explicitly want Ralph to write the proposed child tasks into `.ralph/tasks.json`. That apply step adds the approved child tasks and makes the parent depend on them so the bounded subtasks run before the parent is retried.

The operator approval boundary is strict on purpose:

- Ralph can persist the proposal artifact automatically, but it cannot change `.ralph/tasks.json` until the operator runs `Apply Latest Task Decomposition Proposal`
- the apply command is only for the latest approved `decompose_task` artifact; `reframe_task`, `mark_blocked`, and `request_human_review` stay operator decisions outside automatic task-file edits
- approval is still validated at write time, so stale, duplicate, or graph-invalid proposed children are rejected instead of being forced into the task graph
- the approved write is narrow: Ralph appends the proposed child tasks and adds them as parent dependencies, but it does not reorder or rewrite unrelated tasks

On execution failures, the structured iteration result and latest-result pointer should also carry the summarized `codex exec` message, while the transcript and `stderr.log` keep the full raw process output for inspection.

For normal task execution, the prompt explicitly tells the model not to edit `.ralph/tasks.json` or `.ralph/progress.md` directly. Backlog replenishment is the exception: that prompt kind still updates the durable task file and progress log itself.

Use this path when you need repeatable execution plus deterministic result recording.

When `ralphCodex.generatedArtifactRetentionCount` is greater than `0`, Ralph prunes older generated prompt files, iteration directories, and transcript or last-message pairs after iteration provenance is persisted. Cleanup applies per category: it keeps the newest `N` entries by iteration first, then unions in only the protected roots from `.ralph/state.json`, the stable latest-pointer JSON artifacts, and the stable latest summary surfaces. Protected older references augment that newest-by-iteration window; they do not evict newer retained entries, and the reported retained list stays in newest-first order. Cleanup summaries also report which retained entries survived only because protection added them after the newest-by-iteration window. The protected state roots are `lastPromptPath`; `lastRun.promptPath`, `lastRun.transcriptPath`, and `lastRun.lastMessagePath`; `lastIteration.artifactDir`, `lastIteration.promptPath`, `lastIteration.execution.transcriptPath`, and `lastIteration.execution.lastMessagePath`; and the same prompt, transcript, last-message, and iteration-directory fields inside every `runHistory[]` and `iterationHistory[]` entry. The protected latest-pointer JSON artifacts are `latest-result.json`, `latest-preflight-report.json`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-bundle.json`, and `latest-provenance-failure.json`. `latest-result.json` can protect an older iteration directory, prompt, and transcript or last-message pair; `latest-preflight-report.json` protects only the referenced iteration directory; `latest-prompt-evidence.json` protects only the prompt file and iteration directory implied by its persisted `kind` and `iteration`; `latest-execution-plan.json` protects an older iteration directory and prompt; `latest-cli-invocation.json` protects an older iteration directory plus its transcript or last-message pair; and `latest-provenance-bundle.json` plus `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths, not prompt or run files in `.ralph/prompts/` or `.ralph/runs/`. As a fallback, `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` can each protect only the iteration directory implied by their persisted iteration heading or `- Iteration:` line.

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

The built-in policy matrix is:

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

If a stop reason is `repeated_no_progress` or `repeated_identical_failure` on the same selected task, Ralph records a narrow remediation action so the operator can decide whether to decompose the task, reframe it around a deterministic failure, mark it blocked after repeated blocked starts, or request human review before starting another run.

Use the remediation surfaces in this order when a loop stops repeatedly:

1. `Show Status` to read the remediation summary, action, attempt count, human-review flag, and proposal path.
2. `Open Latest Ralph Summary` when you want the newest human-readable iteration narrative.
3. Open `.ralph/artifacts/latest-remediation.json` or the iteration-local `task-remediation.json` when you need the exact trigger history, evidence list, and suggested child tasks.
4. Run `Apply Latest Task Decomposition Proposal` only after you have decided that the bounded child-task set is the right next step.

Before treating `decompose_task` as the next move, confirm the proposal still fits Ralph's bounded decomposition shape:

- the proposal only targets the currently selected task that triggered the repeated stop
- it suggests at most 3 child tasks
- the suggested children stay one level deep under that parent instead of introducing grandchildren or unrelated backlog edits
- the first child should reproduce the blocker with the same inherited validation command before the later child tries to fix it
- the next child should be the smallest bounded fix for that reproduced blocker, leaving any verification rerun as its own later step when needed
- the children form a short sequential chain and reuse the parent's validation command rather than inventing a new validation path
- if the recorded evidence cannot justify that small deterministic set, Ralph should prefer `reframe_task`, `request_human_review`, or `no_action`

Backlog replenishment is a different path. Use it only when the durable task ledger is consistent and there is genuinely no actionable work left. If a parent task is marked `done` while descendants are still `todo`, `in_progress`, or `blocked`, that is task-ledger drift, not clean exhaustion, and the next step is to repair `.ralph/tasks.json` instead of adding fresh tasks.

If an iteration changes control-plane runtime files, the loop stops with `control_plane_reload_required` after persisting the current iteration so the operator can rerun Ralph in a fresh process.

Stop reasons and precedence rules are defined in [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md).

## Artifact Lifecycle During Long Loops

Use this mental model while a loop runs for hours or across fresh sessions:

- Durable operator state stays in `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/tasks.json`, and `.ralph/state.json`.
- Generated execution evidence accumulates in `.ralph/prompts/`, `.ralph/runs/`, `.ralph/artifacts/iteration-###/`, and `.ralph/artifacts/runs/<provenance-id>/`.
- Stable latest entry points under `.ralph/artifacts/` are the supported inspection surface for the newest prompt, plan, CLI invocation, summary, preflight, and provenance evidence.

Automatic cleanup on prompt or iteration writes is bounded by two settings:

- `ralphCodex.generatedArtifactRetentionCount` keeps the newest generated prompts, run artifacts, and iteration directories first, then adds older protected references from `.ralph/state.json`, latest-pointer JSON artifacts, and latest summary surfaces.
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
- `Ralph Codex: Apply Latest Task Decomposition Proposal` requires explicit operator confirmation before it applies the latest approved `decompose_task` proposal into `.ralph/tasks.json`.
- `Ralph Codex: Reveal Latest Provenance Bundle Directory` reveals the newest run-bundle directory for folder-level inspection.
- `Ralph Codex: Cleanup Runtime Artifacts` preserves `.ralph/state.json`, the durable PRD/progress/tasks, and latest Ralph evidence while pruning older generated prompts, run artifacts, iteration directories, older provenance bundles, and extension logs.

For routine long-loop inspection, use these commands in order:

1. `Show Status` to confirm the selected task, recent history, retention windows, and any repaired or stale latest surfaces.
2. `Open Latest Ralph Summary` to read the newest human-readable iteration outcome.
3. `Open Latest Prompt Evidence` plus `Open Latest CLI Transcript` when you need to inspect what Ralph rendered and what Codex returned.
4. `Open Latest Provenance Bundle` or `Reveal Latest Provenance Bundle Directory` when you need the full persisted proof set for the newest attempt.

These commands rely on the stable latest-pointer contract described in [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md).

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

Detailed semantics for those diagnostics live in [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md) and [docs/boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md).
