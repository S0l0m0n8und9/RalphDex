# Testing

Related docs:

- [README.md](../README.md)
- [docs/architecture.md](architecture.md)
- [docs/workflows.md](workflows.md)
- [docs/verifier.md](verifier.md)

## Authoritative Commands

- `npm run compile`: build the extension from `src/` to `out/`.
- `npm run lint`: type-check `src/` and `test/` without emitting files.
- `npm run check:docs`: run deterministic documentation structure, link, ownership, and lightweight code-doc alignment checks.
- `npm run check:ledger`: verify that the task and claims ledger files in `.ralph/` are internally consistent; a drifted ledger blocks the full validation gate before tests run.
- `npm run prompt:calibrate -- <workspace-path>`: render one prompt of each kind and target against a representative Ralph workspace and report estimated token counts versus the checked-in codex targets. This is a manual operator aid, not a validation gate.
- `npm test`: run `npm run compile:tests` and then execute the Node test suite from `out-test/test/`.
- `npm run test:activation`: launch a real Extension Development Host smoke test through `@vscode/test-electron`.
- `RALPH_E2E=1 npm run test:e2e-pipeline`: create a fresh temp workspace, execute `ralphCodex.runPipeline` through the VS Code test harness with one real Codex CLI loop invocation plus mocked review/SCM follow-up, and assert the pipeline artifact records a PR URL. Without `RALPH_E2E=1`, the command exits quickly with a skip message.
- `npm run test:real-cli-smoke`: run one temp-workspace Ralph iteration through the real `codex exec` path and print the preserved artifact paths. This command is optional and requires a working Codex CLI environment.
- `npm run validate`: run `compile`, `check:docs`, `check:ledger`, `check:prompt-budget`, `lint`, and `test`.
- `npm run package`: verify the Node runtime and then build a `.vsix` package with `vsce`.

## What Is Covered

- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance/latest-prompt-evidence/latest-CLI-transcript and approved-decomposition-apply commands, stale latest-summary/latest-provenance repair after manual deletion, remediation-summary repair from `latest-result.json`, transcript-to-last-message fallback, latest-bundle reveal behavior, scoped runtime-artifact cleanup that preserves stable latest evidence surfaces, prompt clipboard auto-copy, non-claiming prepare/handoff behavior, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
- `scripts/run-e2e-pipeline-smoke.js`: opt-in temp-workspace pipeline smoke coverage that runs the real `codex exec` loop path once, finishes the review/SCM phases with deterministic mocks, and asserts the resulting pipeline artifact contains a PR URL.
- `test/statusReport.test.ts`: focused rendering coverage for status output, including task/backlog separation, provenance trust level messaging, inspection-root overrides, repeated-stop remediation reporting for decomposition, blocked, and human-review cases, recent iteration/run history, live retention summaries for generated artifacts and provenance bundles, and latest-artifact repair or stale-surface reporting.
- `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them, proving generated prompt/run/iteration artifacts stay protected when `.ralph/state.json` `last*`, `runHistory[]`, or `iterationHistory[]` entries or latest result, preflight-report, prompt-evidence, execution-plan, or CLI-invocation records still reference them, including root-by-root regressions for latest-linked prompt, summary, and preflight references plus state-referenced transcript, last-message, and iteration-directory protection, including summary-only and path-only iteration references plus transcript-only and last-message-only run references, proving latest summary, preflight-summary, and provenance-summary Markdown surfaces can still protect the implied iteration directory when the matching JSON pointer is absent, including both iteration markers and rendered artifact-path lines, proving mixed latest-pointer and raw-state protection can preserve older summary/preflight iteration directories separately from older prompt/transcript/last-message artifacts in the same cleanup pass, proving latest provenance bundle/failure pointers keep only the referenced iteration directory, proving handoff-note cleanup keeps only the newest retained `.ralph/handoff/*.json` entries, including run-only state fallbacks that omit explicit iteration records and raw state run references that carry only explicit file paths, and proving generated-artifact conflicts resolve deterministically by keeping the newest parsed-iteration window first, then adding older protected entries without reordering it, while also reporting which retained entries survived only because of that protection.
- `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
- `scripts/run-real-cli-smoke.js`: optional real `codex exec` smoke coverage that seeds a temp Ralph workspace, runs one CLI iteration against the actual Codex binary, and prints the resulting artifact pointers or preserved temp path for inspection.
- `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, prompt-budget omission behavior, and prompt-output determinism.
- `test/promptBuilder.snapshot.test.ts`: golden snapshot coverage for each valid prompt-kind fixture scenario using readable `.md` snapshots under `test/fixtures/snapshots/`.
- `test/cliExecStrategy.test.ts`: CLI argument shaping, medium-versus-high reasoning-effort selection, transcript generation, missing-CLI error wording, and fail-fast prompt-hash mismatch detection before launch.
- `test/iterationEngine.integration.test.ts`: temp-workspace loop execution with mocked Codex exec covering progress, repeated no-progress, repeated failure classification, persisted remediation artifacts for decomposition, reframe, and human-review paths, proposal-child generation versus non-decomposition artifacts, verifier-driven completion, human-review-needed stops, execution-plan/CLI-invocation artifact emission, persisted state across iterations, durable session handoff-note writes on clean terminal stops plus next-session prompt carry-forward, non-blocking IDE preparation before later CLI selection, and blocked integrity evidence for `executionPlanHash`, `promptArtifactHash`, and `stdinPayloadHash`.
- `test/preflight.test.ts`: targeted preflight coverage for likely task-schema drift diagnostics, validation-command readiness wording, and stale latest-artifact plus retention-readiness warnings before CLI loops start.
- `test/stateManager.test.ts`: non-destructive workspace inspection, workspace seeding, task-file parse diagnostics, iteration-result serialization, and scoped runtime-artifact cleanup that preserves durable state, stable latest evidence surfaces, and the latest protected provenance bundle while pruning older generated artifacts.
- `test/taskContract.test.ts`: executable contract tests for the normalized-task shape defined in `docs/invariants.md § Normalized Task Contract`, covering required-field enforcement, optional-string and optional-array coercion to `undefined`, dependency deduplication via `Set`, enum-field rejection for invalid `priority`/`mode`/`tier` values, unknown-field drop after normalization, child-task conversion field mapping (status forcing, `rationale` → `notes`, `null` validation → `undefined`, parent mode inheritance), and parent status promotion on child application.
- `test/taskFile.test.ts`: task-file parsing, deterministic task selection, explicit parent/dependency behavior, approved decomposition-apply validation, legacy normalization, status counting, preflight graph diagnostics, and file-backed claim acquisition and release semantics including contested claims, legacy IDE-claim reclamation across one or many active handoff records, lock-mediated concurrent acquisition and release, idempotent release, and stale-claim detection.
- `test/verifier.test.ts`: cheap validation-command readiness probing for explicit executables and unresolved PATH commands.
- `test/docsValidator.test.ts`: deterministic coverage for required doc presence, heading rules, AGENTS.md ownership guardrails, local doc links, and verifier-doc alignment checks.
- `test/loopLogic.test.ts`: outcome classification, no-progress detection, failure signatures, and stop-decision logic.
- `test/workspaceInspection.test.ts`: package-manager, lifecycle, and validation-command inference.
- `test/workspaceScanner.test.ts`: end-to-end workspace inspection heuristics from real temp dirs.
- `test/workspaceSupport.test.ts`: explicit-path and PATH-lookup Codex CLI support inspection.

## Stub Smoke Vs Real Activation Smoke

- The default `npm test` path keeps using the lightweight stubbed harness because it is fast, deterministic, and good enough for most command-shell and artifact assertions.
- `npm run test:activation` is intentionally narrower but more realistic: it verifies the packaged extension can activate under VS Code and that a basic command path executes in the real host.
- If the default `@vscode/test-electron` download does not launch cleanly in your environment, rerun `npm run test:activation` with `RALPH_VSCODE_EXECUTABLE_PATH=/absolute/path/to/code` so the smoke can target a known-good local VS Code executable.
- Neither path introduces heavy UI automation or a richer VS Code integration framework.
- `npm run test:real-cli-smoke` is intentionally separate from `npm run validate` because it depends on live Codex auth/network reachability and may preserve the temp workspace on failure for inspection.

## What Is Not Covered

- heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
- live clipboard integration in a real host OS session
- live VS Code command handoff behavior in a real Extension Development Host session
- Real `codex exec` process execution is only covered by the optional `npm run test:real-cli-smoke` path, not by the default `npm test` or `npm run validate` gate.
- Prompt-budget calibration is a manual operator workflow through `npm run prompt:calibrate -- <workspace-path>` and is not exercised by `npm test` or `npm run validate`.
- Live Git checkpoint behavior in a real repository
- live `.vsix` install behavior after packaging

When changing those areas, rely on the authoritative commands above plus manual verification in the Extension Development Host.

## Test Runtime Notes

- `npm test` preloads `test/register-vscode-stub.cjs` so extension modules can run under plain Node without a heavyweight VS Code test harness.
- The smoke tests intentionally stay thin: they verify command registration and simple command behavior, not full UI rendering or live VS Code integration.
- The integration suite uses temp directories and mocked `codex exec` behavior instead of spawning the real Codex CLI.
- The optional real CLI smoke persists the temp workspace when execution or verification fails so operators can inspect `.ralph/artifacts/`, `stderr.log`, and the latest summary surfaces directly.
- `npm run test:real-cli-smoke` accepts `RALPH_REAL_CLI_SMOKE_COMMAND`, `RALPH_REAL_CLI_SMOKE_MODEL`, and `RALPH_REAL_CLI_SMOKE_KEEP_WORKSPACE=1` when you need a non-default Codex binary, model, or preserved temp workspace.
- Prompt-template tests may point `ralphCodex.promptTemplateDirectory` at temp directories so rendering stays thin and deterministic without pulling in a heavier templating engine.
- Prompt snapshot updates require `npm test -- --updateSnapshot`; reviewers should read `.md` snapshot diffs with the same care as code diffs because they capture the durable prompt contract.
- The activation smoke also stays thin: it checks one real activation path and one basic command invocation, then stops.

## Packaging Runtime

- Packaging is supported on Node 20+.
- `scripts/ensure-node-version.js` fails fast when `npm run package` is invoked on an older runtime.
- Node 18 is intentionally treated as unsupported for packaging because the modern `@vscode/vsce` toolchain requires a newer runtime.
- The packaged `.vsix` is intentionally allowlisted to compiled runtime files, prompt templates, the bundled license, and operator-facing docs so release builds do not ship `src/`, `test/`, `.ralph/`, or other development-only inputs.
- `npm run package` proves the repo can emit a `.vsix`, but manual `.vsix` install still needs an operator check through `Extensions: Install from VSIX...` or `code --install-extension`.
