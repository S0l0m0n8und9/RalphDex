import Module from 'node:module';
import path from 'node:path';
import { IVSCodeHost } from './types';

type ShimUri = {
  scheme: 'file';
  fsPath: string;
};

type ShimWorkspaceFolder = {
  uri: ShimUri;
  name: string;
  index: number;
};

type VscodeShimModule = {
  Uri: {
    file(fsPath: string): ShimUri;
  };
  commands: {
    getCommands(filterInternal?: boolean): Promise<string[]>;
    executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T>;
  };
  workspace: {
    isTrusted: boolean;
    workspaceFolders: ShimWorkspaceFolder[];
    getConfiguration(section?: string, scope?: unknown): {
      get<T>(key: string, defaultValue?: T): T | undefined;
      inspect<T>(key: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined;
    };
  };
  window: {
    activeTextEditor: undefined;
  };
};

let installedShim: VscodeShimModule | null = null;

function createUri(fsPath: string): ShimUri {
  return {
    scheme: 'file',
    fsPath: path.resolve(fsPath)
  };
}

export function installVscodeShim(workspaceRoot: string, host: IVSCodeHost): void {
  if (installedShim) {
    return;
  }

  const workspaceFolder: ShimWorkspaceFolder = {
    uri: createUri(workspaceRoot),
    name: path.basename(workspaceRoot),
    index: 0
  };

  installedShim = {
    Uri: {
      file: createUri
    },
    commands: {
      async getCommands(_filterInternal?: boolean): Promise<string[]> {
        return [];
      },
      async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
        return host.commands.executeCommand<T>(command, ...args);
      }
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [workspaceFolder],
      getConfiguration(section?: string, _scope?: unknown): {
        get<T>(key: string, defaultValue?: T): T | undefined;
        inspect<T>(key: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined;
      } {
        if (section && section !== 'ralphCodex') {
          return {
            get<T>(_key: string, defaultValue?: T): T | undefined {
              return defaultValue;
            },
            inspect<T>(key: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined {
              return { key };
            }
          };
        }

        return {
          get<T>(key: string, defaultValue?: T): T | undefined {
            return host.configuration.get<T>(key, defaultValue as T);
          },
          inspect<T>(key: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined {
            return host.configuration.inspect<T>(key);
          }
        };
      }
    },
    window: {
      activeTextEditor: undefined
    }
  };

  const originalLoad = (Module as typeof Module & {
    _load(request: string, parent: NodeModule | null, isMain: boolean): unknown;
  })._load;

  (Module as typeof Module & {
    _load(request: string, parent: NodeModule | null, isMain: boolean): unknown;
  })._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === 'vscode') {
      return installedShim;
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}
