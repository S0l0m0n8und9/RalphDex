import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { buildPrdWizardConfigSelections, writePrdWizardDraft } from '../src/commands/prdWizardPersistence';
import type { PrdWizardDraftBundle } from '../src/webview/prdCreationWizardHost';
import { vscodeTestHarness } from './support/vscodeTestHarness';

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-prd-wizard-'));
}

test('buildPrdWizardConfigSelections falls back to simple operator mode when none is configured', () => {
  vscodeTestHarness().reset();
  const selections = buildPrdWizardConfigSelections({
    cliProvider: 'copilot',
    operatorMode: undefined
  });

  assert.deepEqual(
    selections.map(({ key, value, selected }) => ({ key, value, selected })),
    [
      { key: 'operatorMode', value: 'simple', selected: true },
      { key: 'cliProvider', value: 'copilot', selected: true }
    ]
  );
});

test('writePrdWizardDraft writes files, applies selected settings, and reports skipped recommendations', async () => {
  const harness = vscodeTestHarness();
  harness.reset();
  const rootPath = await makeTempRoot();
  const ralphDir = path.join(rootPath, '.ralph');
  const draft: PrdWizardDraftBundle = {
    prdText: '# Product / project brief\n\nShip the wizard.\n',
    tasks: [
      { id: 'T1', title: 'Implement the wizard write flow', status: 'todo', tier: 'complex' }
    ],
    recommendedSkills: [
      { name: 'testing', description: 'Testing discipline', rationale: 'Verify changes.', selected: false }
    ],
    configSelections: [
      {
        key: 'operatorMode',
        label: 'Operator mode',
        value: 'multi-agent',
        description: 'Use the multi-agent preset.',
        rationale: 'This workspace is ready for autonomous runs.',
        selected: true
      },
      {
        key: 'cliProvider',
        label: 'CLI provider',
        value: 'claude',
        description: 'Use Claude CLI.',
        rationale: 'Skip this recommendation in the test.',
        selected: false
      }
    ]
  };

  const result = await writePrdWizardDraft(workspaceFolder(rootPath), draft, {
    prdPath: path.join(ralphDir, 'prd.md'),
    tasksPath: path.join(ralphDir, 'tasks.json'),
    recommendedSkillsPath: path.join(ralphDir, 'recommended-skills.json')
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

  await assert.rejects(
    fs.readFile(path.join(ralphDir, 'recommended-skills.json'), 'utf8'),
    /ENOENT/
  );

  assert.equal(harness.state.updatedSettings.operatorMode, 'multi-agent');
  assert.equal(harness.state.updatedSettings.cliProvider, undefined);

  assert.deepEqual(result.settingsUpdated, ['ralphCodex.operatorMode = multi-agent']);
  assert.deepEqual(result.settingsSkipped, [
    'ralphCodex.cliProvider = claude (not selected)',
    'testing (not selected)'
  ]);
});
