# VS Code Settings Migration Design

**Date:** 2026-04-09  
**Status:** Approved

## Problem

`ralph.code-workspace` is tracked in git and contains all `ralphCodex.*` and `kiro-codex-ide.*` settings. When the extension writes runtime config changes (e.g. `modelTiering`), it dirtied the workspace file on every session — creating noisy, unintentional git diffs.

Additionally, `readConfig.ts` contained a no-scope `getConfiguration('ralphCodex')` workaround to avoid a VS Code "window-scoped setting accessed via resource" warning that only arises in multi-root workspaces.

## Solution

Move all dev-time settings to `/.vscode/settings.json`, which is folder-scoped and the correct target for `ConfigurationTarget.Workspace` writes. Strip `ralph.code-workspace` to a folders-only stub. Remove the `readConfig.ts` workaround.

## Changes

### 1. Create `/.vscode/settings.json`

All `ralphCodex.*` and `kiro-codex-ide.*` keys move here verbatim from `ralph.code-workspace`. This file is tracked as the canonical dev-time seed config. VS Code reads it when the repo is opened as a folder (recommended) or via the workspace stub.

### 2. Strip `ralph.code-workspace`

Reduce to:
```json
{ "folders": [{ "path": "." }] }
```
No settings block. File remains on disk so double-click workflows still work. Runtime extension writes will now target `/.vscode/settings.json` instead, keeping the workspace stub clean.

### 3. No launch/task config changes

`.vscode/launch.json` and `.vscode/tasks.json` already use `${workspaceFolder}` — they are agnostic to how the folder was opened.

### 4. Gitignore `ralph-codex-vscode-starter/.vscode/settings.json`

The package-level settings file contains stale overrides (`ralphIterationCap: 10`, etc.) that conflict with the authoritative root config. Add it to `ralph-codex-vscode-starter/.gitignore` to prevent confusion. The root `/.vscode/settings.json` remains tracked.

### 5. Simplify `readConfig.ts`

Remove the no-scope workaround at line 452. Replace:
```ts
const enableInspect = vscode.workspace.getConfiguration('ralphCodex').inspect<boolean>('enableModelTiering');
```
with:
```ts
const enableInspect = config.inspect<boolean>('enableModelTiering');
```
`config` is already `getConfiguration('ralphCodex', workspaceFolder.uri)`. In a folder-based workspace the window-scope-via-resource warning never fires, so the workaround is no longer needed. Behaviour is identical — `workspaceValue` and `globalValue` are still checked in the same order.

## Out of Scope

- No changes to launch or task configurations
- No changes to `package.json` setting declarations
- No changes to `WebviewConfigSync` or write-path logic — those already target `ConfigurationTarget.Workspace`
