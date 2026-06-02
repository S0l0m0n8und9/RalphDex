import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function createSeededWorkspace(): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralphdex-activation-smoke-'));
  const ralphDir = path.join(workspacePath, '.ralph');
  await fs.mkdir(ralphDir, { recursive: true });
  await fs.writeFile(
    path.join(ralphDir, 'prd.md'),
    [
      '# Activation Smoke PRD',
      '',
      '## Overview',
      'Seeded workspace used by the VS Code Extension Development Host smoke test.',
      '',
      '## Goals',
      'Render the Ralphdex dashboard against durable workspace files.',
      '',
      '## Scope',
      'Dashboard and PRD wizard smoke coverage only.',
      '',
      '## Success Criteria',
      'The React shell reports readiness from the real webview host.',
      ''
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(ralphDir, 'tasks.json'),
    `${JSON.stringify({
      version: 2,
      tasks: [
        {
          id: 'T1',
          title: 'Render seeded dashboard state',
          status: 'todo',
          acceptance: ['Dashboard opens in the Extension Development Host'],
          validation: 'npm run test:activation',
          tier: 'simple'
        }
      ]
    }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(path.join(ralphDir, 'progress.md'), '', 'utf8');
  return workspacePath;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const vscodeExecutablePath = process.env.RALPH_VSCODE_EXECUTABLE_PATH;
  const smokeWorkspacePath = await createSeededWorkspace();

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [smokeWorkspacePath],
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {})
    });
  } catch (error) {
    if (!vscodeExecutablePath) {
      throw new Error(
        'Real activation smoke scaffolding is in place, but the default @vscode/test-electron download did not launch cleanly in this environment. Set RALPH_VSCODE_EXECUTABLE_PATH to a working local VS Code executable and rerun npm run test:activation.',
        { cause: error instanceof Error ? error : undefined }
      );
    }

    throw error;
  } finally {
    await fs.rm(smokeWorkspacePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
