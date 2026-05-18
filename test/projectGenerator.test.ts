import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  generatePrdDraft,
  generateTasksFromPrd,
  parseTaskGenerationResponse,
  ProjectGenerationError,
  runPromptThroughConfiguredProvider
} from '../src/ralph/projectGenerator';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { setHttpsClientOverride } from '../src/services/httpsClient';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { hashText } from '../src/ralph/integrity';

test('parseTaskGenerationResponse parses fenced tasks and maps suggestedValidationCommand', () => {
  const response = [
    '```json',
    JSON.stringify({
      tasks: [
        {
          id: 'T1',
          title: 'Implement focused endpoint',
          status: 'done',
          suggestedValidationCommand: 'npm run validate'
        }
      ]
    }, null, 2),
    '```'
  ].join('\n');

  const parsed = parseTaskGenerationResponse(response);
  assert.equal(parsed.tasks.length, 1);
  assert.deepEqual(parsed.tasks[0], {
    id: 'T1',
    title: 'Implement focused endpoint',
    status: 'todo',
    validation: 'npm run validate'
  });
});

test('generatePrdDraft returns PRD markdown and does not require task JSON', async () => {
  let capturedStdin = '';
  setProcessRunnerOverride((_cmd, _args, opts) => {
    capturedStdin = String(opts?.stdinText ?? '');
    return {
      code: 0,
      stdout: JSON.stringify({
        type: 'result',
        result: '# Draft PRD\n\n## Overview\nA specific overview.\n\n## Goals\nConcrete goals.\n\n## Scope\nScope.\n\n## Non-Goals\nNon-goals.\n\n## Success Criteria\nSuccess checks.\n\n## Work Area A\nActionable details.',
        num_turns: 1
      }),
      stderr: ''
    };
  });

  try {
    const generated = await generatePrdDraft(
      { objective: 'Build a deterministic workflow.', projectType: 'service' },
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      os.tmpdir()
    );
    assert.match(generated.prdText, /^# Draft PRD/m);
    assert.ok(!/```json/i.test(generated.prdText), 'PRD-only generation should not require JSON output');
    assert.match(capturedStdin, /Return markdown only/i);
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generatePrdDraft uses documentation guardrails for documentation project type', async () => {
  let capturedStdin = '';
  setProcessRunnerOverride((_cmd, _args, opts) => {
    capturedStdin = String(opts?.stdinText ?? '');
    return {
      code: 0,
      stdout: JSON.stringify({
        type: 'result',
        result: '# Repository documentation brief\n\n## Overview\nDocument existing behavior.\n\n## Goals\nGoal.\n\n## Scope\nScope.\n\n## Non-Goals\nNo code changes.\n\n## Success Criteria\nCriteria.\n\n## Work Areas\nDocument commands.',
        num_turns: 1
      }),
      stderr: ''
    };
  });

  try {
    await generatePrdDraft(
      { objective: 'Document this repository.', projectType: 'documentation' },
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      os.tmpdir()
    );
    assert.match(capturedStdin, /documentation-only repository brief/i);
    assert.match(capturedStdin, /Do not propose code changes/i);
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runPromptThroughConfiguredProvider uses direct execution when the configured provider supports it', async () => {
  process.env.RALPH_TEST_AZURE_KEY = 'test-key';
  let spawned = false;
  let requestedUrl = '';
  let requestedBody = '';

  setProcessRunnerOverride(() => {
    spawned = true;
    throw new Error('direct-capable provider should not spawn a CLI process');
  });
  setHttpsClientOverride(async (opts) => {
    requestedUrl = opts.url;
    requestedBody = opts.body;
    return {
      statusCode: 200,
      responseBody: JSON.stringify({ choices: [{ message: { content: '# Draft PRD\n\n## Overview\nDirect response.' } }] })
    };
  });

  try {
    const result = await runPromptThroughConfiguredProvider(
      'Write a PRD.',
      {
        ...DEFAULT_CONFIG,
        cliProvider: 'azure-foundry',
        model: 'gpt-5.4',
        azureFoundry: {
          ...DEFAULT_CONFIG.azureFoundry,
          endpointUrl: 'https://example.openai.azure.com/openai/deployments/gpt-5.4/chat/completions',
          modelDeployment: 'gpt-5.4',
          auth: {
            ...DEFAULT_CONFIG.azureFoundry.auth,
            mode: 'env-api-key',
            apiKeyEnvVar: 'RALPH_TEST_AZURE_KEY'
          }
        }
      },
      os.tmpdir(),
      'ralph-prd-test'
    );

    assert.equal(spawned, false);
    assert.equal(result.providerId, 'azure-foundry');
    assert.equal(result.responseText, '# Draft PRD\n\n## Overview\nDirect response.');
    assert.equal(result.launchShell, false);
    assert.deepEqual(result.launchArgs, []);
    assert.match(requestedUrl, /gpt-5\.4/);
    assert.match(requestedBody, /Write a PRD/);
  } finally {
    delete process.env.RALPH_TEST_AZURE_KEY;
    setProcessRunnerOverride(null);
    setHttpsClientOverride(null);
  }
});

test('generatePrdDraft surfaces provider failure details instead of a generic exit code', async () => {
  setProcessRunnerOverride(() => ({
    code: 2,
    stdout: '',
    stderr: 'warning: startup detail\nerror: unknown option --broken'
  }));

  try {
    await assert.rejects(
      () => generatePrdDraft(
        { objective: 'Build a deterministic workflow.', projectType: 'service' },
        { ...DEFAULT_CONFIG, cliProvider: 'claude' },
        os.tmpdir()
      ),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        assert.match(err.message, /claude exited with code 2: unknown option --broken/);
        assert.doesNotMatch(err.message, /^CLI exited with code 2\.$/);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generatePrdDraft surfaces azure-foundry endpoint configuration errors before execution', async () => {
  setProcessRunnerOverride(() => {
    throw new Error('misconfigured azure-foundry provider should not spawn a CLI process');
  });
  setHttpsClientOverride(() => {
    throw new Error('misconfigured azure-foundry provider should not make an HTTPS request');
  });

  try {
    await assert.rejects(
      () => generatePrdDraft(
        { objective: 'Build a deterministic workflow.', projectType: 'service' },
        {
          ...DEFAULT_CONFIG,
          cliProvider: 'azure-foundry',
          azureFoundry: {
            ...DEFAULT_CONFIG.azureFoundry,
            endpointUrl: ''
          }
        },
        os.tmpdir()
      ),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        assert.match(err.message, /ralphCodex\.azureFoundry\.endpointUrl is not configured/);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
    setHttpsClientOverride(null);
  }
});

test('generateTasksFromPrd rejects task generation when PRD readiness has blockers', async () => {
  await assert.rejects(
    () => generateTasksFromPrd(
      {
        prdText: '# Placeholder\n\n## Overview\nTODO\n',
        prdHash: hashText('# Placeholder\n\n## Overview\nTODO\n'),
        projectType: 'service'
      },
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      os.tmpdir()
    ),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /readiness has blockers/i);
      return true;
    }
  );
});

test('generateTasksFromPrd generates tasks from approved PRD and persists task-generation plan artifact', async () => {
  let capturedStdin = '';
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-gen-test-'));
  setProcessRunnerOverride((_cmd, _args, opts) => {
    capturedStdin = String(opts?.stdinText ?? '');
    return {
      code: 0,
      stdout: JSON.stringify({
        type: 'result',
        result: [
          '```json',
          JSON.stringify({
            tasks: [
              {
                id: 'T1',
                title: 'Add deterministic PRD readiness artifact persistence',
                status: 'todo',
                suggestedValidationCommand: 'npm run validate',
                acceptance: ['latest-prd-readiness.json is written after readiness checks']
              },
              {
                id: 'T2',
                title: 'Wire wizard task generation to approved PRD hash',
                status: 'todo',
                dependsOn: ['T1']
              }
            ]
          }, null, 2),
          '```'
        ].join('\n'),
        num_turns: 1
      }),
      stderr: ''
    };
  });

  const prdText = [
    '# RalphDex PRD',
    '',
    '## Overview',
    'Improve PRD-first generation flow.',
    '',
    '## Goals',
    'Generate atomic starter tasks only after readiness.',
    '',
    '## Scope',
    'Wizard and full workflow gating.',
    '',
    '## Non-Goals',
    'No doctrine auto-mutation.',
    '',
    '## Success Criteria',
    'No task generation before readiness.',
    '',
    '## Wizard Flow',
    'Generate PRD, review readiness, then generate tasks with explicit checks.',
    '',
    '## Validation',
    'Run npm run validate and focused tests.'
  ].join('\n');

  try {
    const generated = await generateTasksFromPrd(
      {
        prdText,
        prdHash: hashText(prdText),
        projectType: 'service'
      },
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      os.tmpdir(),
      tmpDir
    );

    assert.equal(generated.tasks.length, 2);
    assert.equal(generated.planArtifact.status, 'draft');
    assert.equal(generated.planArtifact.prdHash, hashText(prdText));
    assert.deepEqual(generated.planArtifact.generatedTaskIds, ['T1', 'T2']);
    assert.match(capturedStdin, /Do not map one task per PRD section/i);
    assert.doesNotMatch(capturedStdin, /Tasks must correspond one-to-one/i);

    const latestPlanPath = path.join(tmpDir, 'latest-task-generation-plan.json');
    const rawPlan = JSON.parse(await fs.readFile(latestPlanPath, 'utf8')) as {
      kind: string;
      status: string;
      prdHash: string;
      generatedTaskIds: string[];
    };
    assert.equal(rawPlan.kind, 'taskGenerationPlan');
    assert.equal(rawPlan.status, 'draft');
    assert.equal(rawPlan.prdHash, hashText(prdText));
    assert.deepEqual(rawPlan.generatedTaskIds, ['T1', 'T2']);
  } finally {
    setProcessRunnerOverride(null);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
