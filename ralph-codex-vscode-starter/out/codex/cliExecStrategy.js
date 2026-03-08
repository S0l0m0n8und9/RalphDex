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
exports.CliExecCodexStrategy = void 0;
exports.buildCodexExecArgs = buildCodexExecArgs;
exports.buildCodexExecTranscript = buildCodexExecTranscript;
exports.summarizeCodexExecResultMessage = summarizeCodexExecResultMessage;
exports.describeCodexExecLaunchError = describeCodexExecLaunchError;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("../ralph/integrity");
const processRunner_1 = require("../services/processRunner");
async function hasGitMetadata(rootPath) {
    try {
        await fs.access(path.join(rootPath, '.git'));
        return true;
    }
    catch {
        return false;
    }
}
function buildCodexExecArgs(request, includeSkipGitRepoCheck) {
    const args = [
        'exec',
        '--model', request.model,
        '--sandbox', request.sandboxMode,
        '--config', `approval_policy="${request.approvalMode}"`,
        '--cd', request.workspaceRoot,
        '--output-last-message', request.lastMessagePath
    ];
    if (includeSkipGitRepoCheck) {
        args.push('--skip-git-repo-check');
    }
    args.push('-');
    return args;
}
function buildCodexExecTranscript(result, request) {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
    return [
        '# Codex Exec Transcript',
        '',
        `- Command: ${request.commandPath} ${result.args.join(' ')}`,
        `- Prompt path: ${request.promptPath}`,
        `- Prompt hash: ${request.promptHash}`,
        `- Prompt bytes: ${request.promptByteLength}`,
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
        '## Last Message',
        '',
        result.lastMessage || '(empty)'
    ].join('\n');
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
    return /^WARNING:/i.test(line)
        || /^Reconnecting\.\.\./.test(line)
        || /^mcp:/i.test(line)
        || /^mcp startup:/i.test(line)
        || /^OpenAI Codex\b/.test(line)
        || /^-+$/.test(line)
        || /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(line)
        || /^user$/i.test(line)
        || /^# Ralph Prompt:/.test(line)
        || /^## /.test(line)
        || /^- /.test(line);
}
function extractCodexExecFailureDetail(stderr, lastMessage) {
    const stderrLines = stderr
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    for (const line of [...stderrLines].reverse()) {
        if (/^ERROR:/i.test(line)
            && !/failed to shutdown rollout recorder/i.test(line)
            && !/no last agent message/i.test(line)) {
            return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
        }
    }
    const lastMessageLine = firstNonEmptyLine(lastMessage);
    if (lastMessageLine) {
        return truncateSummary(lastMessageLine);
    }
    for (const line of [...stderrLines].reverse()) {
        if (!isIgnorableStderrLine(line)) {
            return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
        }
    }
    return null;
}
function summarizeCodexExecResultMessage(input) {
    if (input.exitCode === 0) {
        return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'codex exec completed successfully.');
    }
    const detail = extractCodexExecFailureDetail(input.stderr, input.lastMessage);
    return detail
        ? `codex exec exited with code ${input.exitCode}: ${detail}`
        : `codex exec exited with code ${input.exitCode}.`;
}
function describeCodexExecLaunchError(request, error) {
    if (error.code === 'ENOENT') {
        return `Codex CLI was not found at "${request.commandPath}". Install Codex CLI or update ralphCodex.codexCommandPath.`;
    }
    return `Failed to start codex exec with "${request.commandPath}": ${error.message}`;
}
class CliExecCodexStrategy {
    logger;
    id = 'cliExec';
    constructor(logger) {
        this.logger = logger;
    }
    async runExec(request) {
        await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
        await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
        const args = buildCodexExecArgs(request, !(await hasGitMetadata(request.workspaceRoot)));
        const stdinHash = (0, integrity_1.hashText)(request.prompt);
        if (stdinHash !== request.promptHash) {
            throw new Error(`Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`);
        }
        this.logger.info('Starting codex exec.', {
            commandPath: request.commandPath,
            workspaceRoot: request.workspaceRoot,
            promptPath: request.promptPath,
            args
        });
        let processResult;
        try {
            processResult = await (0, processRunner_1.runProcess)(request.commandPath, args, {
                cwd: request.workspaceRoot,
                stdinText: request.prompt,
                onStdoutChunk: request.onStdoutChunk,
                onStderrChunk: request.onStderrChunk
            });
        }
        catch (error) {
            if (error instanceof processRunner_1.ProcessLaunchError) {
                throw new Error(describeCodexExecLaunchError(request, error), { cause: error });
            }
            throw error;
        }
        const lastMessage = await fs.readFile(request.lastMessagePath, 'utf8').catch(() => '');
        const result = {
            strategy: this.id,
            success: processResult.code === 0,
            message: summarizeCodexExecResultMessage({
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
        await fs.writeFile(request.transcriptPath, `${buildCodexExecTranscript(result, request).trimEnd()}\n`, 'utf8');
        return result;
    }
}
exports.CliExecCodexStrategy = CliExecCodexStrategy;
//# sourceMappingURL=cliExecStrategy.js.map