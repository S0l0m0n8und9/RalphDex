**Changed Files**
- Added nested-root scanner regression assertions in [workspaceScanner.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/workspaceScanner.test.ts#L64) to pin the selected child root and full candidate list when the repo lives under a nested workspace directory.
- Strengthened prompt repo-context regression coverage in [promptBuilder.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/promptBuilder.test.ts#L382) to require both inspected-root and workspace-root lines, `package.json` name rendering, and matching repo-context evidence for nested scans.
- Marked T4 done in [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json#L24) and recorded completion in [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md#L7).

**Validation Results**
- Passed: `cd ralph-codex-vscode-starter && npm test`
- Result: 15 tests passed, 0 failed.

**Assumptions Or Blockers**
- No blockers.
- I treated T4 as test-only coverage work; no runtime source changes were needed.

**Known Limitations Or Follow-up Work**
- T5 remains next: cover clipboard and IDE handoff strategies with automated tests and docs.