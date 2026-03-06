import * as fs from 'fs/promises';
import * as path from 'path';

export interface CodexCliSupport {
  commandPath: string;
  check: 'pathLookupUnverified' | 'pathExists' | 'pathMissing';
}

function usesExplicitPath(commandPath: string): boolean {
  return path.isAbsolute(commandPath) || commandPath.includes(path.sep) || commandPath.includes('/');
}

export async function inspectCodexCliSupport(commandPath: string): Promise<CodexCliSupport> {
  if (!usesExplicitPath(commandPath)) {
    return {
      commandPath,
      check: 'pathLookupUnverified'
    };
  }

  try {
    await fs.access(commandPath);
    return {
      commandPath,
      check: 'pathExists'
    };
  } catch {
    return {
      commandPath,
      check: 'pathMissing'
    };
  }
}
