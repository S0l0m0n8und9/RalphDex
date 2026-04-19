import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import {
  parseTaskSeedResponse,
  seedTasksFromRequest,
  TaskSeedingError
} from '../src/ralph/taskSeeder';

test('parseTaskSeedResponse forces todo status, preserves supported fields, and remaps colliding ids deterministically', () => {
  const response = [
    '```json',
    JSON.stringify({
      tasks: [
        {
          id: 'T1',
          title: ' Build provider-backed seeding ',
          status: 'done',
          rationale: 'Keep as notes alias until normalization.',
          dependsOn: ['T0'],
          acceptance: ['Adds a seeding helper'],
          constraints: ['Do not mutate tasks.json directly'],
          context: ['src/commands/registerCommands.ts'],
          priority: 'high',
          mode: 'documentation',
          tier: 'complex',
          suggestedValidationCommand: 'npm run validate'
        },
        {
          id: 'T1',
          title: 'Persist seeding artifacts',
          status: 'blocked'
        }
      ]
    }, null, 2),
    '```'
  ].join('\n');

  const parsed = parseTaskSeedResponse(response, new Set(['T1', 'T2']));

  assert.deepEqual(parsed.tasks, [
    {
      id: 'T3',
      title: ' Build provider-backed seeding ',
      status: 'todo',
      rationale: 'Keep as notes alias until normalization.',
      dependsOn: ['T0'],
      acceptance: ['Adds a seeding helper'],
      constraints: ['Do not mutate tasks.json directly'],
      context: ['src/commands/registerCommands.ts'],
      priority: 'high',
      mode: 'documentation',
      tier: 'complex',
      validation: 'npm run validate'
    },
    {
      id: 'T4',
      title: 'Persist seeding artifacts',
      status: 'todo'
    }
  ]);
  assert.equal(parsed.warnings.length, 2);
  assert.match(parsed.warnings[0] ?? '', /Remapped seeded task id "T1" to "T3"/);
  assert.match(parsed.warnings[1] ?? '', /Remapped seeded task id "T1" to "T4"/);
});

test('parseTaskSeedResponse rejects malformed or empty task lists before any persistence', () => {
  assert.throws(
    () => parseTaskSeedResponse('```json\n{"tasks":[]}\n```'),
    (error: unknown) => {
      assert.ok(error instanceof TaskSeedingError);
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /non-empty "tasks" array/);
      return true;
    }
  );
});

test('seedTasksFromRequest writes a durable seeding artifact and returns append-ready drafts', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-seeder-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  await fs.mkdir(artifactRootDir, { recursive: true });

  setProcessRunnerOverride((_command, _args, _options) => ({
    code: 0,
    stdout: JSON.stringify({
      type: 'result',
      result: [
        '```json',
        JSON.stringify({
          tasks: [
            {
              id: 'T1',
              title: 'Seed task engine',
              status: 'todo',
              suggestedValidationCommand: 'npm run validate',
              acceptance: ['Writes durable artifact']
            }
          ]
        }, null, 2),
        '```'
      ].join('\n'),
      num_turns: 1
    }),
    stderr: ''
  }));

  try {
    const result = await seedTasksFromRequest({
      requestText: 'Create backlog tasks for a provider-backed seeding engine.',
      config: { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      cwd: rootPath,
      artifactRootDir,
      existingTaskIds: new Set(['T1'])
    });

    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0]?.id, 'T2');
    assert.equal(result.tasks[0]?.validation, 'npm run validate');
    assert.ok(result.artifactPath.startsWith(path.join(artifactRootDir, 'task-seeding')));

    const artifact = JSON.parse(await fs.readFile(result.artifactPath, 'utf8')) as {
      kind: string;
      sourceRequest: string;
      provider: { id: string; commandPath: string };
      launchMetadata: { cwd: string; args: string[] };
      taskDrafts: Array<{
        id: string;
        title: string;
        acceptance?: string[];
        validation?: string;
      }>;
      warnings: string[];
    };

    assert.equal(artifact.kind, 'taskSeeding');
    assert.equal(artifact.sourceRequest, 'Create backlog tasks for a provider-backed seeding engine.');
    assert.equal(artifact.provider.id, 'claude');
    assert.equal(artifact.provider.commandPath, 'claude');
    assert.equal(artifact.launchMetadata.cwd, rootPath);
    assert.ok(Array.isArray(artifact.launchMetadata.args), 'launch args should be persisted');
    assert.equal(artifact.taskDrafts.length, 1);
    assert.equal(artifact.taskDrafts[0]?.id, 'T2');
    assert.equal(artifact.taskDrafts[0]?.title, 'Seed task engine');
    assert.deepEqual(artifact.taskDrafts[0]?.acceptance, ['Writes durable artifact']);
    assert.equal(artifact.taskDrafts[0]?.validation, 'npm run validate');
    assert.equal(artifact.warnings.length, 1);
    assert.match(artifact.warnings[0] ?? '', /Remapped seeded task id "T1" to "T2"/);
  } finally {
    setProcessRunnerOverride(null);
  }
});
