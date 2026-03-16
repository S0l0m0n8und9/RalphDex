import { CodexHandoffMode, RalphCodexConfig } from '../config/types';
import { Logger } from '../services/logger';
import { ClaudeCliProvider } from './claudeCliProvider';
import { ClaudeCodeCliExecStrategy } from './claudeCodeStrategy';
import { CliExecCodexStrategy } from './cliExecStrategy';
import { CliProvider } from './cliProvider';
import { ClipboardCodexStrategy } from './clipboardStrategy';
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
  private claudeCodeStrategy: ClaudeCodeCliExecStrategy;
  private preferredExecutionAdapter: 'codex' | 'claudeCode' = 'codex';

  public constructor(private readonly logger: Logger, config?: RalphCodexConfig) {
    const provider = config ? createCliProvider(config) : undefined;
    this.cliExecStrategy = new CliExecCodexStrategy(logger, provider);
    this.claudeCodeStrategy = new ClaudeCodeCliExecStrategy(logger);
    if (config) {
      this.preferredExecutionAdapter = config.preferredExecutionAdapter;
    }
  }

  public configureCliProvider(config: RalphCodexConfig): void {
    this.cliExecStrategy = new CliExecCodexStrategy(this.logger, createCliProvider(config));
    this.claudeCodeStrategy = new ClaudeCodeCliExecStrategy(this.logger);
    this.preferredExecutionAdapter = config.preferredExecutionAdapter;
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
    return this.preferredExecutionAdapter === 'claudeCode'
      ? this.claudeCodeStrategy
      : this.cliExecStrategy;
  }
}
