"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexStrategyRegistry = void 0;
exports.createCliProvider = createCliProvider;
const claudeCliProvider_1 = require("./claudeCliProvider");
const cliExecStrategy_1 = require("./cliExecStrategy");
const clipboardStrategy_1 = require("./clipboardStrategy");
const copilotCliProvider_1 = require("./copilotCliProvider");
const codexCliProvider_1 = require("./codexCliProvider");
const ideCommandStrategy_1 = require("./ideCommandStrategy");
function createCliProvider(config) {
    if (config.cliProvider === 'claude') {
        return new claudeCliProvider_1.ClaudeCliProvider({
            maxTurns: config.claudeMaxTurns,
            permissionMode: config.claudePermissionMode
        });
    }
    if (config.cliProvider === 'copilot') {
        return new copilotCliProvider_1.CopilotCliProvider({
            approvalMode: config.copilotApprovalMode
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
    constructor(logger, config) {
        this.logger = logger;
        const provider = config ? createCliProvider(config) : undefined;
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(logger, provider);
    }
    configureCliProvider(config) {
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(this.logger, createCliProvider(config));
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