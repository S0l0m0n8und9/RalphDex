# Workflows

## Develop The Extension

1. Run `npm install`.
2. Run `npm run compile`.
3. Start the Extension Development Host with `F5`.
4. Re-run `npm run compile` after TypeScript changes, or use `npm run watch` while iterating.

## Generate A Prompt For Manual IDE Use

1. Run `Ralph Codex: Prepare Prompt` if you only want the next prompt file.
2. Run `Ralph Codex: Open Codex IDE` if you also want clipboard handoff and best-effort sidebar/new-chat commands.
3. Continue manually in the Codex IDE.

Use this path when a human should inspect or edit the prompt before execution. This path does not create iteration-result artifacts because it does not run the full verifier/classification loop.

## Run One CLI Iteration

1. Run `Ralph Codex: Run CLI Iteration`.
2. The extension inspects the workspace, selects the next task, writes the prompt, runs `codex exec`, verifies the outcome, and persists the iteration result.
3. The extension writes prompt artifacts to `.ralph/prompts/`, CLI artifacts to `.ralph/runs/`, and iteration artifacts to `.ralph/artifacts/`.

Use this path when you need repeatable execution plus deterministic outcome recording.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. The extension repeats the iteration engine up to `ralphCodex.ralphIterationCap`.
3. The loop may stop earlier when a semantic stop criterion matches.

Current stop criteria include:

- selected task marked complete
- verification passed with no remaining subtasks for the selected task
- repeated no-progress iterations
- repeated identical blocked/failed/human-review outcomes
- explicit human-review-needed outcomes when configured
- `codex exec` failure
- no actionable task remaining

## Inspect Or Reset State

- `Ralph Codex: Show Status` writes the current runtime snapshot to the `Ralph Codex` output channel.
- `Ralph Codex: Reset Runtime State` keeps PRD, progress, and tasks, but removes `.ralph/state.json`, prompts, run artifacts, iteration artifacts, and logs.
- `Show Status` is the only supported command in an untrusted workspace. It inspects state without creating missing Ralph files.

## Git Safety Artifacts

- `ralphCodex.gitCheckpointMode = off`: no Git artifacts
- `ralphCodex.gitCheckpointMode = snapshot`: record pre/post `git status` snapshots when Git is available
- `ralphCodex.gitCheckpointMode = snapshotAndDiff`: also record a working-tree diff summary and checkpoint naming guidance

The extension does not create Git branches, tags, or worktrees.
