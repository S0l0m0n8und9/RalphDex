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
exports.describeCodexExecLaunchError = describeCodexExecLaunchError;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
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
        '--ask-for-approval', request.approvalMode,
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
    return [
        '# Codex Exec Transcript',
        '',
        `- Command: ${request.commandPath} exec --model ${request.model} --sandbox ${request.sandboxMode} --ask-for-approval ${request.approvalMode}`,
        `- Prompt path: ${request.promptPath}`,
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
            message: `codex exec exited with code ${processResult.code}.`,
            warnings: [],
            exitCode: processResult.code,
            stdout: processResult.stdout,
            stderr: processResult.stderr,
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