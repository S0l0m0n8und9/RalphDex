# VS Code Settings Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all `ralphCodex.*` and `kiro-codex-ide.*` settings from `ralph.code-workspace` into `/.vscode/settings.json`, strip the workspace file to a folders-only stub, gitignore the stale package-level settings override, and remove the no-scope `getConfiguration` workaround from `readConfig.ts`.

**Architecture:** Settings move to the standard folder-scoped location so the extension's runtime writes (e.g. `modelTiering`) no longer dirty the tracked workspace file. With settings in `.vscode/settings.json`, VS Code's `getConfiguration(section, resource)` works correctly without the window-scope warning, eliminating the workaround in `readConfig.ts`.

**Tech Stack:** TypeScript, VS Code extension API, Node test runner, npm scripts.

---

## Files

| Action | Path | Purpose |
|---|---|---|
| Create | `/.vscode/settings.json` | Canonical dev-time Ralph config (tracked) |
| Modify | `/ralph.code-workspace` | Strip to folders-only stub |
| Modify | `/ralph-codex-vscode-starter/.gitignore` | Ignore stale package-level settings override |
| Modify | `ralph-codex-vscode-starter/src/config/readConfig.ts` | Remove no-scope `getConfiguration` workaround |
| Modify | `ralph-codex-vscode-starter/test/readConfig.test.ts` | Add test for `enableModelTiering` inspect path |

---

## Task 1: Create `/.vscode/settings.json` and strip `ralph.code-workspace`

**Files:**
- Create: `/.vscode/settings.json`
- Modify: `/ralph.code-workspace`

- [ ] **Step 1: Create `/.vscode/settings.json` with the migrated settings**

  Create the file at the repo root (`.vscode/` already exists — `launch.json` and `tasks.json` are there).

  ```json
  {
      "kiro-codex-ide.codex.promptsPath": ".ralph/prompts",
      "kiro-codex-ide.codex.steeringPath": "ralph-codex-vscode-starter",
      "kiro-codex-ide.codex.specsPath": ".ralph",
      "ralphCodex.agentCount": 1,
      "ralphCodex.cliProvider": "codex",
      "ralphCodex.promptBudgetProfile": "claude",
      "ralphCodex.ralphIterationCap": 15,
      "ralphCodex.model": "claude-sonnet-4-6",
      "ralphCodex.agentId": "build",
      "ralphCodex.claudeMaxTurns": 125,
      "ralphCodex.scmStrategy": "commit-on-done",
      "ralphCodex.scmPrOnParentDone": false,
      "ralphCodex.enableModelTiering": true,
      "ralphCodex.modelTiering": {
          "simple": {
              "model": "claude-sonnet-4.5"
          },
          "medium": {
              "model": "claude-opus-4.6",
              "provider": "copilot"
          },
          "complex": {
              "model": "claude-sonnet-4-6"
          }
      }
  }
  ```

- [ ] **Step 2: Strip `ralph.code-workspace` to the folders-only stub**

  Replace the entire contents of `/ralph.code-workspace` with:

  ```json
  {
  	"folders": [
  		{
  			"path": "."
  		}
  	]
  }
  ```

- [ ] **Step 3: Verify the files look right**

  ```bash
  cat .vscode/settings.json
  cat ralph.code-workspace
  ```

  Expected: `settings.json` has all the `ralphCodex.*` keys; `ralph.code-workspace` has only the `folders` block with no `settings` key.

- [ ] **Step 4: Commit**

  ```bash
  git add .vscode/settings.json ralph.code-workspace
  git commit -m "chore: move ralphCodex settings from workspace file to .vscode/settings.json"
  ```

---

## Task 2: Gitignore the stale package-level settings override

**Files:**
- Modify: `ralph-codex-vscode-starter/.gitignore`

The file `ralph-codex-vscode-starter/.vscode/settings.json` currently contains:

```json
{
    "ralphCodex.claudeMaxTurns": 125,
    "ralphCodex.scmStrategy": "commit-on-done",
    "ralphCodex.ralphIterationCap": 10
}
```

These stale overrides (`ralphIterationCap: 10` vs the intended `15`) will conflict with the authoritative root config. Gitignoring removes the confusion without deleting the file for developers who have it locally.

- [ ] **Step 1: Add the entry to `ralph-codex-vscode-starter/.gitignore`**

  Open `ralph-codex-vscode-starter/.gitignore` and append this line at the end:

  ```
  .vscode/settings.json
  ```

