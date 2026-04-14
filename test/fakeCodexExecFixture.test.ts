import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  PIPELINE_SMOKE_PR_URL,
  writePipelineSmokeFakeCodexExecScript
} from './support/fakeCodexExecFixture';

async function seedWorkspaceRoot(): Promise<string> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-fake-codex-'));
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.mkdir(path.join(rootPath, '.ralph'), { recursive: true });
  await fs.writeFile(path.join(rootPath, 'src', 'fixture.ts'), 'export const fixture = true;\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n', 'utf8');
  return rootPath;
}

function buildPrompt(selectedTaskId: string, intro: string): string {
  return [
    '# Ralph Prompt: iteration (cliExec)',
    '',
    intro,
    '',
    '## Task Focus',
    `- Selected task id: ${selectedTaskId}`,
    '- Title: Smoke fixture task'
  ].join('\n');
}

async function runFakeCodex(rootPath: string, prompt: string, lastMessagePath: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['exec', '--output-last-message', lastMessagePath, '-'], {
      cwd: rootPath
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

test('writePipelineSmokeFakeCodexExecScript drives build, review, and scm prompts through a fake codex executable', async (t) => {
  const rootPath = await seedWorkspaceRoot();
  t.after(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  await writePipelineSmokeFakeCodexExecScript(rootPath);

  const buildLastMessagePath = path.join(rootPath, '.ralph', 'build-last-message.txt');
  const buildResult = await runFakeCodex(
    rootPath,
    buildPrompt('Tpipe-001.01', 'Implement the selected task.'),
    buildLastMessagePath
  );

  assert.equal(buildResult.code, 0);
  assert.match(await fs.readFile(path.join(rootPath, 'src', 'fixture.ts'), 'utf8'), /pipelineSmoke = true/);
  assert.match(await fs.readFile(buildLastMessagePath, 'utf8'), /"selectedTaskId": "Tpipe-001\.01"/);

  const reviewLastMessagePath = path.join(rootPath, '.ralph', 'review-last-message.txt');
  const reviewResult = await runFakeCodex(
    rootPath,
    buildPrompt('Tpipe-001.01', "You are Ralph's review agent."),
    reviewLastMessagePath
  );

  assert.equal(reviewResult.code, 0);
  assert.match(await fs.readFile(reviewLastMessagePath, 'utf8'), /"requestedStatus": "in_progress"/);

  const scmLastMessagePath = path.join(rootPath, '.ralph', 'scm-last-message.txt');
  const scmResult = await runFakeCodex(
    rootPath,
    buildPrompt('Tpipe-001.01', 'You are the Ralph SCM conflict-resolution agent.'),
    scmLastMessagePath
  );

  assert.equal(scmResult.code, 0);
  assert.match(await fs.readFile(scmLastMessagePath, 'utf8'), new RegExp(PIPELINE_SMOKE_PR_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
