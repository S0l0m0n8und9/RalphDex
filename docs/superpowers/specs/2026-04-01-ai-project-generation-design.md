# AI-Driven PRD and Task Generation on New Project Creation

**Date:** 2026-04-01
**Status:** Approved

## Problem

When a user runs `Ralphdex: Initialize Workspace` or `Ralphdex: New Project` and enters an objective, Ralph today writes that objective verbatim into `prd.md` as a two-line placeholder, then derives tasks by extracting markdown headings from that trivial text. The user is told to "refine with your AI assistant" — meaning the useful work happens outside Ralph's init flow, and the files opened are essentially stubs.

## Goal

When an objective is entered, Ralph should immediately invoke the configured CLI provider to reason over the objective and produce:

1. A proper draft `prd.md` (title, overview, goals, H2 work-area sections)
2. A reasoned `tasks.json` with one task per major section

The user should see a progress message while this is happening. Both files should be ready for review when they open.

## Architecture

### New module: `src/ralph/projectGenerator.ts`

Single exported function:

```ts
export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string,
  tmpDir: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }>
```

**Steps:**

1. Build a generation prompt (constant template in this file) that instructs the AI to:
   - Write a full PRD in markdown (title, overview, goals, H2 sections for major work areas)
   - End the response with a fenced `json` block containing a task array: `[{ "id": "T1", "title": "...", "status": "todo" }, ...]`
   - Keep tasks scoped to top-level deliverables (3–7 tasks typical)

2. Create a `CliProvider` using `createCliProvider(config)` (exported from `providerFactory.ts`).

3. Construct a minimal `CodexExecRequest`-compatible object with only the fields used by each provider's `buildLaunchSpec`:
   - `prompt` — the generation prompt with objective injected
   - `model` — from config
   - `executionRoot` / `cwd` — workspace root
   - `lastMessagePath` — a temp file path (needed by Codex provider for `--output-last-message`)
   - Remaining required fields set to safe defaults (empty strings for unused paths/hashes, config values for codex-specific options)

4. Call `provider.buildLaunchSpec(request, true)` to get `{ args, cwd, stdinText }`.

5. Call `runProcess(commandPath, args, { cwd, stdinText })` directly — no loop machinery, no provenance, no artifacts.

6. Call `provider.extractResponseText(stdout, stderr, lastMessagePath)` to get the response string.

7. Parse the response:
   - Find the last ```` ```json ```` fence in the response
   - Everything before it (trimmed) → `prdText`
   - Content inside the fence → `JSON.parse` → validate it is an array with `id`, `title`, `status` fields
   - If either parse step fails, throw a `ProjectGenerationError` with a descriptive message

8. Return `{ prdText, tasks }`.

**Error handling:** Any thrown error (CLI not found, non-zero exit, parse failure) propagates to the caller. No fallback logic lives in this module — that is the caller's responsibility.

### Changes to `src/codex/providerFactory.ts`

Export the existing private `createCliProvider(config)` function so `projectGenerator.ts` can use it without duplicating the provider-construction logic.

### Changes to `src/commands/registerCommands.ts`

Both `initializeWorkspace` and `newProject` handlers get the same updated flow after the user enters an objective:

```
objective entered
  └─ progress.report("Generating PRD and tasks — this may take a moment…")
  └─ try generateProjectDraft(objective, config, workspaceRoot, tmpDir)
       ├─ success → write prdText to prd.md, write tasks to tasks.json
       └─ failure → log warning, fall back to today's behaviour (raw objective + draftTasksFromPrd)
                    show warning message: "AI generation failed — files seeded with a starter template. Refine before running."
  └─ open prd.md, open tasks.json
  └─ show existing info message ("review and refine…")
```

`readConfig(workspaceFolder)` is **not** currently called inside `initializeWorkspace` or `newProject`. Both handlers must call `readConfig(workspaceFolder)` at the top of their handler body (after `withWorkspaceFolder`) to obtain the CLI provider config. The `tmpDir` is `os.tmpdir()`.

**No change to the user-facing input prompt** — same `showInputBox` as today.

### Response format contract

The generation prompt pins the AI to this output structure:

```
# <Project Title>

## Overview
...

## Goals
...

## <Work Area 1>
...

## <Work Area N>
...

```json
[
  { "id": "T1", "title": "...", "status": "todo" },
  { "id": "T2", "title": "...", "status": "todo" }
]
```
```

The fenced `json` block is the same structural pattern as the existing completion-report contract. The task shape (`id`, `title`, `status`) is exactly what `appendTasksToFile` accepts — no mapping needed.

## Error / fallback behaviour

| Failure mode | Behaviour |
|---|---|
| CLI binary not found | Catch `ProcessLaunchError`, fall back, warn |
| CLI exits non-zero | Fall back, warn with exit code |
| Response has no JSON fence | `ProjectGenerationError`, fall back, warn |
| JSON parses but is not a valid array | `ProjectGenerationError`, fall back, warn |
| Empty objective (user pressed Escape) | Skip generation entirely, write placeholder as today |

## What is not changing

- The `showInputBox` prompt text and validation
- `draftTasksFromPrd` / `parsePrdSections` — still used as fallback
- File locking, provenance, artifact retention — not involved
- The "review and refine" info message shown after files open

## Testing

- Unit tests for `generateProjectDraft` with a `processRunnerOverride` (already supported via `setProcessRunnerOverride`) to inject canned CLI output — covers happy path, malformed JSON fence, empty response
- Unit tests for the response parser in isolation — covers no fence, valid fence, fence with invalid JSON
- Existing init/newProject command tests remain valid; the new path is exercised via the override
