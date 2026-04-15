# Shim Self-Hosting Validation

Validation record for T130 — running Ralph iterations via the Node.js shim
(`src/shim/main.ts`) against this repository's own `.ralph/` workspace.

---

## Purpose

The Node.js shim replaces the VS Code extension host with a minimal stdout-backed
implementation so operators can run Ralph iterations from a terminal without opening
VS Code. This document records the validated invocation, prerequisites, observed
behaviour, and known gaps versus the VS Code host path.

---

## Invocation command

```bash
# Build first (or ensure out/shim/main.js is up-to-date)
npm run compile

# Run one iteration against the current workspace
node out/shim/main.js .

# Or against an explicit path
node out/shim/main.js /path/to/workspace
```

The shim exits after completing a single iteration. Run it in a loop (shell `while`
or a cron job) to process multiple tasks.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Compiled shim | `out/shim/main.js` must exist. Run `npm run compile` to build. |
| `claude` CLI in PATH | The default provider (`cliProvider: "claude"`) calls `claude -p`. Verified at `C:\Users\ben.jones\.local\bin\claude.EXE` during validation. |
| `.ralph/` workspace | The workspace root passed as `argv[2]` must contain a `.ralph/` directory with `tasks.json` and `prd.md`. |
| No active claim collision | If another Ralph agent (VS Code or another shim instance) holds a fresh claim on the only in-progress task, the shim will report *No actionable Ralph task selected* and exit cleanly. Use a distinct `agentId` or ensure no concurrent agent is running. |

### Dedicated shim smoke task

T130 now carries a child task, `T130.1`, specifically for shim smoke validation.
Use that child task as the shim's selectable target when validating self-hosting.
This avoids the self-blocking pattern where the parent validation task (`T130`) is
already claimed by the outer Ralph loop, leaving the shim with no safe task to claim.

The intended pattern is:

1. keep `T130` as the human-tracked validation umbrella task;
2. let a shim invocation claim and complete `T130.1`; and
3. use the reconciled `T130.1` outcome as the proof that the shim can select work,
   execute a full iteration, and update durable task state end-to-end.

### Optional: `.ralph-config.json`

Place a `.ralph-config.json` file in the workspace root to override any
`ralphCodex.*` setting without modifying VS Code user settings. The file is
gitignored (`.gitignore` entry added during this validation run). Example:

```json
{
  "agentId": "shim-operator",
  "cliProvider": "claude",
  "claudeMaxTurns": 20
}
```

Key fields relevant to the shim:

| Field | Default | Notes |
|---|---|---|
| `agentId` | `"default"` | Set to a unique value when running alongside another Ralph agent to avoid claim collisions. |
| `cliProvider` | `"claude"` | Must be `"claude"` for headless use; other providers may require VS Code commands. |
| `claudeMaxTurns` | `125` | Reduce for quick smoke tests; the default is sufficient for real tasks. |

Environment variable overrides follow the pattern
`RALPH_CODEX_<SCREAMING_SNAKE_CASE>`, e.g. `RALPH_CODEX_CLI_PROVIDER=claude`.

---

## Validated runs

Two complete shim iterations were executed against this repository during the
T130 validation session (2026-04-14):

### Iteration 238 — agentId `"default"` (collision detected)

```
node out/shim/main.js .
# .ralph-config.json: { "claudeMaxTurns": 20, "cliProvider": "claude" }
```

**Preflight output (abridged):**
```
Preflight ready: No task selected. Validation npm run validate.
Executable token confirmed.
Active claims default: T130 @ 2026-04-14T19:39:28.238Z (fresh).
Claim graph warning [default_agent_id_collision]: Configured agentId is "default"
while another active "default" claim already exists (T130/run-i237-cli-…).
```

**Outcome:**
```
Ralph shim iteration 238 finished: No actionable Ralph task selected.
| Execution: skipped | Verification: skipped | Outcome: no_progress
| Backlog remaining: 3
```

Artifacts persisted at `.ralph/artifacts/iteration-238/`.
State updated: `nextIteration` advanced to 239.

**Root cause of no-task:** T130 was in-progress with a fresh claim held by the
outer Ralph session (iteration 237, same agentId). The claim graph correctly
detected the collision and blocked task selection.

### Iteration 239 — agentId `"shim-validator"` (distinct id)

