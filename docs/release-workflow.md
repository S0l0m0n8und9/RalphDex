# Release Workflow

This document covers the steps to publish a new version of Ralphdex to the VS Code Marketplace.

## Prerequisites

- `@vscode/vsce` is installed as a dev dependency (`npm install` installs it).
- A Personal Access Token (PAT) for the `s0l0m0n8und9` Marketplace publisher is available.  
  Create or rotate one at <https://marketplace.visualstudio.com/manage/publishers/s0l0m0n8und9>.
- The working branch is clean and up to date with `origin/main`.

## Steps

### 1. Validate the baseline

```bash
cd ralph-codex-vscode-starter
npm run validate
```

All checks (compile, docs, ledger, prompt-budget, lint, tests) must pass before proceeding.

### 2. Bump the version

Edit `package.json` and increment `version` following [semver](https://semver.org/):

| Change type | Example bump |
|-------------|-------------|
| Bug fix / patch | `0.1.0` → `0.1.1` |
| New feature, backwards-compatible | `0.1.0` → `0.2.0` |
| Breaking change | `0.1.0` → `1.0.0` |

### 3. Update CHANGELOG.md

Add a new `## [x.y.z] — YYYY-MM-DD` section at the top of `CHANGELOG.md` describing what changed.

### 4. Smoke-test the package locally

```bash
npm run package
```

This runs `check:runtime` then `vsce package --no-dependencies`. Inspect the generated `.vsix` for 0 blocking warnings before continuing.

### 5. Commit and tag

```bash
git add ralph-codex-vscode-starter/package.json ralph-codex-vscode-starter/CHANGELOG.md
git commit -m "chore(release): bump version to x.y.z"
git tag v<x.y.z>
git push origin main --tags
```

### 6. Publish

```bash
cd ralph-codex-vscode-starter
npx vsce publish --no-dependencies
```

`vsce` will prompt for the PAT if `VSCE_PAT` is not set in the environment. Alternatively:

```bash
VSCE_PAT=<token> npx vsce publish --no-dependencies
```

### 7. Verify on the Marketplace

Visit the publisher page to confirm the new version is live:  
<https://marketplace.visualstudio.com/manage/publishers/s0l0m0n8und9>

## Rollback

If a bad version ships, yank it from the Marketplace management page and publish a patch release.  
Do not delete the git tag — use it as a reference for the revert diff.

## Environment variable reference

| Variable | Purpose |
|----------|---------|
| `VSCE_PAT` | Marketplace PAT for `vsce publish` — keep out of source control |
