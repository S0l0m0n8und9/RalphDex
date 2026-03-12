# Done Task Audit Against Current Worktree

Baseline: current on-disk worktree in `/home/admin/Documents/repos/Ralph`, including local modifications and generated Ralph artifacts.

Supporting gates run during this audit:
- `cd ralph-codex-vscode-starter && npm test -- --runInBand` -> pass
- `cd ralph-codex-vscode-starter && npm run -s check:docs` -> pass
- `cd ralph-codex-vscode-starter && npm run -s package` -> pass and emits `ralph-codex-workbench-0.1.0.vsix`

Verdicts:
- `done`: claim is supported by the current worktree
- `partially done`: some claim exists, but the task notes or scope overstate reality
- `not done`: claimed behavior is missing or unsupported
- `tracker drift`: implementation exists, but task bookkeeping is inconsistent

## Task Matrix

| Task | Claimed outcome | Evidence found | Verdict | Reason |
| --- | --- | --- | --- | --- |
| T1 | PRD contains the project objective and is used by prompting | `.ralph/prd.md` contains a repo-specific objective and direction; prompt/task system is Ralph-specific, not starter seed text | done | The PRD is substantive and aligned to the current Ralph control-plane work |
| T2 | Seed task list replaced with repo-specific work | `.ralph/tasks.json` contains 45 Ralph-specific tasks spanning nested roots, retention, provenance, cleanup, and remediation | done | This is no longer a seed list |
| T3 | Nested project root detection for repo-root inspection | `src/services/workspaceScanner.ts`; `test/workspaceScanner.test.ts` includes nested child-root selection coverage | done | Implementation and direct regression coverage exist |
| T4 | Regression coverage for nested scanning and prompt repo-context rendering | `test/workspaceScanner.test.ts`; `test/promptBuilder.test.ts` includes nested repo-context rendering | done | Tests directly cover both claims |
| T5 | Clipboard and IDE handoff tests plus docs | `test/commandShell.smoke.test.ts` covers clipboard, IDE-command, missing-command fallback, and `cliExec` warning; `README.md` and `docs/workflows.md` document handoff behavior | done | Code, tests, and docs all match the claim |
| T6 | Packaging path proven and manual `.vsix` workflow documented | `package.json` includes packaging workflow; `README.md` and `docs/workflows.md` document build/install; `npm run package` passed and emitted `.vsix` | done | The packaging workflow works in the current worktree |
| T7 | Optional real CLI smoke path and artifact/verifier improvements | `scripts/run-real-cli-smoke.js`; `docs/testing.md` documents `npm run test:real-cli-smoke`; `src/ralph/artifactStore.ts` and related tests cover summarized execution failure surfacing | done | The optional real-CLI path exists and is documented; current default gates intentionally do not execute live Codex |
| T8 | Nested inspection/execution/verification root semantics aligned | `src/ralph/iterationEngine.ts`, `src/services/workspaceScanner.ts`, `src/ralph/statusReport.ts`; `test/iterationEngine.integration.test.ts`; `docs/architecture.md`, `docs/verifier.md`, `README.md` | done | Root policy is implemented, persisted, tested, and documented |
| T8.1 | Persist chosen inspection root in prompt/evidence/plan/provenance/status | `src/ralph/iterationEngine.ts`, `src/ralph/artifactStore.ts`, `src/ralph/statusReport.ts`; integration tests assert persisted root policy | done | Durable evidence surfaces contain explicit root policy |
| T8.2 | Deterministic execution-root and verifier-root policy | `src/ralph/iterationEngine.ts`; `docs/verifier.md`; root policy tested in integration suite | done | Execution and verifier roots follow the selected inspection root |
| T8.3 | CLI and verifier root-alignment implementation | `src/ralph/iterationEngine.ts` normalizes verifier commands and aligns exec/verifier cwd; integration tests cover nested execution/verifier roots | done | The implementation matches the task title |
| T8.4 | Explicit inspection-root override for ambiguous workspaces | `package.json` contributes `ralphCodex.inspectionRootOverride`; `src/services/workspaceScanner.ts`; `test/workspaceScanner.test.ts`; `test/iterationEngine.integration.test.ts` | done | Override exists, is validated, and is covered |
| T8.5 | Regression coverage for nested execution-root/verifier-root/override behavior | `test/workspaceScanner.test.ts`, `test/statusReport.test.ts`, `test/iterationEngine.integration.test.ts` | done | The listed behaviors are covered by direct tests |
| T8.6 | Documentation for workspace/inspection/execution/verifier roots | `README.md`, `docs/architecture.md`, `docs/provenance.md`, `docs/verifier.md` | done | Operator-facing docs explicitly describe root behavior |
| T9 | Multi-agent orchestration deferred until root semantics are solid | `README.md`, `docs/boundaries.md`, `docs/invariants.md`, `docs/workflows.md`; `src/validation/docsValidator.ts` enforces this docs boundary | done | The current product boundary is explicitly single-agent and validated in docs checks |
| T10 | Duplicate follow-on item for inspection-root override | T8.4 implementation exists; T10 notes explicitly say it is satisfied by T8.4 | done | The duplicate is satisfied, though it should eventually be removed for clarity |
| T11 | Bounded retention for prompts/runs/iterations surfaced in status | `src/ralph/iterationEngine.ts`, `src/ralph/statusReport.ts`; `test/statusReport.test.ts`; `docs/testing.md` and `docs/workflows.md` | done | Retention behavior is implemented and visible in status/docs |
| T12 | Protect latest-linked and state-referenced artifacts during cleanup | `src/ralph/artifactStore.ts`; `test/artifactStore.test.ts`; `docs/workflows.md` | done | Cleanup protection exists and has focused tests |
| T12.1 | Identify protected latest pointers and state references | `docs/workflows.md` enumerates protected roots; `test/artifactStore.test.ts` exposes protected generated-artifact roots | done | Protected roots are explicitly listed and tested |
| T12.2 | Deterministic retention precedence rules | `README.md`, `docs/workflows.md`, `docs/architecture.md`; `src/ralph/statusReport.ts` reflects newest-first then protected-additions semantics | done | The precedence rule is documented and reflected in status text |
| T12.3 | Implement protected-artifact retention behavior | `src/ralph/iterationEngine.ts`, `src/ralph/artifactStore.ts`; artifact retention tests cover prompt/run/iteration protection | done | Implementation exists and is exercised by tests |
| T12.4 | Regression coverage for protected latest/state references | `test/artifactStore.test.ts`; `docs/testing.md` mentions these focused retention regressions | done | Targeted regression coverage is present |
| T13 | Repair stale latest-artifact summary surfaces after manual deletion | `src/ralph/artifactStore.ts`, `src/commands/registerCommands.ts`; `test/commandShell.smoke.test.ts`; `test/preflight.test.ts` | done | Repair path and stale reporting both exist |
| T14 | Show Status includes history and retention summaries | `src/ralph/statusReport.ts`; `test/statusReport.test.ts`; `README.md`/`docs/workflows.md` | done | Status output includes the claimed history and retention surfaces |
| T15 | Commands to open latest prompt evidence and latest CLI transcript/last-message | `package.json` command contributions; `src/commands/registerCommands.ts`; `test/commandShell.smoke.test.ts`; docs in `README.md` and `docs/workflows.md` | done | Command surface, implementation, and smoke coverage all exist |
| T16 | Preflight diagnostics for stale artifacts and retention readiness | `src/ralph/preflight.ts`; `test/preflight.test.ts`; `docs/workflows.md` | done | Diagnostics are implemented, tested, and documented |
| T17 | Scoped cleanup workflow that preserves durable state | `package.json` contributes cleanup command; `src/commands/registerCommands.ts`; `test/commandShell.smoke.test.ts`; `README.md`/`docs/workflows.md` | done | Cleanup command behaves as claimed |
| T18 | Regression coverage for retention, stale-pointer recovery, latest-artifact commands, and cleanup | `test/artifactStore.test.ts`, `test/commandShell.smoke.test.ts`, `test/preflight.test.ts`, `test/statusReport.test.ts`; `npm test` passes | done | The claimed regression surface is covered in the current suite |
| T19 | Documentation for artifact lifecycle, retention, recovery, and cleanup | `README.md`, `docs/workflows.md`, `docs/provenance.md`, `docs/testing.md`; `npm run check:docs` passes | done | The doc coverage exists and passes the repo’s doc validator |
| T20 | Remove remaining packaging warnings and revalidate release-build workflow | `LICENSE` exists; `package.json` includes a `files` allowlist; `README.md`/`docs/workflows.md` explain curated payload; `npm run package` passed cleanly | done | The packaging warning sources called out in T6 are resolved in the current worktree |
| T21 | Bounded remediation for repeated no-progress or repeated failure outcomes | `src/ralph/loopLogic.ts`, `src/ralph/iterationEngine.ts`, `src/prompt/promptBuilder.ts`, `src/ralph/statusReport.ts`, `src/ralph/artifactStore.ts`; `test/loopLogic.test.ts`, `test/iterationEngine.integration.test.ts`, `test/statusReport.test.ts`, `test/promptBuilder.test.ts`; `docs/workflows.md` and `docs/verifier.md` | tracker drift | The remediation feature exists and is tested, but the parent task is `done` while child tasks `T21.1`-`T21.6` remain `todo` |

## Findings

### Real implementation gaps

None found for the tasks currently marked `done` in the root tracker.

### Bookkeeping and tracker drift

- `T21` is the only confirmed tracker inconsistency. The feature is present in code, tests, and docs, but the task hierarchy is inconsistent because `T21` is `done` while all of its child tasks remain open.
- `T6`'s note is stale relative to the current worktree. It still mentions packaging warnings about a missing `LICENSE` and allowlist, but those warnings appear to have been resolved by the later `T20` work.

### Duplicate or redundant tasks

- `T10` is a deliberate duplicate of `T8.4`. It is currently satisfied, but keeping both items as `done` adds noise to the tracker and makes future audits less clear.

## Bottom Line

- `done`: 30
- `partially done`: 0
- `not done`: 0
- `tracker drift`: 1 (`T21`)

On the current worktree, the `done` set is substantively accurate. The only task that should not be treated as cleanly complete is `T21`, and that is because of tracker hierarchy drift rather than missing implementation.