```
node out/shim/main.js .
# .ralph-config.json: { "agentId": "shim-validator", "claudeMaxTurns": 20, "cliProvider": "claude" }
```

**Preflight output (abridged):**
```
Preflight ready: No task selected. Validation npm run validate.
Executable token confirmed.
Active claims default: T130 @ 2026-04-14T19:39:28.238Z (fresh).
Claim graph info [task_claim_provenance_mismatch]: Task T130 is currently
claimed by default/run-i237-cli-…, not the current iteration run-i239-cli-….
```

**Outcome:**
```
Ralph shim iteration 239 finished: No actionable Ralph task selected.
| Execution: skipped | Verification: skipped | Outcome: no_progress
| Backlog remaining: 3
```

Artifacts persisted at `.ralph/artifacts/iteration-239/`.
State updated: `nextIteration` advanced to 240.

**Root cause of no-task:** Even with a distinct agentId, the `recoverUnexpectedUnclaimedSelection`
function checks the first candidate task (T130, in-progress, highest priority). T130's
canonical claim was still active (`status: active`), so the function returned
`{task: null}` without falling through to the next candidate. This is correct
defensive behaviour — it prevents two agents from racing on the same in-progress task.

---

## What the shim exercises end-to-end

Both runs confirmed the following pipeline phases work without VS Code:

| Phase | Evidence |
|---|---|
| Module shimming | `Module._load` successfully intercepted `require('vscode')` and returned the shim module. All downstream imports resolved. |
| Configuration loading | `.ralph-config.json` read and merged with defaults via `readShimConfig`. |
| Preflight diagnostics | Full preflight ran: task graph, claim graph, codex adapter, validation/verifier, agent health. |
| Prompt building | `fix-failure-238.prompt.md` and `fix-failure-239.prompt.md` generated and persisted. |
| Artifact management | Iteration artifact directories created; old artifacts rotated per retention policy. |
| Provenance bundles | Bundles created and cleaned up (retention policy applied). |
| Iteration state | `state.json` `nextIteration` incremented correctly across both runs. |
| CLI path resolution | `claude` CLI found and verified at `C:\Users\ben.jones\.local\bin\claude.EXE`. |

---

## Behavioural gaps versus the VS Code host path

| Gap | Details |
|---|---|
| **IDE commands unavailable** | The `NoOpCommandExecutor` silently returns `undefined` for all VS Code command invocations. The preflight reports `ide_command_strategy_unavailable` (warning). Clipboard handoff falls back to `cliExec`, which is the correct mode for headless use. |
| **No progress UI** | `NoOpProgress.report()` is a no-op. Progress messages are lost. Use the stdout log lines instead. |
| **Ephemeral agent state** | `MemoryMemento` is in-memory only. Agent state (e.g. custom VS Code extension globalState) resets on every shim invocation. Ralph's file-backed state (`.ralph/state.json`, `.ralph/tasks.json`) persists correctly. |
| **Memory summarisation fallback** | The shim cannot call the VS Code extension's `summarizeText` method; the preflight reports `memory_summarization_fallback`. Verbatim or sliding-window memory strategies are unaffected. |
| **Claim collision when concurrent** | Running the shim while another Ralph agent holds a fresh claim on the only available task results in no-task-selected. Mitigation: use a distinct `agentId` in `.ralph-config.json` AND ensure that task is not in-progress under a competing claim. Best practice is to run the shim standalone or in dedicated CI where no VS Code loop is active. |
| **No sidebar / status bar** | Output goes to stdout only. The shim does not open any UI panels. |

---

## Recommended operator workflow

1. **Build:** `npm run compile`
2. **Configure** (optional): create `.ralph-config.json` with a distinct `agentId`
   and any setting overrides.
3. **Prepare a selectable task:** ensure the dedicated shim smoke task (`T130.1`, or
   an equivalent disposable shim-smoke task in a temp workspace) is the task the shim
   can safely claim.
4. **Run:** `node out/shim/main.js <workspace>` from the repo root.
5. **Iterate:** Wrap in a shell loop or systemd timer; each invocation processes
   one task. Stop when the shim exits with *No actionable Ralph task selected* and
   no tasks remain.
6. **Inspect:** Artifacts land in `.ralph/artifacts/iteration-N/`; the summary is
   at `.ralph/artifacts/latest-summary.md`.
