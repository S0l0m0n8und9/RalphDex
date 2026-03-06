import { CodexHandoffMode } from '../config/types';
import { Logger } from '../services/logger';
import { ClipboardCodexStrategy } from './clipboardStrategy';
import { CliExecCodexStrategy } from './cliExecStrategy';
import { IdeCommandCodexStrategy } from './ideCommandStrategy';
import { CodexStrategy, CodexStrategyId } from './types';

export class CodexStrategyRegistry {
  private readonly clipboardStrategy = new ClipboardCodexStrategy();
  private readonly ideStrategy = new IdeCommandCodexStrategy();
  private readonly cliExecStrategy: CliExecCodexStrategy;

  public constructor(logger: Logger) {
    this.cliExecStrategy = new CliExecCodexStrategy(logger);
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
