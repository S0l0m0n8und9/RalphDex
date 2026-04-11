import * as path from 'path';
import { RalphCodexConfig } from '../config/types';

export interface RalphPaths {
  rootPath: string;
  ralphDir: string;
  prdPath: string;
  progressPath: string;
  taskFilePath: string;
  claimFilePath: string;
  stateFilePath: string;
  handoffDir: string;
  promptDir: string;
  runDir: string;
  logDir: string;
  logFilePath: string;
  artifactDir: string;
  memorySummaryPath: string;
  deadLetterPath: string;
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
    claimFilePath: path.join(ralphDir, 'claims.json'),
    stateFilePath: path.join(ralphDir, 'state.json'),
    handoffDir: path.join(ralphDir, 'handoff'),
    promptDir: path.join(ralphDir, 'prompts'),
    runDir: path.join(ralphDir, 'runs'),
    logDir,
    logFilePath: path.join(logDir, 'extension.log'),
    artifactDir: resolveWorkspacePath(rootPath, config.artifactRetentionPath),
    memorySummaryPath: path.join(ralphDir, 'memory-summary.md'),
    deadLetterPath: path.join(ralphDir, 'dead-letter.json')
  };
}
