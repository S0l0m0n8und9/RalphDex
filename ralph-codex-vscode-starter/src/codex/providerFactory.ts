import { CodexHandoffMode, RalphCodexConfig } from '../config/types';
import { Logger } from '../services/logger';
import { ClaudeCliProvider } from './claudeCliProvider';
import { CliExecCodexStrategy } from './cliExecStrategy';
import { CliProvider } from './cliProvider';
import { ClipboardCodexStrategy } from './clipboardStrategy';
import { CopilotCliProvider } from './copilotCliProvider';
import { CodexCliProvider } from './codexCliProvider';
import { IdeCommandCodexStrategy } from './ideCommandStrategy';
import { CodexStrategy, CodexStrategyId } from './types';

function createCliProvider(config: RalphCodexConfig): CliProvider {
  if (config.cliProvider === 'claude') {
    return new ClaudeCliProvider({
      maxTurns: config.claudeMaxTurns,
      permissionMode: config.claudePermissionMode
    });
  }

  if (config.cliProvider === 'copilot') {
    return new CopilotCliProvider({
      approvalMode: config.copilotApprovalMode
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

  public constructor(private readonly logger: Logger, config?: RalphCodexConfig) {
    const provider = config ? createCliProvider(config) : undefined;
    this.cliExecStrategy = new CliExecCodexStrategy(logger, provider);
  }

  public configureCliProvider(config: RalphCodexConfig): void {
    this.cliExecStrategy = new CliExecCodexStrategy(this.logger, createCliProvider(config));
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
}
