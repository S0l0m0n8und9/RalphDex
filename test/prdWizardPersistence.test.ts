import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { writePrdWizardDraft } from '../src/commands/prdWizardPersistence';
import type { PrdWizardDraftBundle } from '../src/webview/prdCreationWizardHost';
import { vscodeTestHarness } from './support/vscodeTestHarness';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prd-wizard-'));
}

test('writePrdWizardDraft writes only PRD and tasks files', async () => {
  const harness = vscodeTestHarness();
  harness.reset();
  const rootPath = await makeTempRoot();
  const ralphDir = path.join(rootPath, '.ralph');
  const draft: PrdWizardDraftBundle = {
    prdText: '# Product / project brief\n\nShip the wizard.\n',
    tasks: [
      { id: 'T1', title: 'Implement the wizard write flow', status: 'todo', tier: 'complex' }
    ]
  };

  const result = await writePrdWizardDraft(draft, {
    prdPath: path.join(ralphDir, 'prd.md'),
    tasksPath: path.join(ralphDir, 'tasks.json')
  });

  const persistedPrd = await fs.readFile(path.join(ralphDir, 'prd.md'), 'utf8');
  const persistedTasks = JSON.parse(await fs.readFile(path.join(ralphDir, 'tasks.json'), 'utf8')) as {
    version: number;
    mutationCount?: number;
    tasks: Array<{ id: string; title: string; tier?: string }>;
  };

  assert.match(persistedPrd, /Ship the wizard/);
  assert.equal(persistedTasks.version, 2);
  assert.equal(persistedTasks.tasks[0]?.title, 'Implement the wizard write flow');
  assert.equal(persistedTasks.tasks[0]?.tier, 'complex');

  assert.equal(harness.state.updatedSettings.cliProvider, undefined);
  assert.deepEqual(result, {
    filesWritten: [
      path.join(ralphDir, 'prd.md'),
      path.join(ralphDir, 'tasks.json')
    ]
  });
});

test('writePrdWizardDraft preserves rich reviewed task fields when rewriting tasks.json', async () => {
  const harness = vscodeTestHarness();
  harness.reset();
  const rootPath = await makeTempRoot();
  const ralphDir = path.join(rootPath, '.ralph');
  const draft: PrdWizardDraftBundle = {
    prdText: '# Product / project brief\n\nShip the wizard.\n',
    tasks: [
      {
        id: 'T0',
        title: 'Foundation parent',
        status: 'todo'
      },
      {
        id: 'Tbase',
        title: 'Shared dependency',
        status: 'todo'
      },
      {
        id: 'T1',
        title: 'Implement the wizard write flow',
        status: 'blocked',
        parentId: 'T0',
        dependsOn: ['Tbase'],
        notes: 'Preserve all supported reviewed fields.',
        validation: 'npm run validate',
        blocker: 'Waiting on fixture review',
        priority: 'high',
        mode: 'documentation',
        tier: 'complex',
        acceptance: ['writePrdWizardDraft persists the full task shape'],
        constraints: ['Do not drop reviewed fields during replace'],
        context: ['src/commands/prdWizardPersistence.ts']
      }
    ]
  };

  await writePrdWizardDraft(draft, {
    prdPath: path.join(ralphDir, 'prd.md'),
    tasksPath: path.join(ralphDir, 'tasks.json')
  });

  const persistedTasks = JSON.parse(await fs.readFile(path.join(ralphDir, 'tasks.json'), 'utf8')) as {
    version: number;
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };

  assert.equal(persistedTasks.version, 2);
  assert.equal(persistedTasks.mutationCount, 1);
  assert.deepEqual(persistedTasks.tasks, [
    {
      id: 'T0',
      title: 'Foundation parent',
      status: 'todo'
    },
    {
      id: 'Tbase',
      title: 'Shared dependency',
      status: 'todo'
    },
    {
      id: 'T1',
      title: 'Implement the wizard write flow',
      status: 'blocked',
      parentId: 'T0',
      dependsOn: ['Tbase'],
      notes: 'Preserve all supported reviewed fields.',
      validation: 'npm run validate',
      blocker: 'Waiting on fixture review',
      priority: 'high',
      mode: 'documentation',
      tier: 'complex',
      acceptance: ['writePrdWizardDraft persists the full task shape'],
      constraints: ['Do not drop reviewed fields during replace'],
      context: ['src/commands/prdWizardPersistence.ts']
    }
  ]);
});

