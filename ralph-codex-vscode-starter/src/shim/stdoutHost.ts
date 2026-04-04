import { createShimWorkspaceConfiguration } from './shimConfig';
import { ICommandExecutor, IOutputChannel, IProgress, IWorkspaceConfiguration, IVSCodeHost } from './types';

class StdoutOutputChannel implements IOutputChannel {
  appendLine(value: string): void {
    console.log(value);
  }
}

class NoOpProgress implements IProgress {
  report(): void {}
}

class NoOpCommandExecutor implements ICommandExecutor {
  executeCommand<T = unknown>(): Thenable<T> {
    return Promise.resolve(undefined as T);
  }
}

export class StdoutHost implements IVSCodeHost {
  readonly outputChannel: IOutputChannel;
  readonly progress: IProgress;
  readonly configuration: IWorkspaceConfiguration;
  readonly commands: ICommandExecutor;

  constructor(workspaceRoot: string, env: NodeJS.ProcessEnv = process.env) {
    this.outputChannel = new StdoutOutputChannel();
    this.progress = new NoOpProgress();
    this.configuration = createShimWorkspaceConfiguration(workspaceRoot, env);
    this.commands = new NoOpCommandExecutor();
  }
}

export function createStdoutHost(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env
): IVSCodeHost {
  return new StdoutHost(workspaceRoot, env);
}
