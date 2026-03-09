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

The package command is the supported release-build path for this repo. It first runs `npm run check:runtime` and then delegates to `vsce package`, which also triggers the `vscode:prepublish` compile hook before writing the archive.

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
2. Ralph emits a short preflight summary covering task graph, workspace/runtime, Codex adapter, and verifier readiness.
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

On execution failures, the structured iteration result and latest-result pointer should also carry the summarized `codex exec` message, while the transcript and `stderr.log` keep the full raw process output for inspection.

For normal task execution, the prompt explicitly tells the model not to edit `.ralph/tasks.json` or `.ralph/progress.md` directly. Backlog replenishment is the exception: that prompt kind still updates the durable task file and progress log itself.

Use this path when you need repeatable execution plus deterministic result recording.

When `ralphCodex.generatedArtifactRetentionCount` is greater than `0`, Ralph prunes older generated prompt files, iteration directories, and transcript or last-message pairs after iteration provenance is persisted. Cleanup applies per category: it keeps the newest `N` entries by iteration first, then unions in only the protected roots from `.ralph/state.json`, the stable latest-pointer JSON artifacts, and the stable latest summary surfaces. Protected older references augment that newest-by-iteration window; they do not evict newer retained entries, and the reported retained list stays in newest-first order. Cleanup summaries also report which retained entries survived only because protection added them after the newest-by-iteration window. The protected state roots are `lastPromptPath`; `lastRun.promptPath`, `lastRun.transcriptPath`, and `lastRun.lastMessagePath`; `lastIteration.artifactDir`, `lastIteration.promptPath`, `lastIteration.execution.transcriptPath`, and `lastIteration.execution.lastMessagePath`; and the same prompt, transcript, last-message, and iteration-directory fields inside every `runHistory[]` and `iterationHistory[]` entry. The protected latest-pointer JSON artifacts are `latest-result.json`, `latest-preflight-report.json`, `latest-prompt-evidence.json`, `latest-execution-plan.json`, `latest-cli-invocation.json`, `latest-provenance-bundle.json`, and `latest-provenance-failure.json`. `latest-result.json` can protect an older iteration directory, prompt, and transcript or last-message pair; `latest-preflight-report.json` protects only the referenced iteration directory; `latest-prompt-evidence.json` protects only the prompt file and iteration directory implied by its persisted `kind` and `iteration`; `latest-execution-plan.json` protects an older iteration directory and prompt; `latest-cli-invocation.json` protects an older iteration directory plus its transcript or last-message pair; and `latest-provenance-bundle.json` plus `latest-provenance-failure.json` protect only the referenced iteration directory through their persisted iteration-scoped artifact paths, including provenance-failure JSON and summary paths, not prompt or run files in `.ralph/prompts/` or `.ralph/runs/`. As a fallback, `latest-summary.md`, `latest-preflight-summary.md`, and `latest-provenance-summary.md` can each protect only the iteration directory implied by their persisted iteration heading or `- Iteration:` line.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. Each iteration uses the same preflight, prompt, execution, verification, and classification pipeline.
3. The loop repeats until it hits `ralphCodex.ralphIterationCap` or a semantic stop reason.
4. The built-in loop stays sequential and single-agent; Ralph does not expand into broader multi-agent orchestration here.

If an iteration changes control-plane runtime files, the loop stops with `control_plane_reload_required` after persisting the current iteration so the operator can rerun Ralph in a fresh process.

Stop reasons and precedence rules are defined in [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md).

## Inspect State

- `Ralph Codex: Show Status` writes a readable summary to the `Ralph Codex` output channel.
- `Ralph Codex: Open Latest Ralph Summary` opens the newest human-readable summary surface.
- `Ralph Codex: Open Latest Provenance Bundle` opens the newest provenance summary surface.
- `Ralph Codex: Reveal Latest Provenance Bundle Directory` reveals the newest run-bundle directory for folder-level inspection.

These commands rely on the stable latest-pointer contract described in [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md).

## Reset State

`Ralph Codex: Reset Runtime State` removes generated runtime state, prompts, run artifacts, iteration artifacts, and logs while preserving the durable PRD, progress log, and task file.

## Diagnostics

Preflight and status reporting surface:

- task graph errors, including source locations when available
- likely task-schema drift such as `dependencies` instead of `dependsOn`
- Codex CLI path verification state
- IDE command availability
- validation-command readiness

Detailed semantics for those diagnostics live in [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md) and [docs/boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md).
