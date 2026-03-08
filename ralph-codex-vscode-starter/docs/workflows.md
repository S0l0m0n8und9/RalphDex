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

## Run One CLI Iteration

1. Run `Ralph Codex: Run CLI Iteration`.
2. Ralph emits a short preflight summary covering task graph, workspace/runtime, Codex adapter, and verifier readiness.
3. If preflight is blocked, Ralph persists blocked-start evidence and stops before `codex exec`.
4. Otherwise Ralph selects the next task, renders the prompt, writes the execution plan, verifies launch integrity, runs `codex exec`, verifies the outcome, and persists the iteration result.

Operator-facing artifacts for this path include:

- `.ralph/artifacts/latest-summary.md`
- `.ralph/artifacts/latest-preflight-summary.md`
- `.ralph/artifacts/latest-prompt.md`
- `.ralph/artifacts/latest-execution-plan.json`
- `.ralph/artifacts/latest-cli-invocation.json`
- `.ralph/artifacts/latest-provenance-summary.md`

On execution failures, the structured iteration result and latest-result pointer should also carry the summarized `codex exec` message, while the transcript and `stderr.log` keep the full raw process output for inspection.

Use this path when you need repeatable execution plus deterministic result recording.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. Each iteration uses the same preflight, prompt, execution, verification, and classification pipeline.
3. The loop repeats until it hits `ralphCodex.ralphIterationCap` or a semantic stop reason.

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
