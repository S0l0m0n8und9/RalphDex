**Changed**
Added deterministic handoff coverage in the stub smoke suite so clipboard and IDE-command flows are now exercised end to end in tests: [commandShell.smoke.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts#L64), [register-vscode-stub.cjs](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs#L4), [vscodeTestHarness.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts#L6). The new cases cover prompt clipboard auto-copy, `Open Codex IDE` in `clipboard` mode, `ideCommand` mode with successful command execution, missing-command fallback warnings, and the `cliExec` warning-only fallback.

Documented the operator-facing handoff rules and remaining live-host limits in [workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md#L21), [testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md#L20), and [boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md#L70). Updated durable Ralph state to mark T5 complete in [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json#L33) and [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md#L3).

**Validation**
Ran `cd ralph-codex-vscode-starter && npm test` and it passed: 15 tests, 0 failures.

**Assumptions / Limitations**
No blockers. I left the pre-existing unrelated dirty worktree state intact. Remaining gap is still real host verification for clipboard and VS Code command handoff; the new coverage is deterministic stub smoke, not live Extension Development Host UI automation.