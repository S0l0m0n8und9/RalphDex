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
exports.AzureFoundryProvider = void 0;
const fs = __importStar(require("fs/promises"));
const integrity_1 = require("../ralph/integrity");
const httpsClient_1 = require("../services/httpsClient");
const promptBuilder_1 = require("../prompt/promptBuilder");
const text_1 = require("../util/text");
class AzureFoundryProvider {
    options;
    id = 'azure-foundry';
    constructor(options) {
        this.options = options;
    }
    buildLaunchSpec(request, _skipGitCheck) {
        const args = [
            '--endpoint', this.options.endpointUrl,
            '--model', request.model,
            '--output-format', 'json'
        ];
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
        try {
            const parsed = JSON.parse(trimmed);
            const content = parsed.choices?.[0]?.message?.content;
            if (typeof content === 'string' && content.trim()) {
                await fs.writeFile(lastMessagePath, content, 'utf8').catch(() => { });
                return content;
            }
        }
        catch {
            // fall through to raw text
        }
        await fs.writeFile(lastMessagePath, trimmed, 'utf8').catch(() => { });
        return trimmed;
    }
    isIgnorableStderrLine(line) {
        return /^\s*$/.test(line)
            || /^Azure AI Foundry\b/i.test(line)
            || /^Connecting to/i.test(line)
            || /^Endpoint:/i.test(line)
            || /^warning:/i.test(line);
    }
    summarizeResult(input) {
        if (input.exitCode === 0) {
            return (0, text_1.truncateSummary)((0, text_1.firstNonEmptyLine)(input.lastMessage) ?? 'azure-foundry completed successfully.');
        }
        const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
        return detail
            ? `azure-foundry exited with code ${input.exitCode}: ${detail}`
            : `azure-foundry exited with code ${input.exitCode}.`;
    }
    describeLaunchError(commandPath, error) {
        if (error.code === 'ENOENT') {
            return `Azure AI Foundry CLI was not found at "${commandPath}". Install the Azure AI Foundry CLI or update ralphCodex.azureFoundryCommandPath.`;
        }
        if (error.code === 'HTTP_ERROR' || /\b(4\d\d|5\d\d)\b/.test(error.message)) {
            return `Azure AI Foundry endpoint returned an error: ${error.message}`;
        }
        return `Failed to start Azure AI Foundry CLI with "${commandPath}": ${error.message}`;
    }
    async executeDirectly(request) {
        const stdinHash = (0, integrity_1.hashText)(request.prompt);
        // Collect warnings before making the request so they appear on all return paths.
        const warnings = [];
        if (!this.options.apiKey) {
            warnings.push('No API key configured for Azure AI Foundry (ralphCodex.azureFoundryApiKey is empty). ' +
                'Azure AD authentication would be attempted (not yet implemented). ' +
                'Requests will proceed without an api-key header.');
        }
        // Split the prompt at STATIC_PREFIX_BOUNDARY so the stable prefix can be
        // sent with a cache_control marker, enabling prompt caching on Anthropic-
        // compatible Azure deployments. When promptCaching is 'off', the marker is
        // omitted and the full prompt is sent as a single text block.
        const staticPrefix = (0, promptBuilder_1.extractStaticPrefix)(request.prompt);
        const staticPrefixBytes = Buffer.byteLength(staticPrefix, 'utf8');
        const dynamicRemainder = request.prompt.slice(staticPrefix.length);
        const cachingDisabled = this.options.promptCaching === 'off';
        const messageContent = cachingDisabled
            ? [{ type: 'text', text: request.prompt }]
            : dynamicRemainder
                ? [
                    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: dynamicRemainder }
                ]
                : [{ type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } }];
        const requestBody = JSON.stringify({
            messages: [{ role: 'user', content: messageContent }],
            model: this.options.modelDeployment || request.model
        });
        let endpointUrl = this.options.endpointUrl;
        if (this.options.apiVersion) {
            const separator = endpointUrl.includes('?') ? '&' : '?';
            endpointUrl += `${separator}api-version=${encodeURIComponent(this.options.apiVersion)}`;
        }
        // Auth headers are intentionally excluded from transcripts and provenance artifacts.
        const headers = {};
        if (this.options.apiKey) {
            headers['api-key'] = this.options.apiKey;
        }
        let responseBody;
        let statusCode;
        try {
            ({ responseBody, statusCode } = await (0, httpsClient_1.httpsPost)({
                url: endpointUrl,
                body: requestBody,
                headers,
                timeoutMs: request.timeoutMs
            }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                strategy: 'cliExec',
                success: false,
                message: `Azure AI Foundry HTTPS request failed: ${message}`,
                warnings,
                exitCode: 1,
                stdout: '',
                stderr: message,
                args: [],
                stdinHash,
                transcriptPath: request.transcriptPath,
                lastMessagePath: request.lastMessagePath,
                lastMessage: ''
            };
        }
        const success = statusCode >= 200 && statusCode < 300;
        if (!success) {
            const errorDetail = this.extractHttpErrorDetail(responseBody, statusCode);
            await fs.writeFile(request.lastMessagePath, '', 'utf8').catch(() => { });
            return {
                strategy: 'cliExec',
                success: false,
                message: errorDetail,
                warnings,
                exitCode: 1,
                stdout: responseBody,
                stderr: errorDetail,
                args: [],
                stdinHash,
                transcriptPath: request.transcriptPath,
                lastMessagePath: request.lastMessagePath,
                lastMessage: ''
            };
        }
        const lastMessage = await this.extractResponseText(responseBody, '', request.lastMessagePath);
        // Parse cache usage from the response to populate promptCacheStats.
        const promptCacheStats = {
            staticPrefixBytes,
            cacheHit: this.extractCacheHit(responseBody)
        };
        return {
            strategy: 'cliExec',
            success: true,
            message: this.summarizeResult({ exitCode: 0, stderr: '', lastMessage }),
            warnings,
            exitCode: 0,
            stdout: responseBody,
            stderr: '',
            args: [],
            stdinHash,
            transcriptPath: request.transcriptPath,
            lastMessagePath: request.lastMessagePath,
            lastMessage,
            promptCacheStats
        };
    }
    buildTranscript(result, request) {
        const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
        const commandLine = result.args.length === 0
            ? `Direct HTTPS POST to ${this.options.endpointUrl}`
            : `${request.commandPath} ${result.args.join(' ')}`;
        return [
            '# Azure AI Foundry Transcript',
            '',
            `- Command: ${commandLine}`,
            `- Workspace root: ${request.workspaceRoot}`,
            `- Execution root: ${request.executionRoot}`,
            `- Prompt path: ${request.promptPath}`,
            `- Prompt hash: ${request.promptHash}`,
            `- Prompt bytes: ${request.promptByteLength}`,
            `- Model: ${request.model}`,
            `- Endpoint: ${this.options.endpointUrl}`,
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
    extractCacheHit(responseBody) {
        try {
            const parsed = JSON.parse(responseBody);
            const { cache_read_input_tokens, cache_creation_input_tokens } = parsed.usage ?? {};
            if (cache_read_input_tokens !== undefined || cache_creation_input_tokens !== undefined) {
                return (cache_read_input_tokens ?? 0) > 0;
            }
        }
        catch {
            // Not valid JSON or no usage field — cache status unknown.
        }
        return null;
    }
    extractHttpErrorDetail(responseBody, statusCode) {
        try {
            const parsed = JSON.parse(responseBody);
            if (parsed.error?.message) {
                return `Azure AI Foundry request failed with HTTP ${statusCode}: ${parsed.error.message}`;
            }
        }
        catch {
            // fall through
        }
        return `Azure AI Foundry request failed with HTTP ${statusCode}`;
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
exports.AzureFoundryProvider = AzureFoundryProvider;
//# sourceMappingURL=azureFoundryProvider.js.map