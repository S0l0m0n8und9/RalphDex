# Testing

## Authoritative Commands

- `npm run compile`: build the extension from `src/` to `out/`.
- `npm run lint`: type-check `src/` and `test/` without emitting files.
- `npm test`: run `npm run compile:tests` and then execute `node --test ./out-test/test`.
- `npm run validate`: run `compile`, `lint`, and `test`.
- `npm run package`: attempt to build a `.vsix` package with `vsce`.

`.vscode/tasks.json` exposes `compile`, `lint`, and `test` through the VS Code task runner. `.vscode/launch.json` uses `npm: compile` as the prelaunch task for the Extension Host. `npm run package` relies on `vscode:prepublish` to compile before packaging.

## What Is Covered

- `test/promptBuilder.test.ts`: prompt kind selection, prompt filename formatting, and presence of core prompt sections.
- `test/cliExecStrategy.test.ts`: CLI argument shaping, transcript generation, and missing-CLI error wording.
- `test/stateManager.test.ts`: non-destructive workspace inspection, workspace seeding, and task-file parse diagnostics.
- `test/taskFile.test.ts`: task-file parsing, schema normalization, and status counting.
- `test/workspaceSupport.test.ts`: explicit-path and PATH-lookup Codex CLI support inspection.
- `test/workspaceInspection.test.ts`: package-manager detection, lifecycle command inference, and test-signal inference from manifest/package data.

## What Is Not Covered

- VS Code activation and command registration behavior
- Clipboard and VS Code command handoff strategies
- Real `codex exec` process execution
- Full `workspaceScanner.ts` temp-dir coverage
- Packaging and `.vsix` install behavior

When changing any of those areas, rely on the authoritative commands above plus manual verification in the Extension Development Host.

## Packaging Note

In the current Node 18 environment, `npm run package` fails inside the `vsce` dependency chain with `ReferenceError: File is not defined` before a `.vsix` is produced.
