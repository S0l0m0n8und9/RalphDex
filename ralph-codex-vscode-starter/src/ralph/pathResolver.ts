import * as path from 'path';
import { RalphCodexConfig } from '../config/types';

export interface RalphPaths {
  rootPath: string;
  ralphDir: string;
  prdPath: string;
  progressPath: string;
  taskFilePath: string;
  stateFilePath: string;
  promptDir: string;
  runDir: string;
  logDir: string;
  logFilePath: string;
}

function resolveWorkspacePath(rootPath: string, configuredPath: string): string {
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(rootPath, configuredPath);
}

export function resolveRalphPaths(rootPath: string, config: RalphCodexConfig): RalphPaths {
  const ralphDir = path.join(rootPath, '.ralph');
  const logDir = path.join(ralphDir, 'logs');

  return {
    rootPath,
    ralphDir,
    prdPath: resolveWorkspacePath(rootPath, config.prdPath),
    progressPath: resolveWorkspacePath(rootPath, config.progressPath),
    taskFilePath: resolveWorkspacePath(rootPath, config.ralphTaskFilePath),
    stateFilePath: path.join(ralphDir, 'state.json'),
    promptDir: path.join(ralphDir, 'prompts'),
    runDir: path.join(ralphDir, 'runs'),
    logDir,
    logFilePath: path.join(logDir, 'extension.log')
  };
}
