"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexStrategyRegistry = void 0;
exports.createCliProvider = createCliProvider;
exports.createCliProviderForId = createCliProviderForId;
const azureFoundryProvider_1 = require("./azureFoundryProvider");
const claudeCliProvider_1 = require("./claudeCliProvider");
const geminiCliProvider_1 = require("./geminiCliProvider");
const cliExecStrategy_1 = require("./cliExecStrategy");
const clipboardStrategy_1 = require("./clipboardStrategy");
const copilotCliProvider_1 = require("./copilotCliProvider");
const copilotByokCliProvider_1 = require("./copilotByokCliProvider");
const codexCliProvider_1 = require("./codexCliProvider");
const ideCommandStrategy_1 = require("./ideCommandStrategy");
const GEMINI_DEFAULT_MAX_TURNS = 125;
function createCliProvider(config) {
    return createCliProviderForId(config.cliProvider, config);
}
/**
 * Create a CliProvider for an explicit provider ID (may differ from config.cliProvider
 * when per-tier provider overrides are active).
 */
function createCliProviderForId(providerId, config) {
    if (providerId === 'claude') {
        return new claudeCliProvider_1.ClaudeCliProvider({
            commandPath: config.claudeCommandPath,
            maxTurns: config.claudeMaxTurns,
            permissionMode: config.claudePermissionMode
        });
    }
    if (providerId === 'gemini') {
        return new geminiCliProvider_1.GeminiCliProvider({
            commandPath: config.geminiCommandPath,
            maxTurns: GEMINI_DEFAULT_MAX_TURNS,
            permissionMode: 'yolo'
        });
    }
    if (providerId === 'copilot') {
        return new copilotCliProvider_1.CopilotCliProvider({
            commandPath: config.copilotCommandPath,
            approvalMode: config.copilotApprovalMode,
            maxAutopilotContinues: config.copilotMaxAutopilotContinues
        });
    }
    if (providerId === 'copilot-byok') {
        return new copilotByokCliProvider_1.CopilotByokCliProvider(config.copilotFoundry, 'byok');
    }
    if (providerId === 'copilot-foundry') {
        return new copilotByokCliProvider_1.CopilotByokCliProvider(config.copilotFoundry, 'foundry-preset');
    }
    if (providerId === 'azure-foundry') {
        return new azureFoundryProvider_1.AzureFoundryProvider({
            endpointUrl: config.azureFoundry.endpointUrl,
            auth: config.azureFoundry.auth,
            modelDeployment: config.azureFoundry.modelDeployment,
            apiVersion: config.azureFoundry.apiVersion,
            promptCaching: config.promptCaching
        });
    }
    return new codexCliProvider_1.CodexCliProvider({
        commandPath: config.codexCommandPath,
        reasoningEffort: config.reasoningEffort,
        sandboxMode: config.sandboxMode,
        approvalMode: config.approvalMode
    });
}
class CodexStrategyRegistry {
    logger;
    clipboardStrategy = new clipboardStrategy_1.ClipboardCodexStrategy();
    ideStrategy = new ideCommandStrategy_1.IdeCommandCodexStrategy();
    cliExecStrategy;
    currentConfig;
    providerCache = new Map();
    constructor(logger, config) {
        this.logger = logger;
        this.currentConfig = config;
        const provider = config ? createCliProvider(config) : undefined;
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(logger, provider);
    }
    configureCliProvider(config) {
        this.currentConfig = config;
        this.providerCache.clear();
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(this.logger, createCliProvider(config));
    }
    /**
     * Return a CLI exec strategy wired to a specific provider ID (for per-tier
     * provider overrides).  Falls back to the default strategy when providerId
     * is undefined or matches the workspace default.
     */
    getCliExecStrategyForProvider(providerId) {
        if (!providerId || !this.currentConfig || providerId === this.currentConfig.cliProvider) {
            return this.cliExecStrategy;
        }
        let provider = this.providerCache.get(providerId);
        if (!provider) {
            provider = createCliProviderForId(providerId, this.currentConfig);
            this.providerCache.set(providerId, provider);
        }
        return new cliExecStrategy_1.CliExecCodexStrategy(this.logger, provider);
    }
    getById(id) {
        switch (id) {
            case 'clipboard':
                return this.clipboardStrategy;
            case 'cliExec':
                return this.cliExecStrategy;
            default:
                return this.ideStrategy;
        }
    }
    getPromptHandoffStrategy(mode) {
        if (mode === 'cliExec') {
            // Deliberate compatibility fallback: "Open Codex IDE" is an IDE handoff
            // command, so we keep it on clipboard transport even when the workspace
            // default execution mode is cliExec. The CLI path is exposed through the
            // explicit iteration/loop commands.
            return this.clipboardStrategy;
        }
        return this.getById(mode);
    }
    getCliExecStrategy() {
        return this.cliExecStrategy;
    }
    /** Return the active CliProvider for the current configuration. */
    getActiveCliProvider() {
        if (!this.currentConfig) {
            return undefined;
        }
        return createCliProvider(this.currentConfig);
    }
}
exports.CodexStrategyRegistry = CodexStrategyRegistry;
//# sourceMappingURL=providerFactory.js.map