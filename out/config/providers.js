"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCliCommandPath = getCliCommandPath;
exports.getCliCommandPathForProvider = getCliCommandPathForProvider;
exports.getCliProviderLabel = getCliProviderLabel;
exports.getDefaultOpenSidebarCommandId = getDefaultOpenSidebarCommandId;
exports.getDefaultNewChatCommandId = getDefaultNewChatCommandId;
function getCliCommandPath(config) {
    return getCliCommandPathForProvider(config.cliProvider, config);
}
function getCliCommandPathForProvider(provider, config) {
    switch (provider) {
        case 'claude':
            return config.claudeCommandPath;
        case 'copilot':
            return config.copilotCommandPath;
        case 'copilot-byok':
        case 'copilot-foundry':
            return config.copilotFoundry.commandPath;
        case 'azure-foundry':
            return config.azureFoundry.commandPath;
        case 'gemini':
            return config.geminiCommandPath;
        default:
            return config.codexCommandPath;
    }
}
function getCliProviderLabel(provider) {
    switch (provider) {
        case 'claude':
            return 'Claude';
        case 'copilot':
            return 'GitHub Copilot';
        case 'copilot-byok':
            return 'Copilot BYOK';
        case 'copilot-foundry':
            return 'Copilot Foundry';
        case 'azure-foundry':
            return 'Azure AI Foundry';
        case 'gemini':
            return 'Google Gemini';
        default:
            return 'Codex';
    }
}
function getDefaultOpenSidebarCommandId(provider) {
    switch (provider) {
        case 'claude':
            return 'claude.openSidebar';
        case 'copilot':
        case 'copilot-byok':
        case 'copilot-foundry':
            return 'none';
        case 'gemini':
            return 'none';
        default:
            return 'chatgpt.openSidebar';
    }
}
function getDefaultNewChatCommandId(provider) {
    switch (provider) {
        case 'claude':
            return 'claude.newChat';
        case 'copilot':
        case 'copilot-byok':
        case 'copilot-foundry':
            return 'github.copilot.cli.newSession';
        case 'gemini':
            return 'none';
        default:
            return 'chatgpt.newChat';
    }
}
//# sourceMappingURL=providers.js.map