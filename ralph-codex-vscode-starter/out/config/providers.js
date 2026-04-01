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
        default:
            return 'Codex';
    }
}
function getDefaultOpenSidebarCommandId(provider) {
    switch (provider) {
        case 'claude':
            return 'claude.openSidebar';
        case 'copilot':
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
            return 'github.copilot.cli.newSession';
        default:
            return 'chatgpt.newChat';
    }
}
//# sourceMappingURL=providers.js.map