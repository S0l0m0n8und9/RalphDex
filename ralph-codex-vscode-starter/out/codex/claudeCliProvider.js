"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCliProvider = void 0;
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
class ClaudeCliProvider {
    options;
    id = 'claude';
    constructor(options) {
        this.options = options;
    }
    buildArgs(request, _skipGitCheck) {
        const args = [
            '-p', '-',
            '--model', request.model,
            '--output-format', 'json',
            '--max-turns', String(this.options.maxTurns),
            '--verbose',
            '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
            '--no-session-persistence'
        ];
        if (this.options.permissionMode === 'dangerously-skip-permissions') {
            args.push('--dangerously-skip-permissions');
        }
        return args;
    }
    async extractResponseText(stdout, _stderr, _lastMessagePath) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            return '';
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed.result === 'string') {
                return parsed.result;
            }
        }
        catch {
            // If Claude output is not valid JSON, fall back to raw stdout.
            // This can happen if --output-format json was not honoured or the
            // process was interrupted.
        }
        return trimmed;
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
            return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'claude completed successfully.');
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
                return truncateSummary(line.replace(/^error:\s*/i, ''));
            }
        }
        const lastMessageLine = firstNonEmptyLine(lastMessage);
        if (lastMessageLine) {
            return truncateSummary(lastMessageLine);
        }
        for (const line of [...stderrLines].reverse()) {
            if (!this.isIgnorableStderrLine(line)) {
                return truncateSummary(line);
            }
        }
        return null;
    }
}
exports.ClaudeCliProvider = ClaudeCliProvider;
//# sourceMappingURL=claudeCliProvider.js.map