- [ ] **Step 2: Verify the file is now ignored**

  ```bash
  git status ralph-codex-vscode-starter/.vscode/settings.json
  ```

  Expected output contains: `nothing to commit` or the file is listed under "Ignored files" (not "Changes to be committed").

  If git still tracks it (it's currently committed), untrack it:

  ```bash
  git rm --cached ralph-codex-vscode-starter/.vscode/settings.json
  ```

  Then re-check `git status` — the file should no longer appear as modified.

- [ ] **Step 3: Commit**

  ```bash
  git add ralph-codex-vscode-starter/.gitignore
  # Include the rm --cached change if you ran it:
  git add -u ralph-codex-vscode-starter/.vscode/settings.json
  git commit -m "chore: gitignore stale package-level .vscode/settings.json override"
  ```

---

## Task 3: Add test for `enableModelTiering` inspect path, then simplify `readConfig.ts`

This is the only TypeScript code change. The existing test harness stub (`test/register-vscode-stub.cjs`) makes `getConfiguration()` ignore its arguments, so both the old no-scope call and the new resource-scoped call produce the same result in tests. We add a test first to document intent, then make the change.

**Files:**
- Modify: `ralph-codex-vscode-starter/test/readConfig.test.ts`
- Modify: `ralph-codex-vscode-starter/src/config/readConfig.ts`

- [ ] **Step 1: Add a failing-capable test for `enableModelTiering` workspace override**

  Open `ralph-codex-vscode-starter/test/readConfig.test.ts` and append this test:

  ```ts
  test('readConfig applies enableModelTiering workspace override to modelTiering.enabled', () => {
    const harness = vscodeTestHarness();
    harness.setConfiguration({
      enableModelTiering: true,
      modelTiering: {
        simple: { model: 'claude-haiku-4-5' },
        medium: { model: 'claude-sonnet-4-6' },
        complex: { model: 'claude-opus-4-6' }
      }
    });

    const config = readConfig(workspaceFolder('C:\\repo'));

    assert.equal(config.modelTiering.enabled, true);

    harness.setConfiguration({
      enableModelTiering: false,
      modelTiering: {
        simple: { model: 'claude-haiku-4-5' },
        medium: { model: 'claude-sonnet-4-6' },
        complex: { model: 'claude-opus-4-6' }
      }
    });

    const disabled = readConfig(workspaceFolder('C:\\repo'));
    assert.equal(disabled.modelTiering.enabled, false);
  });
  ```

- [ ] **Step 2: Run the new test to confirm it passes with current code**

  ```bash
  cd ralph-codex-vscode-starter && npm test -- --test-name-pattern "enableModelTiering"
  ```

  Expected: PASS (the stub returns identical results for both scoped and unscoped calls, so existing behaviour is correct).

- [ ] **Step 3: Remove the no-scope workaround in `readConfig.ts`**

  In `ralph-codex-vscode-starter/src/config/readConfig.ts`, find the `modelTiering` IIFE (around line 446). Replace the three comment lines and the no-scope `getConfiguration` call:

  ```ts
  // Before (lines 448-452):
  // Flat ralphCodex.enableModelTiering takes precedence over modelTiering.enabled,
  // but only if explicitly set by the user (workspace or global scope).
  // Using inspect() avoids treating the package.json default (false) as a user choice.
  // Use a no-scope getConfiguration to avoid window-scoped-setting-via-resource warnings.
  const enableInspect = vscode.workspace.getConfiguration('ralphCodex').inspect<boolean>('enableModelTiering');
  ```

  With:

  ```ts
  // Flat ralphCodex.enableModelTiering takes precedence over modelTiering.enabled,
  // but only if explicitly set by the user (workspace or global scope).
  // Using inspect() avoids treating the package.json default (false) as a user choice.
  const enableInspect = config.inspect<boolean>('enableModelTiering');
  ```

  The surrounding lines (453-457) stay unchanged:

  ```ts
  const enableOverride = enableInspect?.workspaceValue ?? enableInspect?.globalValue;
  if (typeof enableOverride === 'boolean') {
    tiering.enabled = enableOverride;
  }
  return tiering;
  ```

- [ ] **Step 4: Run the full test suite**

  ```bash
  cd ralph-codex-vscode-starter && npm run validate
  ```

  Expected: compile → check:docs → lint → tests all pass with 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add ralph-codex-vscode-starter/test/readConfig.test.ts ralph-codex-vscode-starter/src/config/readConfig.ts
  git commit -m "refactor: use scoped config.inspect for enableModelTiering, remove no-scope workaround"
  ```
