import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphDiffSummary, RalphIterationResult, RalphVerificationResult } from './types';

export interface RalphIterationArtifactPaths {
  directory: string;
  promptPath: string;
  stdoutPath: string;
  stderrPath: string;
  executionSummaryPath: string;
  verifierSummaryPath: string;
  diffSummaryPath: string;
  iterationResultPath: string;
  gitStatusBeforePath: string;
  gitStatusAfterPath: string;
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function resolveIterationArtifactPaths(artifactRootDir: string, iteration: number): RalphIterationArtifactPaths {
  const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);

  return {
    directory,
    promptPath: path.join(directory, 'prompt.md'),
    stdoutPath: path.join(directory, 'stdout.log'),
    stderrPath: path.join(directory, 'stderr.log'),
    executionSummaryPath: path.join(directory, 'execution-summary.json'),
    verifierSummaryPath: path.join(directory, 'verifier-summary.json'),
    diffSummaryPath: path.join(directory, 'diff-summary.json'),
    iterationResultPath: path.join(directory, 'iteration-result.json'),
    gitStatusBeforePath: path.join(directory, 'git-status-before.txt'),
    gitStatusAfterPath: path.join(directory, 'git-status-after.txt')
  };
}

export async function ensureIterationArtifactDirectory(paths: RalphIterationArtifactPaths): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
}

export async function writeIterationArtifacts(input: {
  paths: RalphIterationArtifactPaths;
  prompt: string;
  stdout: string;
  stderr: string;
  executionSummary: unknown;
  verifierSummary: RalphVerificationResult[];
  diffSummary: RalphDiffSummary | null;
  result: RalphIterationResult;
  gitStatusBefore?: string;
  gitStatusAfter?: string;
}): Promise<void> {
  await ensureIterationArtifactDirectory(input.paths);

  await Promise.all([
    fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
    fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
    fs.writeFile(input.paths.executionSummaryPath, stringifyJson(input.executionSummary), 'utf8'),
    fs.writeFile(input.paths.verifierSummaryPath, stringifyJson(input.verifierSummary), 'utf8'),
    fs.writeFile(input.paths.iterationResultPath, stringifyJson(input.result), 'utf8'),
    input.diffSummary
      ? fs.writeFile(input.paths.diffSummaryPath, stringifyJson(input.diffSummary), 'utf8')
      : Promise.resolve(),
    input.gitStatusBefore !== undefined
      ? fs.writeFile(input.paths.gitStatusBeforePath, input.gitStatusBefore, 'utf8')
      : Promise.resolve(),
    input.gitStatusAfter !== undefined
      ? fs.writeFile(input.paths.gitStatusAfterPath, input.gitStatusAfter, 'utf8')
      : Promise.resolve()
  ]);
}
