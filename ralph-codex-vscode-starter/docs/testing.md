# Testing

## Authoritative Commands

- `npm run compile`: build the extension from `src/` to `out/`.
- `npm run lint`: type-check `src/` and `test/` without emitting files.
- `npm test`: run `npm run compile:tests` and then execute the Node test suite from `out-test/test/`.
- `npm run test:activation`: launch a real Extension Development Host smoke test through `@vscode/test-electron`.
- `npm run validate`: run `compile`, `lint`, and `test`.
- `npm run package`: verify the Node runtime and then build a `.vsix` package with `vsce`.

## What Is Covered

- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status` and `Open Latest Ralph Summary` behavior with mocked Ralph state/artifacts.
- `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
- `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
- `test/cliExecStrategy.test.ts`: CLI argument shaping, transcript generation, missing-CLI error wording, and fail-fast prompt-hash mismatch detection before launch.
- `test/iterationEngine.integration.test.ts`: temp-workspace loop execution with mocked Codex exec covering progress, repeated no-progress, repeated failure classification, verifier-driven completion, human-review-needed stops, execution-plan/CLI-invocation artifact emission, and persisted state across iterations.
- `test/preflight.test.ts`: targeted preflight coverage for likely task-schema drift diagnostics and validation-command readiness wording.
- `test/stateManager.test.ts`: non-destructive workspace inspection, workspace seeding, task-file parse diagnostics, and iteration-result serialization.
- `test/statusReport.test.ts`: readable status rendering for backlog-aware outcomes, surfaced task-graph diagnostics, and execution-integrity metadata.
- `test/taskFile.test.ts`: task-file parsing, deterministic task selection, explicit parent/dependency behavior, legacy normalization, status counting, and preflight graph diagnostics.
- `test/verifier.test.ts`: cheap validation-command readiness probing for explicit executables and unresolved PATH commands.
- `test/loopLogic.test.ts`: outcome classification, no-progress detection, failure signatures, and stop-decision logic.
- `test/workspaceInspection.test.ts`: package-manager, lifecycle, and validation-command inference.
- `test/workspaceScanner.test.ts`: end-to-end workspace inspection heuristics from real temp dirs.
- `test/workspaceSupport.test.ts`: explicit-path and PATH-lookup Codex CLI support inspection.

## Stub Smoke Vs Real Activation Smoke

- The default `npm test` path keeps using the lightweight stubbed harness because it is fast, deterministic, and good enough for most command-shell and artifact assertions.
- `npm run test:activation` is intentionally narrower but more realistic: it verifies the packaged extension can activate under VS Code and that a basic command path executes in the real host.
- If the default `@vscode/test-electron` download does not launch cleanly in your environment, rerun `npm run test:activation` with `RALPH_VSCODE_EXECUTABLE_PATH=/absolute/path/to/code` so the smoke can target a known-good local VS Code executable.
- Neither path introduces heavy UI automation or a richer VS Code integration framework.

## What Is Not Covered

- heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
- Clipboard and VS Code command handoff strategies
- Real `codex exec` process execution
- Live Git checkpoint behavior in a real repository
- `.vsix` install behavior

When changing those areas, rely on the authoritative commands above plus manual verification in the Extension Development Host.

## Test Runtime Notes

- `npm test` preloads `test/register-vscode-stub.cjs` so extension modules can run under plain Node without a heavyweight VS Code test harness.
- The smoke tests intentionally stay thin: they verify command registration and simple command behavior, not full UI rendering or live VS Code integration.
- The integration suite uses temp directories and mocked `codex exec` behavior instead of spawning the real Codex CLI.
- Prompt-template tests may point `ralphCodex.promptTemplateDirectory` at temp directories so rendering stays thin and deterministic without pulling in a heavier templating engine.
- The activation smoke also stays thin: it checks one real activation path and one basic command invocation, then stops.

## Packaging Runtime

- Packaging is supported on Node 20+.
- `scripts/ensure-node-version.js` fails fast when `npm run package` is invoked on an older runtime.
- Node 18 is intentionally treated as unsupported for packaging because the modern `@vscode/vsce` toolchain requires a newer runtime.
