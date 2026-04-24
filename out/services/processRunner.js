"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessTimeoutError = exports.ProcessLaunchError = exports.PROCESS_RUN_STDERR_MAX_BYTES = exports.PROCESS_RUN_STDOUT_MAX_BYTES = void 0;
exports.setProcessRunnerOverride = setProcessRunnerOverride;
exports.runProcess = runProcess;
const child_process_1 = require("child_process");
exports.PROCESS_RUN_STDOUT_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
exports.PROCESS_RUN_STDERR_MAX_BYTES = 512 * 1024; // 512 KiB
const PROCESS_FORCE_KILL_GRACE_MS = 5_000;
const PROCESS_STRICT_ENV_ALLOWLIST = false;
const SENSITIVE_ENV_KEY_PATTERN = /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY|API_KEY)$/i;
const DEFAULT_ALLOWED_ENV_KEYS = new Set([
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'COMSPEC',
    'HOME',
    'USERPROFILE',
    'TMP',
    'TEMP',
    'TERM',
    'SHELL',
    'LANG',
    'LC_ALL',
    'PWD'
]);
const DEFAULT_ALLOWED_ENV_PREFIXES = [
    'RALPH_',
    'COPILOT_',
    'AZURE_',
    'OPENAI_',
    'ANTHROPIC_',
    'GEMINI_',
    'CLAUDE_',
    'CODEX_',
    'GITHUB_'
];
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
    stdout;
    stderr;
    exitCode;
    signal;
    constructor(command, args, timeoutMs, details) {
        super(`Process timed out after ${timeoutMs}ms: ${command}`);
        this.name = 'ProcessTimeoutError';
        this.command = command;
        this.args = args;
        this.timeoutMs = timeoutMs;
        this.stdout = details.stdout;
        this.stderr = details.stderr;
        this.exitCode = details.exitCode;
        this.signal = details.signal;
    }
}
exports.ProcessTimeoutError = ProcessTimeoutError;
let processRunnerOverride = null;
let warnedSensitiveEnvPassThrough = false;
function setProcessRunnerOverride(override) {
    processRunnerOverride = override;
}
class RollingUtf8Buffer {
    maxBytes;
    chunks = [];
    totalBytes = 0;
    constructor(maxBytes) {
        this.maxBytes = maxBytes;
    }
    append(text) {
        if (!text) {
            return;
        }
        let chunk = text;
        let chunkBytes = Buffer.byteLength(chunk, 'utf8');
        if (chunkBytes >= this.maxBytes) {
            chunk = sliceUtf8Tail(chunk, this.maxBytes);
            chunkBytes = Buffer.byteLength(chunk, 'utf8');
            this.chunks = [chunk];
            this.totalBytes = chunkBytes;
            return;
        }
        this.chunks.push(chunk);
        this.totalBytes += chunkBytes;
        this.trimFrontToLimit();
    }
    toString() {
        return this.chunks.join('');
    }
    trimFrontToLimit() {
        while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
            const first = this.chunks[0];
            const firstBytes = Buffer.byteLength(first, 'utf8');
            const overflowBytes = this.totalBytes - this.maxBytes;
            if (firstBytes <= overflowBytes) {
                this.chunks.shift();
                this.totalBytes -= firstBytes;
                continue;
            }
            const trimmed = sliceUtf8Tail(first, firstBytes - overflowBytes);
            this.chunks[0] = trimmed;
            this.totalBytes -= overflowBytes;
        }
    }
}
function sliceUtf8Tail(text, maxBytes) {
    if (maxBytes <= 0) {
        return '';
    }
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length <= maxBytes) {
        return text;
    }
    return bytes.subarray(bytes.length - maxBytes).toString('utf8');
}
function looksSensitiveEnvKey(key) {
    return SENSITIVE_ENV_KEY_PATTERN.test(key);
}
function isExplicitlyAllowedEnvKey(key) {
    if (DEFAULT_ALLOWED_ENV_KEYS.has(key)) {
        return true;
    }
    return DEFAULT_ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function buildProcessEnv(envOverride) {
    if (!PROCESS_STRICT_ENV_ALLOWLIST) {
        return envOverride ? { ...process.env, ...envOverride } : process.env;
    }
    const nextEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) {
            continue;
        }
        if (isExplicitlyAllowedEnvKey(key)) {
            nextEnv[key] = value;
        }
    }
    if (envOverride) {
        for (const [key, value] of Object.entries(envOverride)) {
            nextEnv[key] = value;
        }
    }
    return nextEnv;
}
function maybeWarnSensitiveEnvPassThrough(command, envOverride) {
    if (warnedSensitiveEnvPassThrough || !envOverride || PROCESS_STRICT_ENV_ALLOWLIST) {
        return;
    }
    const sensitiveKeys = Object.keys(envOverride).filter(looksSensitiveEnvKey);
    if (sensitiveKeys.length === 0) {
        return;
    }
    warnedSensitiveEnvPassThrough = true;
    process.emitWarning(`runProcess("${command}") received sensitive environment override keys (${sensitiveKeys.join(', ')}). ` +
        'Values are forwarded to the child process but never logged by processRunner.');
}
async function runProcess(command, args, options) {
    if (processRunnerOverride) {
        return processRunnerOverride(command, args, options);
    }
    return new Promise((resolve, reject) => {
        maybeWarnSensitiveEnvPassThrough(command, options.env);
        const env = buildProcessEnv(options.env);
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            shell: options.shell ?? false,
            env
        });
        const stdoutBuffer = new RollingUtf8Buffer(exports.PROCESS_RUN_STDOUT_MAX_BYTES);
        const stderrBuffer = new RollingUtf8Buffer(exports.PROCESS_RUN_STDERR_MAX_BYTES);
        let timedOut = false;
        let timer;
        let forceKillTimer;
        let exited = false;
        let settled = false;
        let closeCode = null;
        let closeSignal = null;
        const clearTimers = () => {
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            if (forceKillTimer) {
                clearTimeout(forceKillTimer);
                forceKillTimer = undefined;
            }
        };
        const settle = (action) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimers();
            action();
        };
        if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                forceKillTimer = setTimeout(() => {
                    if (!exited) {
                        child.kill('SIGKILL');
                    }
                }, PROCESS_FORCE_KILL_GRACE_MS);
            }, options.timeoutMs);
        }
        child.stdout?.on('data', (chunk) => {
            const text = chunk.toString();
            stdoutBuffer.append(text);
            options.onStdoutChunk?.(text);
        });
        child.stderr?.on('data', (chunk) => {
            const text = chunk.toString();
            stderrBuffer.append(text);
            options.onStderrChunk?.(text);
        });
        child.on('error', (error) => {
            settle(() => {
                reject(new ProcessLaunchError(command, args, error));
            });
        });
        child.on('close', (code, signal) => {
            exited = true;
            closeCode = code ?? null;
            closeSignal = signal ?? null;
            settle(() => {
                if (timedOut) {
                    reject(new ProcessTimeoutError(command, args, options.timeoutMs, {
                        stdout: stdoutBuffer.toString(),
                        stderr: stderrBuffer.toString(),
                        exitCode: closeCode,
                        signal: closeSignal
                    }));
                    return;
                }
                resolve({
                    code: code ?? 1,
                    stdout: stdoutBuffer.toString(),
                    stderr: stderrBuffer.toString()
                });
            });
        });
        if (options.stdinText !== undefined && child.stdin) {
            child.stdin.write(options.stdinText);
            child.stdin.end();
        }
    });
}
//# sourceMappingURL=processRunner.js.map