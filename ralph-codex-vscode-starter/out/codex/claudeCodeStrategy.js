"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeCliExecStrategy = void 0;
exports.buildClaudeCodeExecArgs = buildClaudeCodeExecArgs;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("../ralph/integrity");
const processRunner_1 = require("../services/processRunner");
// Known gap: request.reasoningEffort is intentionally ignored.
// --config model_reasoning_effort is a Codex-only flag not supported by Claude Code CLI.
function mapSandboxToPermissionMode(sandboxMode) {
    switch (sandboxMode) {
        case 'read-only':
            return 'plan';
        case 'danger-full-access':
            return 'bypassPermissions';
        case 'workspace-write':
        default:
            return 'default';
    }
}
function firstNonEmptyLine(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
        ?? null;
}
function truncateSummary(value, maxLength = 240) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
function isIgnorableStderrLine(line) {
    return /^╭|^│|^╰/.test(line)
        || /^Session:/.test(line)
        || /^Model:/.test(line)
        || /^Tools:/.test(line)
        || /^Cost:/.test(line)
        || /^Duration:/.test(line)
        || /^Tokens:/.test(line)
        || /^\s*$/.test(line)
        || /^claude\.ai/i.test(line)
        || /^Anthropic/i.test(line);
}
function extractClaudeCodeFailureDetail(stderr, lastMessage) {
    const stderrLines = stderr
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    for (const line of stderrLines) {
        if (/^Error:/i.test(line)) {
            return truncateSummary(line.replace(/^Error:\s*/i, ''));
        }
    }
    const lastMessageLine = firstNonEmptyLine(lastMessage);
    if (lastMessageLine) {
        return truncateSummary(lastMessageLine);
    }
    for (const line of [...stderrLines].reverse()) {
        if (!isIgnorableStderrLine(line)) {
            return truncateSummary(line);
        }
    }
    return null;
}
function buildClaudeCodeExecArgs(request) {
    return [
        '-p', '-',
        '--output-format', 'json',
        '--model', request.model,
        '--permission-mode', mapSandboxToPermissionMode(request.sandboxMode),
        '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
        '--no-session-persistence',
        '--max-turns', '1'
    ];
}
function buildClaudeCodeTranscript(result, request) {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
    return [
        '# Claude Code Exec Transcript',
        '',
        `- Command: ${request.commandPath} ${result.args.join(' ')}`,
        `- Workspace root: ${request.workspaceRoot}`,
        `- Execution root: ${request.executionRoot}`,
        `- Prompt path: ${request.promptPath}`,
        `- Prompt hash: ${request.promptHash}`,
        `- Prompt bytes: ${request.promptByteLength}`,
        `- Model: ${request.model}`,
        `- Permission mode: ${mapSandboxToPermissionMode(request.sandboxMode)}`,
        `- Stdin hash: ${result.stdinHash}`,
        `- Payload matched prompt artifact: ${payloadMatched}`,
        `- Last message path: ${request.lastMessagePath}`,
        `- Exit code: ${result.exitCode}`,
        '',
        '## Stdout',
        '',
        result.stdout || '(empty)',
        '',
        '## Stderr',
        '',
        result.stderr || '(empty)',
        '',
        '## Extracted Response',
        '',
        result.lastMessage || '(empty)'
    ].join('\n');
}
async function hasGitMetadata(rootPath) {
    try {
        await fs.access(path.join(rootPath, '.git'));
        return true;
    }
    catch {
        return false;
    }
}
class ClaudeCodeCliExecStrategy {
    logger;
    id = 'claudeCode';
    constructor(logger) {
        this.logger = logger;
    }
    async runExec(request) {
        await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
        await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
        // hasGitMetadata is checked but not used to skip-git-repo-check; Claude Code CLI does not
        // have this flag. The call is retained for symmetry with CliExecCodexStrategy.
        await hasGitMetadata(request.executionRoot);
        const args = buildClaudeCodeExecArgs(request);
        const stdinHash = (0, integrity_1.hashText)(request.prompt);
        if (stdinHash !== request.promptHash) {
            throw new Error(`Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`);
        }
        this.logger.info('Starting Claude Code CLI exec.', {
            commandPath: request.commandPath,
            workspaceRoot: request.workspaceRoot,
            executionRoot: request.executionRoot,
            promptPath: request.promptPath,
            args
        });
        let processResult;
        try {
            processResult = await (0, processRunner_1.runProcess)(request.commandPath, args, {
                cwd: request.executionRoot,
                stdinText: request.prompt,
                onStdoutChunk: request.onStdoutChunk,
                onStderrChunk: request.onStderrChunk
            });
        }
        catch (error) {
            if (error instanceof processRunner_1.ProcessLaunchError) {
                if (error.code === 'ENOENT') {
                    throw new Error(`Claude Code CLI was not found at "${request.commandPath}". Install Claude Code CLI or update ralphCodex.claudeCodeCommandPath.`, { cause: error });
                }
                throw new Error(`Failed to start Claude Code CLI with "${request.commandPath}": ${error.message}`, { cause: error });
            }
            throw error;
        }
        // Extract the model's response from Claude Code JSON output.
        // --output-format json writes a JSON object to stdout with a `result` field.
        // Fall back to raw stdout if parsing fails.
        let lastMessage = '';
        const trimmedStdout = processResult.stdout.trim();
        if (trimmedStdout) {
            try {
                const parsed = JSON.parse(trimmedStdout);
                if (typeof parsed.result === 'string') {
                    lastMessage = parsed.result;
                }
                else {
                    lastMessage = trimmedStdout;
                }
            }
            catch {
                lastMessage = trimmedStdout;
            }
        }
        await fs.writeFile(request.lastMessagePath, lastMessage, 'utf8');
        const summarize = (input) => {
            if (input.exitCode === 0) {
                return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'claude completed successfully.');
            }
            const detail = extractClaudeCodeFailureDetail(input.stderr, input.lastMessage);
            return detail
                ? `claude exited with code ${input.exitCode}: ${detail}`
                : `claude exited with code ${input.exitCode}.`;
        };
        const result = {
            strategy: this.id,
            success: processResult.code === 0,
            message: summarize({
                exitCode: processResult.code,
                stderr: processResult.stderr,
                lastMessage
            }),
            warnings: [],
            exitCode: processResult.code,
            stdout: processResult.stdout,
            stderr: processResult.stderr,
            args,
            stdinHash,
            transcriptPath: request.transcriptPath,
            lastMessagePath: request.lastMessagePath,
            lastMessage
        };
        await fs.writeFile(request.transcriptPath, `${buildClaudeCodeTranscript(result, request).trimEnd()}\n`, 'utf8');
        return result;
    }
}
exports.ClaudeCodeCliExecStrategy = ClaudeCodeCliExecStrategy;
//# sourceMappingURL=claudeCodeStrategy.js.map