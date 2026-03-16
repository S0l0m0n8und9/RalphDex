"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexStrategyRegistry = void 0;
const claudeCliProvider_1 = require("./claudeCliProvider");
const claudeCodeStrategy_1 = require("./claudeCodeStrategy");
const cliExecStrategy_1 = require("./cliExecStrategy");
const clipboardStrategy_1 = require("./clipboardStrategy");
const codexCliProvider_1 = require("./codexCliProvider");
const ideCommandStrategy_1 = require("./ideCommandStrategy");
function createCliProvider(config) {
    if (config.cliProvider === 'claude') {
        return new claudeCliProvider_1.ClaudeCliProvider({
            maxTurns: config.claudeMaxTurns,
            permissionMode: config.claudePermissionMode
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
    claudeCodeStrategy;
    preferredExecutionAdapter = 'codex';
    constructor(logger, config) {
        this.logger = logger;
        const provider = config ? createCliProvider(config) : undefined;
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(logger, provider);
        this.claudeCodeStrategy = new claudeCodeStrategy_1.ClaudeCodeCliExecStrategy(logger);
        if (config) {
            this.preferredExecutionAdapter = config.preferredExecutionAdapter;
        }
    }
    configureCliProvider(config) {
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(this.logger, createCliProvider(config));
        this.claudeCodeStrategy = new claudeCodeStrategy_1.ClaudeCodeCliExecStrategy(this.logger);
        this.preferredExecutionAdapter = config.preferredExecutionAdapter;
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
        return this.preferredExecutionAdapter === 'claudeCode'
            ? this.claudeCodeStrategy
            : this.cliExecStrategy;
    }
}
exports.CodexStrategyRegistry = CodexStrategyRegistry;
//# sourceMappingURL=providerFactory.js.map