import { CliProviderId, RalphCodexConfig } from './types';

export function getCliCommandPath(
  config: Pick<RalphCodexConfig, 'cliProvider' | 'codexCommandPath' | 'claudeCommandPath' | 'copilotCommandPath' | 'azureFoundryCommandPath'>
): string {
  return getCliCommandPathForProvider(config.cliProvider, config);
}

export function getCliCommandPathForProvider(
  provider: CliProviderId,
  config: Pick<RalphCodexConfig, 'codexCommandPath' | 'claudeCommandPath' | 'copilotCommandPath' | 'azureFoundryCommandPath'>
): string {
  switch (provider) {
    case 'claude':
      return config.claudeCommandPath;
    case 'copilot':
      return config.copilotCommandPath;
    case 'azure-foundry':
      return config.azureFoundryCommandPath;
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
    case 'azure-foundry':
      return 'Azure AI Foundry';
    default:
      return 'Codex';
  }
}

export function getDefaultOpenSidebarCommandId(provider: CliProviderId): string {
  switch (provider) {
    case 'claude':
      return 'claude.openSidebar';
    case 'copilot':
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
      return 'github.copilot.cli.newSession';
    default:
      return 'chatgpt.newChat';
  }
}
