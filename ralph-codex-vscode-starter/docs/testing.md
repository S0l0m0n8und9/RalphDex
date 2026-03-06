# Testing

## Authoritative Commands

- `npm run compile`: build the extension from `src/` to `out/`.
- `npm run lint`: type-check `src/` and `test/` without emitting files.
- `npm test`: run `npm run compile:tests` and then execute the Node test suite from `out-test/test/`.
- `npm run validate`: run `compile`, `lint`, and `test`.
- `npm run package`: verify the Node runtime and then build a `.vsix` package with `vsce`.

## What Is Covered

- `test/promptBuilder.test.ts`: prompt kind selection plus selected-task/runtime sections.
- `test/cliExecStrategy.test.ts`: CLI argument shaping, transcript generation, and missing-CLI error wording.
- `test/stateManager.test.ts`: non-destructive workspace inspection, workspace seeding, task-file parse diagnostics, and iteration-result serialization.
- `test/taskFile.test.ts`: task-file parsing, deterministic task selection, subtask detection, and status counting.
- `test/loopLogic.test.ts`: outcome classification, no-progress detection, failure signatures, and stop-decision logic.
- `test/workspaceInspection.test.ts`: package-manager, lifecycle, and validation-command inference.
- `test/workspaceScanner.test.ts`: end-to-end workspace inspection heuristics from real temp dirs.
- `test/workspaceSupport.test.ts`: explicit-path and PATH-lookup Codex CLI support inspection.

## What Is Not Covered

- VS Code activation and command registration behavior
- Clipboard and VS Code command handoff strategies
- Real `codex exec` process execution
- Live Git checkpoint behavior in a real repository
- `.vsix` install behavior

When changing those areas, rely on the authoritative commands above plus manual verification in the Extension Development Host.

## Packaging Runtime

- Packaging is supported on Node 20+.
- `scripts/ensure-node-version.js` fails fast when `npm run package` is invoked on an older runtime.
- Node 18 is intentionally treated as unsupported for packaging because the modern `@vscode/vsce` toolchain requires a newer runtime.
