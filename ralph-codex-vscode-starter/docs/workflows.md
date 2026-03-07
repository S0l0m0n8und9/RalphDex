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

Prompt details for this path:

- templates come from `prompt-templates/` unless `ralphCodex.promptTemplateDirectory` overrides them
- the prompt target is `ideHandoff`, so the strategy section assumes clipboard/VS Code command handoff rather than scripted `codex exec`
- if the latest iteration requested human review, Ralph will prefer the `human-review-handoff` prompt kind
- Ralph still persists `prompt.md`, `prompt-evidence.json`, and `execution-plan.json` under `.ralph/artifacts/iteration-###/` plus stable latest-prompt/latest-plan pointers
- this path proves what Ralph prepared, but not what a human may later edit before running in the IDE

## Run One CLI Iteration

1. Run `Ralph Codex: Run CLI Iteration`.
2. The extension inspects the workspace and emits a short preflight summary covering task graph, workspace/runtime, Codex adapter, and validation/verifier readiness.
   Validation readiness now distinguishes between a selected command, an executable that was confirmed cheaply, and a command whose executable could not be confirmed before execution.
3. Every preflight run writes `.ralph/artifacts/iteration-###/preflight-report.json` plus `.ralph/artifacts/iteration-###/preflight-summary.md`.
4. If preflight finds a severe issue, iteration is blocked before `codex exec` starts and the newest blocked-start evidence is also exposed through `.ralph/artifacts/latest-summary.md`, `.ralph/artifacts/latest-result.json`, `.ralph/artifacts/latest-preflight-report.json`, and `.ralph/artifacts/latest-preflight-summary.md`.
5. Otherwise Ralph selects the next task, writes the prompt, persists `execution-plan.json`, verifies that the prompt artifact hash still matches the plan, runs `codex exec`, verifies the outcome, and persists the iteration result.
6. The extension writes prompt artifacts to `.ralph/prompts/`, CLI artifacts to `.ralph/runs/`, and iteration artifacts to `.ralph/artifacts/`.
7. CLI runs also persist `cli-invocation.json`, which records the exact command path, args, workspace root, prompt artifact path, planned prompt hash, and stdin hash.
8. The newest preflight evidence remains discoverable through the dedicated latest-preflight pointers even after later iterations succeed.

Prompt details for this path:

- the prompt target is `cliExec`, so the strategy section assumes autonomous scripted execution and concise result reporting
- prompt kind stays deterministic: `bootstrap`, `iteration`, `fix-failure`, `continue-progress`, or `human-review-handoff`
- prior verifier feedback is carried forward only as a compact structured summary, never as raw logs
- `ralphCodex.promptPriorContextBudget` limits how much prior evidence is injected into the next prompt

How to verify what actually ran:

- inspect `.ralph/artifacts/latest-execution-plan.json`
- confirm the prompt text at the referenced `promptArtifactPath`
- inspect `.ralph/artifacts/latest-cli-invocation.json`
- confirm `stdinHash` matches the plan’s `promptHash`
- confirm `Show Status` or `latest-summary.md` reports `Payload matched rendered artifact: yes`

Use this path when you need repeatable execution plus deterministic outcome recording.

## Run The Ralph Loop

1. Run `Ralph Codex: Run CLI Loop`.
2. Each iteration starts with the same deterministic preflight summary.
3. The extension repeats the iteration engine up to `ralphCodex.ralphIterationCap`.
4. The loop may stop earlier when a semantic stop criterion matches or when preflight blocks execution.

Current stop criteria include:

- selected task marked complete when no durable backlog remains
- verification passed with no remaining subtasks for the selected task
- repeated no-progress iterations
- repeated identical blocked/failed/human-review outcomes
- explicit human-review-needed outcomes when configured
- `codex exec` failure
- no actionable task remaining

## Inspect Or Reset State

- `Ralph Codex: Show Status` writes a readable runtime summary to the `Ralph Codex` output channel, including current task, current/latest planned prompt kind, last executed prompt kind, template path, target mode, and whether the execution payload matched the rendered artifact.
- `Ralph Codex: Open Latest Ralph Summary` opens `.ralph/artifacts/latest-summary.md` directly when present and falls back to `.ralph/artifacts/latest-preflight-summary.md` when the newest persisted evidence is a blocked preflight.
- `Ralph Codex: Reset Runtime State` keeps PRD, progress, and tasks, but removes `.ralph/state.json`, prompts, run artifacts, iteration artifacts, and logs.
- `Show Status` is the only supported command in an untrusted workspace. It inspects state without creating missing Ralph files.

## Diagnostics And Adapter Confidence

- Task graph errors cite task ids plus task-file source locations where the raw JSON made that available.
- Likely schema-drift aliases such as `dependencies` are rejected and the diagnostic points back to `dependsOn`.
- Codex CLI reporting distinguishes explicit verified paths, missing explicit paths, non-executable explicit paths, and PATH-only assumptions.
- Validation-command reporting distinguishes a selected command from an executable that was confirmed before execution.
- IDE handoff reporting warns when the configured Codex sidebar/new-chat commands are not actually registered in the current VS Code host.

## Prompt Templates And Evidence

- Bundled prompt templates live in `prompt-templates/` and are keyed by prompt kind.
- `ralphCodex.promptTemplateDirectory` can point at a workspace-relative or absolute override directory.
- Each generated prompt records its template path, selection reason, and compact structured inputs in `prompt-evidence.json`.
- `.ralph/artifacts/latest-prompt.md` and `.ralph/artifacts/latest-prompt-evidence.json` are the stable entry points for the newest generated prompt surfaces.
- `.ralph/artifacts/latest-execution-plan.json` and `.ralph/artifacts/latest-cli-invocation.json` are the stable entry points for the newest provenance surfaces.

## Git Safety Artifacts

- `ralphCodex.gitCheckpointMode = off`: no Git artifacts
- `ralphCodex.gitCheckpointMode = snapshot`: record pre/post `git status` snapshots when Git is available
- `ralphCodex.gitCheckpointMode = snapshotAndDiff`: also record a working-tree diff summary and checkpoint naming guidance

The extension does not create Git branches, tags, or worktrees.
