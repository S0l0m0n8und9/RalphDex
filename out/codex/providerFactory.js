"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexStrategyRegistry = void 0;
exports.createCliProvider = createCliProvider;
exports.createCliProviderForId = createCliProviderForId;
const azureFoundryProvider_1 = require("./azureFoundryProvider");
const claudeCliProvider_1 = require("./claudeCliProvider");
const cliExecStrategy_1 = require("./cliExecStrategy");
const clipboardStrategy_1 = require("./clipboardStrategy");
const copilotCliProvider_1 = require("./copilotCliProvider");
const codexCliProvider_1 = require("./codexCliProvider");
const ideCommandStrategy_1 = require("./ideCommandStrategy");
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
            maxTurns: config.claudeMaxTurns,
            permissionMode: config.claudePermissionMode
        });
    }
    if (providerId === 'copilot') {
        return new copilotCliProvider_1.CopilotCliProvider({
            approvalMode: config.copilotApprovalMode,
            maxAutopilotContinues: config.copilotMaxAutopilotContinues
        });
    }
    if (providerId === 'azure-foundry') {
        return new azureFoundryProvider_1.AzureFoundryProvider({
            endpointUrl: config.azureFoundryEndpointUrl,
            apiKey: config.azureFoundryApiKey,
            modelDeployment: config.azureFoundryModelDeployment,
            apiVersion: config.azureFoundryApiVersion
        });
    }
    return new codexCliProvider_1.CodexCliProvider({
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
            return this.clipboardStrategy;
        }
        return this.getById(mode);
    }
    getCliExecStrategy() {
        return this.cliExecStrategy;
    }
}
exports.CodexStrategyRegistry = CodexStrategyRegistry;
//# sourceMappingURL=providerFactory.js.map