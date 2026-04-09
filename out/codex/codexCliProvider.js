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
exports.CodexCliProvider = void 0;
const fs = __importStar(require("fs/promises"));
const text_1 = require("../util/text");
class CodexCliProvider {
    options;
    id = 'codex';
    constructor(options) {
        this.options = options;
    }
    buildLaunchSpec(request, skipGitCheck) {
        const args = [
            'exec',
            '--model', request.model,
            '--config', `model_reasoning_effort="${request.reasoningEffort}"`,
            '--sandbox', request.sandboxMode,
            '--config', `approval_policy="${request.approvalMode}"`,
            '--cd', request.executionRoot,
            '--output-last-message', request.lastMessagePath
        ];
        if (skipGitCheck) {
            args.push('--skip-git-repo-check');
        }
        args.push('-');
        return {
            args,
            cwd: request.executionRoot,
            stdinText: request.prompt
        };
    }
    async extractResponseText(_stdout, _stderr, lastMessagePath) {
        return fs.readFile(lastMessagePath, 'utf8').catch(() => '');
    }
    isIgnorableStderrLine(line) {
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
    summarizeResult(input) {
        if (input.exitCode === 0) {
            return (0, text_1.truncateSummary)((0, text_1.firstNonEmptyLine)(input.lastMessage) ?? 'codex exec completed successfully.');
        }
        const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
        return detail
            ? `codex exec exited with code ${input.exitCode}: ${detail}`
            : `codex exec exited with code ${input.exitCode}.`;
    }
    describeLaunchError(commandPath, error) {
        if (error.code === 'ENOENT') {
            return `Codex CLI was not found at "${commandPath}". Install Codex CLI or update ralphCodex.codexCommandPath.`;
        }
        return `Failed to start codex exec with "${commandPath}": ${error.message}`;
    }
    buildTranscript(result, request) {
        const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
        return [
            '# Codex Exec Transcript',
            '',
            `- Command: ${request.commandPath} ${result.args.join(' ')}`,
            `- Workspace root: ${request.workspaceRoot}`,
            `- Execution root: ${request.executionRoot}`,
            `- Prompt path: ${request.promptPath}`,
            `- Prompt hash: ${request.promptHash}`,
            `- Prompt bytes: ${request.promptByteLength}`,
            `- Reasoning effort: ${request.reasoningEffort}`,
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
    extractFailureDetail(stderr, lastMessage) {
        const stderrLines = stderr
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        for (const line of [...stderrLines].reverse()) {
            if (/^ERROR:/i.test(line)
                && !/failed to shutdown rollout recorder/i.test(line)
                && !/no last agent message/i.test(line)) {
                return (0, text_1.truncateSummary)(line.replace(/^ERROR:\s*/i, ''));
            }
        }
        const lastMessageLine = (0, text_1.firstNonEmptyLine)(lastMessage);
        if (lastMessageLine) {
            return (0, text_1.truncateSummary)(lastMessageLine);
        }
        for (const line of [...stderrLines].reverse()) {
            if (!this.isIgnorableStderrLine(line)) {
                return (0, text_1.truncateSummary)(line.replace(/^ERROR:\s*/i, ''));
            }
        }
        return null;
    }
}
exports.CodexCliProvider = CodexCliProvider;
//# sourceMappingURL=codexCliProvider.js.map