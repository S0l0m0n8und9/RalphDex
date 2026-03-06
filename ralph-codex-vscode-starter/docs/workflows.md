# Workflows

## Develop The Extension

1. Run `npm run compile`.
2. Start the Extension Development Host with `F5`.
3. Re-run `npm run compile` after TypeScript changes, or use `npm run watch` while iterating.

`scripts/dev-loop.sh` is a convenience wrapper for `npm run compile` followed by `code .`.

## Generate A Prompt For Manual IDE Use

1. Run `Ralph Codex: Prepare Prompt` if you only want the next prompt file.
2. Run `Ralph Codex: Open Codex IDE` if you also want clipboard handoff and best-effort sidebar/new-chat commands.
3. Continue manually in the Codex IDE.

Use this path when a human needs to inspect or edit the prompt before execution. This path does not create `.ralph/runs/` artifacts.

## Run One CLI Iteration

1. Run `Ralph Codex: Run CLI Iteration`.
2. The extension writes the prompt to `.ralph/prompts/`.
3. The extension runs `codex exec` with the configured model, sandbox, and approval mode.
4. The extension writes `.ralph/runs/<name>.transcript.md` and `.ralph/runs/<name>.last-message.md`.
5. The extension records the result in `.ralph/state.json`.

Use this path when you need repeatable execution and durable artifacts.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. The extension repeats the single-iteration flow up to `ralphCodex.ralphIterationCap`.
3. The loop stops immediately on the first failed `codex exec`.

Each iteration starts from durable files, not chat memory.

## Inspect Or Reset State

- `Ralph Codex: Show Status` writes the current runtime snapshot to the `Ralph Codex` output channel.
- `Ralph Codex: Reset Runtime State` keeps PRD, progress, and tasks, but removes `.ralph/state.json`, prompts, run artifacts, and logs.
- `Show Status` is the only supported command in an untrusted workspace. It inspects state without creating missing Ralph files.

## Choose CLI Vs IDE Handoff

- Use CLI when the task should be reproducible, logged, or looped.
- Use IDE handoff when a person should review the prompt or continue interactively.
- If `preferredHandoffMode` is `cliExec`, the IDE handoff command still only copies the prompt and warns the user to run the CLI command instead.
