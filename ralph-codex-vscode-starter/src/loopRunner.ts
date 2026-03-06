import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { ExtensionConfig } from './config';
import { buildIterationPrompt } from './promptFactory';
import { scanWorkspace } from './repoScanner';
import { ExecResult, LoopOptions } from './types';

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function readIfExists(target: string): Promise<string> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return '';
  }
}

function runProcess(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function runSingleExec(config: ExtensionConfig, objective: string, iteration: number): Promise<ExecResult> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Open a workspace folder first.');

  const root = folder.uri.fsPath;
  const outDir = path.join(root, config.promptOutputFolder);
  await ensureDir(outDir);

  const summary = await scanWorkspace();
  const progressPath = path.join(root, '.ralph', 'progress.md');
  const tasksPath = path.join(root, '.ralph', 'tasks.json');
  const progressText = await readIfExists(progressPath);
  const tasksText = await readIfExists(tasksPath);

  const prompt = buildIterationPrompt({
    summary,
    objective,
    iteration,
    progressText,
    tasksText
  });

  const promptPath = path.join(outDir, `iteration-${String(iteration).padStart(3, '0')}.prompt.md`);
  const transcriptPath = path.join(outDir, `iteration-${String(iteration).padStart(3, '0')}.transcript.txt`);
  await fs.writeFile(promptPath, prompt, 'utf8');

  const args = [
    'exec',
    '--model', config.model,
    '--sandbox', config.sandboxMode,
    '--ask-for-approval', config.approvalMode,
    '--cd', root,
    prompt
  ];

  const result = await runProcess(config.codexExecutable, args, root);
  const transcript = [`# Prompt`, '', prompt, '', '# Stdout', '', result.stdout, '', '# Stderr', '', result.stderr].join('\n');
  await fs.writeFile(transcriptPath, transcript, 'utf8');

  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    promptPath,
    transcriptPath
  };
}

export async function runLoop(config: ExtensionConfig, options: LoopOptions, output: vscode.OutputChannel): Promise<void> {
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    output.appendLine(`\n=== Ralph iteration ${iteration}/${options.maxIterations} ===`);
    const result = await runSingleExec({
      ...config,
      model: options.model,
      sandboxMode: options.sandboxMode,
      approvalMode: options.approvalMode
    }, options.objective, iteration);

    output.appendLine(`Exit code: ${result.code}`);
    output.appendLine(`Prompt: ${result.promptPath}`);
    if (result.transcriptPath) output.appendLine(`Transcript: ${result.transcriptPath}`);

    if (result.stdout.trim()) {
      output.appendLine('--- stdout ---');
      output.appendLine(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      output.appendLine('--- stderr ---');
      output.appendLine(result.stderr.trim());
    }

    if (result.code !== 0) {
      throw new Error(`Codex exec failed on iteration ${iteration}. Inspect the output channel and transcript.`);
    }
  }
}
