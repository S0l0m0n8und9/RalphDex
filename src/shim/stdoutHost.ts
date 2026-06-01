import { createShimWorkspaceConfiguration } from './shimConfig';
import { ICommandExecutor, IOutputChannel, IProgress, IWorkspaceConfiguration, IVSCodeHost } from './types';

/** Raw text sink for shim log output. Defaults to stdout; `--json` mode routes it to stderr. */
export type ShimLogSink = (text: string) => void;

const defaultLogSink: ShimLogSink = (text) => process.stdout.write(text);

class StdoutOutputChannel implements IOutputChannel {
  readonly name = 'Ralph Shim';

  constructor(private readonly write: ShimLogSink = defaultLogSink) {}

  append(value: string): void {
    this.write(value);
  }

  appendLine(value: string): void {
    this.write(`${value}\n`);
  }

  replace(value: string): void {
    this.write(`${value}\n`);
  }

  clear(): void {}

  hide(): void {}

  show(): void {}

  dispose(): void {}
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

  constructor(workspaceRoot: string, env: NodeJS.ProcessEnv = process.env, logSink: ShimLogSink = defaultLogSink) {
    this.outputChannel = new StdoutOutputChannel(logSink);
    this.progress = new NoOpProgress();
    this.configuration = createShimWorkspaceConfiguration(workspaceRoot, env);
    this.commands = new NoOpCommandExecutor();
  }
}

export function createStdoutHost(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  logSink: ShimLogSink = defaultLogSink
): IVSCodeHost {
  return new StdoutHost(workspaceRoot, env, logSink);
}
