# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for three concrete paths:

- build repo-aware Ralph prompts from durable files,
- hand prompts to the Codex IDE through clipboard plus configurable VS Code command IDs,
- run controlled `codex exec` iterations with durable state, verification, and stop criteria under `.ralph/`.

## What The Extension Persists

- Objective text at `ralphCodex.prdPath` (`.ralph/prd.md` by default)
- Progress log at `ralphCodex.progressPath` (`.ralph/progress.md` by default)
- Task backlog at `ralphCodex.ralphTaskFilePath` (`.ralph/tasks.json` by default)
- Runtime state at `.ralph/state.json`, mirrored to VS Code workspace storage
- Generated prompts in `.ralph/prompts/`
- CLI transcripts and last messages in `.ralph/runs/`
- Per-iteration artifacts in `ralphCodex.artifactRetentionPath` (`.ralph/artifacts/` by default)
- Extension logs in `.ralph/logs/extension.log`

## Ralph Loop V2

Each CLI iteration runs explicit phases:

1. `inspect`
2. `select task`
3. `generate prompt`
4. `execute`
5. `collect result`
6. `verify`
7. `classify outcome`
8. `persist state`
9. `decide whether to continue`

Task selection is deterministic: first `in_progress`, then first `todo`. The loop does not use “AI decides completion” behavior. Completion and stop decisions come from task state, verifier results, and deterministic no-progress heuristics.

## Verifiers And Outcome Classes

The verifier layer is pluggable through `ralphCodex.verifierModes` and currently supports:

- `validationCommand`: runs `ralphCodex.validationCommandOverride`, then task-level validation hints, then inferred workspace validation commands
- `gitDiff`: records Git/file-change summaries and detects relevant workspace changes
- `taskState`: compares durable Ralph task/progress state before and after the iteration

Outcomes are classified as:

- `complete`
- `partial_progress`
- `no_progress`
- `blocked`
- `failed`
- `needs_human_review`

## Loop Stop Criteria

The loop stops when any of these conditions match:

- the selected task is marked complete,
- verification passes and no remaining subtasks are detected for the selected task,
- the configured iteration cap is reached,
- repeated no-progress iterations exceed `ralphCodex.noProgressThreshold`,
- repeated identical blocked/failed/human-review outcomes exceed `ralphCodex.repeatedFailureThreshold`,
- `needs_human_review` is classified and `ralphCodex.stopOnHumanReviewNeeded` is enabled,
- `codex exec` itself fails,
- no actionable `todo` or `in_progress` task remains.

No-progress detection is conservative and deterministic. It looks for repeated selection of the same task, unchanged task/progress files, no relevant file changes, and repeated identical validation failure signatures.

## Artifact Layout

Each iteration writes a deterministic folder such as `.ralph/artifacts/iteration-003/` containing:

- `prompt.md`
- `execution-summary.json`
- `verifier-summary.json`
- `iteration-result.json`
- `diff-summary.json` when available
- `stdout.log` and `stderr.log`
- verifier-specific files such as `validation-command.json` and `task-state.json`
- Git status snapshots when Git checkpointing is enabled and Git is available

The machine-readable iteration result records the iteration number, selected task id, prompt path, adapter used, execution status, verification status, completion classification, follow-up action, timestamps, warnings/errors, and artifact references.

## Git Checkpoint Mode

`ralphCodex.gitCheckpointMode` is non-destructive:

- `off`: no Git snapshots
- `snapshot`: capture pre/post iteration `git status` artifacts when Git is available
- `snapshotAndDiff`: capture status artifacts plus a working-tree diff summary and a suggested lightweight checkpoint ref name

The extension does not create branches, tags, or worktrees.

## Commands

- `Ralph Codex: Prepare Prompt` builds the next prompt file and optionally copies it to the clipboard.
- `Ralph Codex: Open Codex IDE` builds the next prompt, copies it, and best-effort opens the configured sidebar and new-chat commands.
- `Ralph Codex: Run CLI Iteration` runs one fully verified Ralph iteration.
- `Ralph Codex: Run CLI Loop` repeats the iteration engine until a stop criterion matches.
- `Ralph Codex: Show Status` writes the current runtime snapshot to the `Ralph Codex` output channel.
- `Ralph Codex: Reset Runtime State` preserves PRD/progress/tasks and removes generated runtime artifacts.

## Codex Boundary

- Interactive IDE handoff in this repo is clipboard plus configurable VS Code command IDs.
- Scripted automation in this repo is `codex exec`.
- `preferredHandoffMode = cliExec` changes the recommended path, but `Open Codex IDE` still performs clipboard handoff rather than running the CLI.
- Direct Codex composer injection is not supported by the public APIs used here. This repo does not implement or claim such a path.

## Activation And Trust

- The extension activates on command invocation.
- In untrusted workspaces it supports `Ralph Codex: Show Status` in limited mode.
- Prompt generation, IDE handoff, runtime reset, and CLI execution require workspace trust.
- Virtual workspaces are unsupported because the extension reads and writes local files and can run the Codex CLI.

## Development And Runtime

Use Node 20+ for packaging and dependency installation. Node 18 is intentionally no longer treated as a supported packaging runtime.

```bash
npm install
npm run compile
npm run validate
npm run package
```

- `npm run validate` is the authoritative compile + type-check + test gate.
- `npm run package` runs a Node runtime preflight and then `vsce package`.
- `scripts/ensure-node-version.js` fails fast when packaging is attempted on an older Node runtime.

## Reference Docs

- `docs/architecture.md`
- `docs/workflows.md`
- `docs/testing.md`
