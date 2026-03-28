"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessTimeoutError = exports.ProcessLaunchError = void 0;
exports.setProcessRunnerOverride = setProcessRunnerOverride;
exports.runProcess = runProcess;
const child_process_1 = require("child_process");
class ProcessLaunchError extends Error {
    command;
    args;
    code;
    constructor(command, args, error) {
        const details = error;
        super(details.message || `Failed to start process: ${command}`);
        this.name = 'ProcessLaunchError';
        this.command = command;
        this.args = args;
        this.code = details.code;
    }
}
exports.ProcessLaunchError = ProcessLaunchError;
class ProcessTimeoutError extends Error {
    command;
    args;
    timeoutMs;
    constructor(command, args, timeoutMs) {
        super(`Process timed out after ${timeoutMs}ms: ${command}`);
        this.name = 'ProcessTimeoutError';
        this.command = command;
        this.args = args;
        this.timeoutMs = timeoutMs;
    }
}
exports.ProcessTimeoutError = ProcessTimeoutError;
let processRunnerOverride = null;
function setProcessRunnerOverride(override) {
    processRunnerOverride = override;
}
async function runProcess(command, args, options) {
    if (processRunnerOverride) {
        return processRunnerOverride(command, args, options);
    }
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            shell: options.shell ?? false,
            env: options.env ? { ...process.env, ...options.env } : process.env
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timer;
        if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }, options.timeoutMs);
        }
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            options.onStdoutChunk?.(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            options.onStderrChunk?.(text);
        });
        child.on('error', (error) => {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new ProcessLaunchError(command, args, error));
        });
        child.on('close', (code) => {
            if (timer) {
                clearTimeout(timer);
            }
            if (timedOut) {
                reject(new ProcessTimeoutError(command, args, options.timeoutMs));
                return;
            }
            resolve({
                code: code ?? 1,
                stdout,
                stderr
            });
        });
        if (options.stdinText !== undefined) {
            child.stdin.write(options.stdinText);
            child.stdin.end();
        }
    });
}
//# sourceMappingURL=processRunner.js.map