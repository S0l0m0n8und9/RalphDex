# Marketplace Publish Dry-Run — 2026-06-02

Issue: <https://github.com/S0l0m0n8und9/RalphDex/issues/100>

Run timestamp: 2026-06-02 13:09 UTC / 2026-06-03 01:09 NZST

## Result

Status: pass with one non-blocking `vsce` warning.

No publish blockers were found. The generated VSIX was not committed.

## Commands Run

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run validate` | Pass | 1525 tests passed; compile, docs, ledger, prompt-budget, lint, and unit/webview tests completed. |
| `npm run package` | Pass | Emitted `ralphdex-1.2.0.vsix`; final payload was 8519 files, 10.56 MB. |
| `npm run publish:dry-run` | Pass | Aliased `npm run package` and completed without publishing. |
| Focused packaging policy test | Pass | `releasePackaging.test.ts` verifies runtime dependencies are included and dev-only package junk is excluded. |
| Packaged VSIX install and activation smoke | Pass | Installed `ralphdex-1.2.0.vsix` into a temporary VS Code extensions directory, activated `s0l0m0n8und9.ralphdex`, confirmed key commands registered, opened the dashboard, and received packaged React webview readiness for `dashboard`. |

## Package Payload

Confirmed included Marketplace/runtime surfaces:

- `extension/readme.md`
- `extension/changelog.md`
- `extension/package.json`
- `extension/media/ralph-icon.png`
- `extension/out/webview-ui/main.js`
- `extension/out/webview-ui/main.css`

Removed package drift during this pass:

- `.github/**`
- `AGENTS.md`
- `AGENTS.local.md`
- `.ralph-config.json`

These entries are development, CI, or agent-routing surfaces and are now excluded by `.vscodeignore`.

## Marketplace Metadata Sanity

- `package.json` version: `1.2.0`
- `CHANGELOG.md` has `## [1.2.0]`
- README Marketplace badge targets `s0l0m0n8und9.ralphdex`
- Repository URL: `https://github.com/S0l0m0n8und9/RalphDex.git`
- Icon path: `media/ralph-icon.png`
- Contributed command count: 44
- README command surface was refreshed to include all contributed command titles.

## Remaining Warning

`vsce` warns that the extension contains 8519 files, including 1221 JavaScript files, and recommends bundling/excluding more files for performance.

Assessment: non-blocking for this dry-run. The large file count is dominated by runtime dependencies under `node_modules/`, which are intentionally included by the current package policy and guarded by `test/releasePackaging.test.ts`. A future package-size optimization can revisit extension bundling without blocking this release-readiness check.
