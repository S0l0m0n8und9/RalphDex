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
exports.ClaudeCliProvider = void 0;
const fs = __importStar(require("fs/promises"));
const text_1 = require("../util/text");
class ClaudeCliProvider {
    options;
    id = 'claude';
    constructor(options) {
        this.options = options;
    }
    buildLaunchSpec(request, _skipGitCheck) {
        const args = [
            '-p', '-',
            '--model', request.model,
            '--output-format', 'stream-json',
            '--max-turns', String(this.options.maxTurns),
            '--verbose',
            '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
            '--no-session-persistence'
        ];
        if (this.options.permissionMode === 'dangerously-skip-permissions') {
            args.push('--dangerously-skip-permissions');
        }
        return {
            args,
            cwd: request.executionRoot,
            stdinText: request.prompt
        };
    }
    async extractResponseText(stdout, _stderr, lastMessagePath) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            return '';
        }
        // With --output-format stream-json, stdout is NDJSON. Collect all result
        // events and return the one with the most turns — that is always the main
        // interaction. When Claude uses background Task invocations a follow-up
        // result event (num_turns: 1) is emitted after the background task
        // completes; reverse-scanning would pick that brief follow-up instead of
        // the main response that contains the completion report.
        const lines = trimmed.split('\n');
        let bestResult = null;
        let bestTurns = -1;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                continue;
            }
            try {
                const parsed = JSON.parse(trimmedLine);
                if (parsed.type === 'result' && typeof parsed.result === 'string') {
                    const turns = typeof parsed.num_turns === 'number' ? parsed.num_turns : 0;
                    if (turns > bestTurns) {
                        bestTurns = turns;
                        bestResult = parsed.result;
                    }
                }
            }
            catch {
                // skip unparseable lines
            }
        }
        if (bestResult !== null) {
            await fs.writeFile(lastMessagePath, bestResult, 'utf8').catch(() => { });
            return bestResult;
        }
        // Fallback: try parsing the whole stdout as a single JSON object in case
        // --output-format json was used or the process wrote a single blob.
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed.result === 'string') {
                return parsed.result;
            }
        }
        catch {
            // fall through to raw stdout
        }
        return trimmed;
    }
    extractExecutionCostUsd(stdout) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            return null;
        }
        for (const line of trimmed.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                continue;
            }
            try {
                const parsed = JSON.parse(trimmedLine);
                if (parsed.type === 'result' && typeof parsed.cost_usd === 'number') {
                    return parsed.cost_usd;
                }
            }
            catch {
                // skip unparseable lines
            }
        }
        return null;
    }
    isIgnorableStderrLine(line) {
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
    summarizeResult(input) {
        if (input.exitCode === 0) {
            return (0, text_1.truncateSummary)((0, text_1.firstNonEmptyLine)(input.lastMessage) ?? 'claude completed successfully.');
        }
        const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
        return detail
            ? `claude exited with code ${input.exitCode}: ${detail}`
            : `claude exited with code ${input.exitCode}.`;
    }
    describeLaunchError(commandPath, error) {
        if (error.code === 'ENOENT') {
            return `Claude CLI was not found at "${commandPath}". Install Claude CLI or update ralphCodex.claudeCommandPath.`;
        }
        return `Failed to start claude with "${commandPath}": ${error.message}`;
    }
    buildTranscript(result, request) {
        const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
        return [
            '# Claude CLI Transcript',
            '',
            `- Command: ${request.commandPath} ${result.args.join(' ')}`,
            `- Workspace root: ${request.workspaceRoot}`,
            `- Execution root: ${request.executionRoot}`,
            `- Prompt path: ${request.promptPath}`,
            `- Prompt hash: ${request.promptHash}`,
            `- Prompt bytes: ${request.promptByteLength}`,
            `- Model: ${request.model}`,
            `- Max turns: ${this.options.maxTurns}`,
            `- Permission mode: ${this.options.permissionMode}`,
            `- Stdin hash: ${result.stdinHash}`,
            `- Payload matched prompt artifact: ${payloadMatched}`,
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
    extractFailureDetail(stderr, lastMessage) {
        const stderrLines = stderr
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        for (const line of [...stderrLines].reverse()) {
            if (/^error:/i.test(line)) {
                return (0, text_1.truncateSummary)(line.replace(/^error:\s*/i, ''));
            }
        }
        const lastMessageLine = (0, text_1.firstNonEmptyLine)(lastMessage);
        if (lastMessageLine) {
            return (0, text_1.truncateSummary)(lastMessageLine);
        }
        for (const line of [...stderrLines].reverse()) {
            if (!this.isIgnorableStderrLine(line)) {
                return (0, text_1.truncateSummary)(line);
            }
        }
        return null;
    }
}
exports.ClaudeCliProvider = ClaudeCliProvider;
//# sourceMappingURL=claudeCliProvider.js.map