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
exports.CopilotFoundryCliProvider = void 0;
const fs = __importStar(require("fs/promises"));
const processRunner_1 = require("../services/processRunner");
const text_1 = require("../util/text");
const azureAuthResolver_1 = require("./azureAuthResolver");
class CopilotFoundryCliProvider {
    options;
    id = 'copilot-foundry';
    constructor(options) {
        this.options = options;
    }
    buildLaunchSpec(request, _skipGitCheck) {
        return {
            args: this.buildArgs(request),
            cwd: request.executionRoot,
            stdinText: request.prompt,
            shell: process.platform === 'win32'
        };
    }
    async prepareLaunchSpec(request, _skipGitCheck) {
        const auth = await (0, azureAuthResolver_1.resolveAzureAuth)(this.options.auth);
        const baseUrl = this.resolveBaseUrl();
        const modelId = request.model.trim() || this.options.model.deployment.trim();
        const wireModel = this.options.model.deployment.trim() || modelId;
        if (!wireModel) {
            throw new Error('copilot-foundry requires a configured model deployment before launch.');
        }
        return {
            args: this.buildArgs(request),
            cwd: request.executionRoot,
            stdinText: request.prompt,
            shell: process.platform === 'win32',
            env: {
                COPILOT_PROVIDER_TYPE: 'azure',
                COPILOT_PROVIDER_BASE_URL: baseUrl,
                COPILOT_PROVIDER_WIRE_API: this.options.model.wireApi,
                COPILOT_PROVIDER_MODEL_ID: modelId || wireModel,
                COPILOT_PROVIDER_WIRE_MODEL: wireModel,
                ...(auth.copilotEnv ?? {})
            }
        };
    }
    async extractResponseText(stdout, _stderr, lastMessagePath) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            return '';
        }
        const lines = trimmed.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'assistant.message'
                    && typeof parsed.data?.content === 'string'
                    && parsed.data.content.trim()) {
                    await fs.writeFile(lastMessagePath, parsed.data.content, 'utf8').catch(() => { });
                    return parsed.data.content;
                }
                if (parsed.type === 'result' && typeof parsed.result === 'string') {
                    await fs.writeFile(lastMessagePath, parsed.result, 'utf8').catch(() => { });
                    return parsed.result;
                }
            }
            catch {
                break;
            }
        }
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
            return (0, text_1.truncateSummary)((0, text_1.firstNonEmptyLine)(input.lastMessage) ?? 'copilot-foundry completed successfully.');
        }
        const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
        return detail
            ? `copilot-foundry exited with code ${input.exitCode}: ${detail}`
            : `copilot-foundry exited with code ${input.exitCode}.`;
    }
    describeLaunchError(commandPath, error) {
        if (error.code === 'ENOENT') {
            return `GitHub Copilot CLI was not found at "${commandPath}". Install Copilot CLI or update ralphCodex.copilotFoundry.commandPath.`;
        }
        return `Failed to start Copilot Foundry CLI with "${commandPath}": ${error.message}`;
    }
    buildTranscript(result, request) {
        const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
        return [
            '# Copilot Foundry CLI Transcript',
            '',
            `- Command: ${request.commandPath} ${result.args.join(' ')}`,
            `- Workspace root: ${request.workspaceRoot}`,
            `- Execution root: ${request.executionRoot}`,
            `- Prompt path: ${request.promptPath}`,
            `- Prompt hash: ${request.promptHash}`,
            `- Prompt bytes: ${request.promptByteLength}`,
            `- Model: ${request.model || this.options.model.deployment}`,
            `- Azure resource: ${this.options.azure.resourceName || '(override only)'}`,
            `- Approval mode: ${this.options.approvalMode}`,
            `- Wire API: ${this.options.model.wireApi}`,
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
    async summarizeText(prompt, cwd) {
        const auth = await (0, azureAuthResolver_1.resolveAzureAuth)(this.options.auth);
        const baseUrl = this.resolveBaseUrl();
        const modelId = this.options.model.deployment.trim();
        const result = await (0, processRunner_1.runProcess)(this.options.commandPath, ['-s', '--no-ask-user', '--output-format=json'], {
            cwd,
            stdinText: prompt,
            shell: process.platform === 'win32',
            env: {
                COPILOT_PROVIDER_TYPE: 'azure',
                COPILOT_PROVIDER_BASE_URL: baseUrl,
                COPILOT_PROVIDER_WIRE_API: this.options.model.wireApi,
                ...(modelId ? {
                    COPILOT_PROVIDER_MODEL_ID: modelId,
                    COPILOT_PROVIDER_WIRE_MODEL: modelId
                } : {}),
                ...(auth.copilotEnv ?? {})
            }
        });
        if (result.code !== 0) {
            throw new Error(`copilot-foundry summarization exited with code ${result.code}`);
        }
        const lines = result.stdout.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'assistant.message' && typeof parsed.data?.content === 'string' && parsed.data.content.trim()) {
                    return parsed.data.content.trim();
                }
            }
            catch {
                break;
            }
        }
        const text = result.stdout.trim();
        if (!text) {
            throw new Error('copilot-foundry summarization returned empty output');
        }
        return text;
    }
    buildArgs(request) {
        const args = ['-s', '--no-ask-user', '--autopilot'];
        args.push('--max-autopilot-continues', String(this.options.maxAutopilotContinues));
        if (request.model.trim()) {
            args.push('--model', request.model);
        }
        args.push('--reasoning-effort', request.reasoningEffort);
        args.push('--output-format=json');
        if (this.options.approvalMode === 'allow-all') {
            args.push('--allow-all');
        }
        else if (this.options.approvalMode === 'allow-tools-only') {
            args.push('--allow-tool', 'shell');
        }
        return args;
    }
    resolveBaseUrl() {
        const override = this.options.azure.baseUrlOverride.trim();
        if (override) {
            return override;
        }
        const resourceName = this.options.azure.resourceName.trim();
        if (!resourceName) {
            throw new Error('copilot-foundry requires either azure.baseUrlOverride or azure.resourceName.');
        }
        return `https://${resourceName}.openai.azure.com`;
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
exports.CopilotFoundryCliProvider = CopilotFoundryCliProvider;
//# sourceMappingURL=copilotFoundryCliProvider.js.map