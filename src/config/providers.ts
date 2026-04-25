import { CliProviderId, RalphCodexConfig } from './types';

export function getCliCommandPath(
  config: Pick<RalphCodexConfig, 'cliProvider' | 'codexCommandPath' | 'claudeCommandPath' | 'copilotCommandPath' | 'geminiCommandPath' | 'copilotFoundry' | 'azureFoundry'>
): string {
  return getCliCommandPathForProvider(config.cliProvider, config);
}

export function getCliCommandPathForProvider(
  provider: CliProviderId,
  config: Pick<RalphCodexConfig, 'codexCommandPath' | 'claudeCommandPath' | 'copilotCommandPath' | 'geminiCommandPath' | 'copilotFoundry' | 'azureFoundry'>
): string {
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

export function getCliProviderLabel(provider: CliProviderId): string {
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

export function getDefaultOpenSidebarCommandId(provider: CliProviderId): string {
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

export function getDefaultNewChatCommandId(provider: CliProviderId): string {
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
