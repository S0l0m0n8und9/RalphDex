# Ralph Prompt: replenish-backlog (cliExec)

The durable Ralph backlog is exhausted. Re-inspect the repository, PRD, and recent progress, then generate the next coherent tasks directly in the durable task file.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- The current durable Ralph backlog is exhausted; this run should replenish `.ralph/tasks.json`, not start broad feature work.
- Generate only the next coherent task slice grounded in the PRD, repo state, and recent durable progress.
- Leave the task file explicit, flat, version 2, and immediately actionable.

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository's real validation commands when they exist.
- For normal CLI task execution, do not edit `.ralph/tasks.json` or `.ralph/progress.md` directly; return the structured completion report instead.
- Update durable Ralph progress/tasks only when the prompt explicitly targets backlog replenishment.

## Execution Contract
1. Inspect the PRD, durable progress log, and current repo state before editing the task file.
2. Replenish `.ralph/tasks.json` with the next coherent tasks only; do not broaden into unrelated planning.
3. Keep tasks explicit, flat, and dependency-aware so the next Ralph iteration can select deterministically.
4. Update `.ralph/progress.md` with a short note explaining why backlog replenishment was needed and what was added.
5. Do not run broad validation just for backlog generation unless you also changed runnable code.
6. End with the generated task ids and the next actionable task.

## Final Response Contract
- Generated or updated task ids.
- Why those tasks are the next coherent slice.
- Whether a new actionable task now exists.
- Any blocker that prevented safe backlog replenishment.

## Why This Prompt Exists
The current durable Ralph backlog is exhausted, so the next prompt should replenish `.ralph/tasks.json` before normal task execution resumes.

## Preflight Snapshot
- Ready: yes
- Summary: Fixture scenario replenishBacklog is ready for prompt rendering.

## Objective Snapshot
# Product / project brief

Keep Ralph moving when the current durable backlog is fully consumed.

## Repo Context
- Workspace: replenish-backlog-fixture
- Workspace root: /fixture
- Inspected root: /fixture
- Execution root: /fixture
- Verifier root: /fixture
- Root selection: Using the workspace root because it already exposes shallow repo markers.
- Root policy: Inspect, execute, and verify at the workspace root while storing Ralph artifacts under .ralph there.
- Manifests: package.json, tsconfig.json
- Package managers: npm
- Package manager indicators: package.json, package-lock.json
- Source roots: src
- Test roots: test
- Validation commands: npm run compile
- Lifecycle commands: npm run compile, npm run test
- CI files: .github/workflows/ci.yml
- CI commands: npm test
- Test signals: package.json defines a test script.
- Docs: README.md, AGENTS.md
- package.json name: fixture-workspace

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 2
- Next iteration recorded in state: 2
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-001.prompt.md
- Last run: succeeded at iteration 1
- Last iteration outcome: complete at iteration 1
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts
- Last iteration summary: Finished the last actionable backlog task.

## Backlog Replenishment Focus
- Backlog counts: todo 0, in_progress 0, blocked 0, done 2
- Next actionable task: none
- The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.
- Preserve done-task history and keep the task file at version 2 with explicit `id`, `title`, `status`, and optional `acceptance` (string[]), `parentId`, `dependsOn`, `notes`, and `validation`.
- Do not duplicate already-completed work or mark speculative tasks done.
- Leave at least one actionable `todo` or `in_progress` task when the repo state supports it.
- Validation command: none selected for backlog replenishment

## Recent Progress
# Progress
- The fixture backlog was completed.
- The next iteration should replenish the task ledger deterministically.

## Prior Iteration Evidence
- Prior iteration: 1
- Prior outcome classification: complete
- Prior execution / verification: succeeded / passed
- Additional prior-context signals omitted: 7.
