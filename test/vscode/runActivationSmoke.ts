import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const vscodeExecutablePath = process.env.RALPH_VSCODE_EXECUTABLE_PATH;

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
