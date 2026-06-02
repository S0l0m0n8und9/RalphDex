# Live Provider Dogfood Pass - 2026-06-02

Issue: <https://github.com/S0l0m0n8und9/RalphDex/issues/99>

Run timestamp: 2026-06-02 14:28 UTC / 2026-06-03 02:28 NZST

## Result

Status: pass with one follow-up issue.

Ralph completed a live-provider iteration in a fresh ignored workspace using the real Claude CLI. The provider changed source, emitted a completion report, Ralph reconciled the selected task to `done`, all configured verifier modes passed, and the dashboard trust surface opened against the preserved run artifacts.

Follow-up issue: <https://github.com/S0l0m0n8und9/RalphDex/issues/108>

## Environment

| Field | Value |
| --- | --- |
| Workspace | `C:\Users\ben.jones\Repos\RalphDex\.worktrees\real-cli-smoke\run-jD6HvC` |
| Provider | `claude` |
| CLI version | `2.1.160 (Claude Code)` |
| Model | `claude-sonnet-4-6` |
| Run ID | `run-i001-cli-20260602T142810Z` |
| Task | `T1 - Update fixture source for real CLI smoke evidence` |
| Source change | `src/fixture.ts` exports `"real-cli-smoke"` |

The workspace is intentionally under ignored `.worktrees/` storage. Local transcripts, provider output, and run bundles are preserved there for operator inspection and are not committed.

## Commands Run

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run validate` | Pass | Post-change validation completed with 1526 tests passing. |
| Focused process runner regression | Pass | `processRunner.test.ts` completed 9 tests after adding the shell-command-string regression. |
| `npm run test:real-cli-smoke` | Pass | Real Claude CLI iteration completed with `executionStatus=succeeded`, `verificationStatus=passed`, and `completionClassification=complete`. |
| Dashboard webview smoke | Pass | `ralphCodex.showDashboard` opened against the preserved dogfood workspace and reported dashboard webview readiness. |

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| First-run/readiness | Pass | The smoke script created a fresh workspace with `.ralph/prd.md`, `.ralph/tasks.json`, `.ralph/progress.md`, package metadata, and a git repository before invoking Ralph. |
| Provider execution | Pass | `latest-cli-invocation.json` recorded `selectedProvider=claude`, `selectedModel=claude-sonnet-4-6`, command `claude -p -`, and prompt/stdin hash `sha256:23ba9522...`. |
| Verifier execution | Pass | `verifier-summary.json` reported `validationCommand`, `gitDiff`, and `taskState` as passed. |
| Event journal | Pass | `events.jsonl` recorded 12 ordered events from `run_started` through `run_completed`. |
| Trust timeline/dashboard | Pass | The dashboard smoke opened the React dashboard against the dogfood workspace and awaited the `dashboard` webview readiness signal. |
| Artifacts/provenance | Pass | The run persisted latest prompt, CLI invocation, latest result, provenance bundle, verifier summary, and run bundle artifacts. |
| Stop reason clarity | Pass | `latest-result.json` recorded `stopReason=null` with completion summary `Outcome: complete | Backlog remaining: 0`. |

## Event Journal Summary

The preserved event journal contains:

1. `run_started`
2. `task_selected`
3. `provider_invoked`
4. `provider_completed`
5. `completion_report_parsed`
6. `verifier_result` for `validationCommand`
7. `verifier_result` for `gitDiff`
8. `verifier_result` for `taskState`
9. `task_state_changed`
10. `artifact_written` for the iteration result
11. `artifact_written` for the provenance bundle
12. `run_completed`

## Observed Failures And Disposition

Fixed in this change:

- `scripts/run-real-cli-smoke.js` now launches `npm.cmd` through a Windows shell so compile setup works on Windows.
- The smoke script resets the test process harness after loading the VS Code stub so provider, git, and npm commands execute for real.
- The smoke workspace now defaults to ignored repo-local `.worktrees/real-cli-smoke/` storage, avoiding provider restrictions on Windows temp paths while keeping evidence out of commits.
- The smoke task now changes source and requests task completion through the completion report instead of mutating `.ralph` task state directly.
- The smoke task explicitly forbids provider-side git history changes.
- `runProcess` now preserves shell command strings when `shell=true` and no argv are supplied, fixing verifier commands such as `npm test` on Windows.

Raised separately:

- Issue #108 tracks Codex provider readiness diagnostics for ChatGPT-auth unsupported models. During this dogfood pass, explicit Codex smoke attempts reached `codex exec` but failed for both `gpt-5` and `gpt-5-codex` with an unsupported-model error before execution.

Non-issue:

- The dashboard smoke emitted VS Code/test-electron shutdown warnings while exiting, but the command returned exit code 0 after dashboard readiness was observed.
