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
exports.CopilotCliProvider = void 0;
const fs = __importStar(require("fs/promises"));
const text_1 = require("../util/text");
class CopilotCliProvider {
    options;
    id = 'copilot';
    constructor(options) {
        this.options = options;
    }
    buildLaunchSpec(request, _skipGitCheck) {
        const args = ['-s', '--no-ask-user'];
        if (request.model.trim()) {
            args.push('--model', request.model);
        }
        if (this.options.approvalMode === 'allow-all') {
            args.push('--allow-all');
        }
        else if (this.options.approvalMode === 'allow-tools-only') {
            args.push('--allow-tool', 'shell');
        }
        // The Copilot CLI supports two programmatic prompt-delivery modes:
        //   1. `copilot -p "inline prompt"` — limited by argv length
        //   2. `echo "prompt" | copilot`   — piped via stdin, no `-p` flag
        //
        // NOTE: "Piped input is ignored if you also provide a prompt with
        // the -p or --prompt option."  (GitHub docs)
        //
        // We always pipe via stdin because Ralph prompts are multi-line
        // markdown that can easily exceed argv limits on Windows (~32 KB).
        return {
            args,
            cwd: request.executionRoot,
            stdinText: request.prompt,
            shell: process.platform === 'win32'
        };
    }
    async extractResponseText(stdout, _stderr, lastMessagePath) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            return '';
        }
        // Attempt structured JSON extraction (NDJSON or single-object).
        // Some Copilot CLI builds emit result events similar to Claude.
        const lines = trimmed.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line)
                continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'result' && typeof parsed.result === 'string') {
                    await fs.writeFile(lastMessagePath, parsed.result, 'utf8').catch(() => { });
                    return parsed.result;
                }
            }
            catch {
                // Not JSON — fall through to raw text.
                break;
            }
        }
        // Fallback: return the stdout text as-is.
        await fs.writeFile(lastMessagePath, trimmed, 'utf8').catch(() => { });
        return trimmed;
    }
    isIgnorableStderrLine(line) {
        return /^\s*$/.test(line)
            || /^GitHub Copilot CLI\b/i.test(line)
            || /^Using model:/i.test(line)
            || /^Authenticated as/i.test(line)
            || /^Session ID:/i.test(line)
            || /^warning:/i.test(line);
    }
    summarizeResult(input) {
        if (input.exitCode === 0) {
            return (0, text_1.truncateSummary)((0, text_1.firstNonEmptyLine)(input.lastMessage) ?? 'copilot completed successfully.');
        }
        const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
        return detail
            ? `copilot exited with code ${input.exitCode}: ${detail}`
            : `copilot exited with code ${input.exitCode}.`;
    }
    describeLaunchError(commandPath, error) {
        if (error.code === 'ENOENT') {
            return `GitHub Copilot CLI was not found at "${commandPath}". Install Copilot CLI or update ralphCodex.copilotCommandPath.`;
        }
        return `Failed to start GitHub Copilot CLI with "${commandPath}": ${error.message}`;
    }
    buildTranscript(result, request) {
        const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
        return [
            '# GitHub Copilot CLI Transcript',
            '',
            `- Command: ${request.commandPath} ${result.args.join(' ')}`,
            `- Workspace root: ${request.workspaceRoot}`,
            `- Execution root: ${request.executionRoot}`,
            `- Prompt path: ${request.promptPath}`,
            `- Prompt hash: ${request.promptHash}`,
            `- Prompt bytes: ${request.promptByteLength}`,
            `- Model: ${request.model}`,
            `- Approval mode: ${this.options.approvalMode}`,
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
        const lastMessageLine = (0, text_1.firstNonEmptyLine)(lastMessage);
        if (lastMessageLine) {
            return (0, text_1.truncateSummary)(lastMessageLine);
        }
        for (const line of [...stderrLines].reverse()) {
            if (!this.isIgnorableStderrLine(line)) {
                return (0, text_1.truncateSummary)(line.replace(/^error:\s*/i, ''));
            }
        }
        return null;
    }
}
exports.CopilotCliProvider = CopilotCliProvider;
//# sourceMappingURL=copilotCliProvider.js.map