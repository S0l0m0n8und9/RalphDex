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
npm run validate
```

Run this from the Ralphdex repo root. All checks (compile, docs, ledger, prompt-budget, lint, tests) must pass before proceeding.

### 2. Bump the version

Edit `package.json` and increment `version` following [semver](https://semver.org/):

| Change type | Example bump |
|-------------|-------------|
| Bug fix / patch | `0.1.0` → `0.1.1` |
| New feature, backwards-compatible | `0.1.0` → `0.2.0` |
| Breaking change | `0.1.0` → `1.0.0` |

### 3. Update CHANGELOG.md

Add a new `## [x.y.z] — YYYY-MM-DD` section at the top of `CHANGELOG.md` describing the operator-visible changes in the release. Keep the newest entry first.

### 4. Smoke-test the package locally

```bash
npm run package
```

This runs `check:runtime` then `vsce package --no-dependencies`. Inspect the generated `.vsix` for 0 blocking warnings before continuing.

### 5. Validate the Marketplace publish path without shipping

```bash
npm run publish:dry-run
```

Run this from the Ralphdex repo root after `npm run package` succeeds. The script validates the package using `npm run package` (equivalent to `vsce package --no-dependencies`), which validates CHANGELOG format, file inclusion, and packaging integrity without shipping a Marketplace release.

Treat this as the final authoritative validation step before the real publish command. A successful run proves the current package, metadata, and extension structure are ready for publishing.

### 6. Commit and tag

```bash
git add package.json CHANGELOG.md README.md docs/release-workflow.md
git commit -m "chore(release): bump version to x.y.z"
git tag v<x.y.z>
git push origin main --tags
```

If the release only changes version and changelog content, stage just those files. Include `README.md` or release docs when the Marketplace-facing install or publish guidance changed.

### 7. Publish

```bash
npx vsce publish --no-dependencies
```

Run this from the Ralphdex repo root only after `npm run publish:dry-run` succeeds. `vsce` will prompt for the PAT if `VSCE_PAT` is not set in the environment. Alternatively:

```bash
VSCE_PAT=<token> npx vsce publish --no-dependencies
```

### 8. Verify on the Marketplace

Visit the Marketplace listing and publisher page to confirm the new version is live and the README-rendered metadata look correct:

<https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex>

<https://marketplace.visualstudio.com/manage/publishers/s0l0m0n8und9>

Confirm at minimum:

- the version matches `package.json`
- the README renders the install and post-install tour sections correctly
- the icon, banner, and repo/support links resolve to the current Ralphdex project

## Rollback

If a bad version ships, yank it from the Marketplace management page and publish a patch release.  
Do not delete the git tag — use it as a reference for the revert diff.

## Environment variable reference

| Variable | Purpose |
|----------|---------|
| `VSCE_PAT` | Marketplace PAT for `vsce publish` — keep out of source control |
