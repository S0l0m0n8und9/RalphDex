# Changelog

All notable changes to Ralphdex are documented here.

## [0.1.0] — 2026-04-03

### Added

- File-backed Ralph task loop with durable `.ralph/` workspace state — sessions resume without chat history.
- `codex exec`, Claude CLI (`claude -p`), and GitHub Copilot CLI execution strategies.
- Clipboard + VS Code command IDE handoff for prompt delivery.
- Structured completion-report contract: every iteration returns a fenced JSON block that Ralph reconciles into task state.
- Preflight diagnostics — blocks execution on ledger drift, stale claims, or missing runtime preconditions.
- Multi-verifier post-iteration assessment: `validationCommand`, `gitDiff`, `taskState`.
- Loop stop logic: no-progress threshold, repeated-failure threshold, human-review gate.
- Artifact store with configurable retention and latest-pointer protection.
- Provenance bundles: prompt evidence, transcript, iteration summary, and git snapshots per run.
- Task decomposition: bounded child-task proposals and auto-remediation (`decompose_task`, `mark_blocked`).
- Review-agent and watchdog-agent roles.
- SCM automation: `commit-on-done` and `branch-per-task` strategies with optional `gh` PR creation.
- Pipeline orchestration: PRD-fragment intake → decomposition → agent loop → review → SCM/PR → human-review gate.
- Model tiering hooks in `complexityScorer.ts` (disabled by default, opt-in via config).
- Operator-facing commands: Prepare Prompt, Run CLI Iteration, Run CLI Loop, Run Multi-Agent Loop, Show Status, Open Latest artifacts, Resolve Stale Claim, Run Pipeline, Approve Human Review, Resume Pipeline.
