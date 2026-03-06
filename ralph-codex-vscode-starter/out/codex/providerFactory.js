"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexStrategyRegistry = void 0;
const clipboardStrategy_1 = require("./clipboardStrategy");
const cliExecStrategy_1 = require("./cliExecStrategy");
const ideCommandStrategy_1 = require("./ideCommandStrategy");
class CodexStrategyRegistry {
    clipboardStrategy = new clipboardStrategy_1.ClipboardCodexStrategy();
    ideStrategy = new ideCommandStrategy_1.IdeCommandCodexStrategy();
    cliExecStrategy;
    constructor(logger) {
        this.cliExecStrategy = new cliExecStrategy_1.CliExecCodexStrategy(logger);
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