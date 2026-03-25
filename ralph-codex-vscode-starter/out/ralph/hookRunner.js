"use strict";
/**
 * Lifecycle hook runner.
 *
 * Adopted from Ruflo's hook system, which fires shell commands at key execution
 * points (initialization, completion, failure, etc.).
 *
 * Hooks are operator-configured shell commands that run at well-defined lifecycle
 * points without affecting loop correctness.  A hook that exits non-zero is
 * logged as a warning but never stops the loop or marks an iteration failed.
 *
 * Available environment variables injected into every hook:
 *   RALPH_AGENT_ID   – the configured agent ID
 *   RALPH_TASK_ID    – the selected task ID (empty string if none)
 *   RALPH_OUTCOME    – the completion classification or 'pending'
 *   RALPH_STOP_REASON – the stop reason or empty string
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHook = runHook;
const processRunner_1 = require("../services/processRunner");
const HOOK_TIMEOUT_MS = 30_000;
async function runHookWithTimeout(command, env, cwd) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOOK_TIMEOUT_MS);
    try {
        const result = await (0, processRunner_1.runProcess)('sh', ['-c', command], { cwd, shell: false, env });
        return result;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Runs a single named hook if configured.  Never throws — errors are captured
 * in the returned result.
 */
async function runHook(hookName, hooks, context) {
    const command = hooks[hookName];
    if (!command) {
        return {
            hook: hookName,
            command: '',
            exitCode: 0,
            stdout: '',
            stderr: '',
            durationMs: 0,
            skipped: true
        };
    }
    const env = {
        ...process.env,
        RALPH_AGENT_ID: context.agentId,
        RALPH_TASK_ID: context.taskId ?? '',
        RALPH_OUTCOME: context.outcome,
        RALPH_STOP_REASON: context.stopReason ?? ''
    };
    const startMs = Date.now();
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
        const result = await runHookWithTimeout(command, env, context.cwd);
        exitCode = result.code ?? 0;
        stdout = result.stdout;
        stderr = result.stderr;
    }
    catch (error) {
        exitCode = 1;
        stderr = error instanceof Error ? error.message : String(error);
    }
    return {
        hook: hookName,
        command,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startMs,
        skipped: false
    };
}
//# sourceMappingURL=hookRunner.js.map