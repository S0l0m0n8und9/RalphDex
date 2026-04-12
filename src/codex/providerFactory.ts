import { CliProviderId, CodexHandoffMode, RalphCodexConfig } from '../config/types';
import { Logger } from '../services/logger';
import { AzureFoundryProvider } from './azureFoundryProvider';
import { ClaudeCliProvider } from './claudeCliProvider';
import { CliExecCodexStrategy } from './cliExecStrategy';
import { CliProvider } from './cliProvider';
import { ClipboardCodexStrategy } from './clipboardStrategy';
import { CopilotCliProvider } from './copilotCliProvider';
import { CodexCliProvider } from './codexCliProvider';
import { IdeCommandCodexStrategy } from './ideCommandStrategy';
import { CodexStrategy, CodexStrategyId } from './types';

export function createCliProvider(config: RalphCodexConfig): CliProvider {
  return createCliProviderForId(config.cliProvider, config);
}

/**
 * Create a CliProvider for an explicit provider ID (may differ from config.cliProvider
 * when per-tier provider overrides are active).
 */
export function createCliProviderForId(providerId: CliProviderId, config: RalphCodexConfig): CliProvider {
  if (providerId === 'claude') {
    return new ClaudeCliProvider({
      maxTurns: config.claudeMaxTurns,
      permissionMode: config.claudePermissionMode
    });
  }

  if (providerId === 'copilot') {
    return new CopilotCliProvider({
      approvalMode: config.copilotApprovalMode,
      maxAutopilotContinues: config.copilotMaxAutopilotContinues
    });
  }

  if (providerId === 'azure-foundry') {
    return new AzureFoundryProvider({
      endpointUrl: config.azureFoundryEndpointUrl,
      apiKey: config.azureFoundryApiKey,
      modelDeployment: config.azureFoundryModelDeployment,
      apiVersion: config.azureFoundryApiVersion,
      promptCaching: config.promptCaching
    });
  }

  return new CodexCliProvider({
    reasoningEffort: config.reasoningEffort,
    sandboxMode: config.sandboxMode,
    approvalMode: config.approvalMode
  });
}

export class CodexStrategyRegistry {
  private readonly clipboardStrategy = new ClipboardCodexStrategy();
  private readonly ideStrategy = new IdeCommandCodexStrategy();
  private cliExecStrategy: CliExecCodexStrategy;
  private currentConfig: RalphCodexConfig | undefined;
  private readonly providerCache = new Map<CliProviderId, CliProvider>();

  public constructor(private readonly logger: Logger, config?: RalphCodexConfig) {
    this.currentConfig = config;
    const provider = config ? createCliProvider(config) : undefined;
    this.cliExecStrategy = new CliExecCodexStrategy(logger, provider);
  }

  public configureCliProvider(config: RalphCodexConfig): void {
    this.currentConfig = config;
    this.providerCache.clear();
    this.cliExecStrategy = new CliExecCodexStrategy(this.logger, createCliProvider(config));
  }

  /**
   * Return a CLI exec strategy wired to a specific provider ID (for per-tier
   * provider overrides).  Falls back to the default strategy when providerId
   * is undefined or matches the workspace default.
   */
  public getCliExecStrategyForProvider(providerId?: CliProviderId): CliExecCodexStrategy {
    if (!providerId || !this.currentConfig || providerId === this.currentConfig.cliProvider) {
      return this.cliExecStrategy as CliExecCodexStrategy;
    }

    let provider = this.providerCache.get(providerId);
    if (!provider) {
      provider = createCliProviderForId(providerId, this.currentConfig);
      this.providerCache.set(providerId, provider);
    }

    return new CliExecCodexStrategy(this.logger, provider);
  }

  public getById(id: CodexStrategyId): CodexStrategy {
    switch (id) {
      case 'clipboard':
        return this.clipboardStrategy;
      case 'cliExec':
        return this.cliExecStrategy;
      default:
        return this.ideStrategy;
    }
  }

  public getPromptHandoffStrategy(mode: CodexHandoffMode): CodexStrategy {
    if (mode === 'cliExec') {
      return this.clipboardStrategy;
    }

    return this.getById(mode);
  }

  public getCliExecStrategy(): CodexStrategy {
    return this.cliExecStrategy;
  }

  /** Return the active CliProvider for the current configuration. */
  public getActiveCliProvider(): CliProvider | undefined {
    if (!this.currentConfig) {
      return undefined;
    }
    return createCliProvider(this.currentConfig);
  }
}
