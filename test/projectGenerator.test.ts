import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGenerationResponse, ProjectGenerationError } from '../src/ralph/projectGenerator';

const VALID_RESPONSE = `# My Project

## Overview
This project does something useful.

## Goals
- Ship fast
- Stay reliable

## Phase 1: Foundation
Build the core data model.

## Phase 2: API
Expose a REST interface.

\`\`\`json
{
  "tasks": [
    { "id": "T1", "title": "Build core data model", "status": "todo" },
    { "id": "T2", "title": "Expose REST interface", "status": "todo" }
  ],
  "recommendedSkills": [
    { "name": "jest", "description": "JavaScript testing framework", "rationale": "Essential for testing the data model and API layers" }
  ]
}
\`\`\``;

test('parseGenerationResponse extracts prdText before the JSON fence', () => {
  const { prdText } = parseGenerationResponse(VALID_RESPONSE);
  assert.ok(prdText.startsWith('# My Project'));
  assert.ok(!prdText.includes('```json'));
  assert.ok(!prdText.includes('T1'));
});

test('parseGenerationResponse returns correct task array', () => {
  const { tasks } = parseGenerationResponse(VALID_RESPONSE);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], { id: 'T1', title: 'Build core data model', status: 'todo' });
  assert.deepEqual(tasks[1], { id: 'T2', title: 'Expose REST interface', status: 'todo' });
});

test('parseGenerationResponse forces status to "todo" regardless of what AI returns', () => {
  const response = '# P\n```json\n{"tasks":[{ "id": "T1", "title": "x", "status": "in_progress" }]}\n```';
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].status, 'todo');
});

test('parseGenerationResponse uses the LAST json fence when multiple are present', () => {
  const response = '# P\n```json\n{"tasks":[{ "id": "TX", "title": "wrong", "status": "todo" }]}\n```\nMore text.\n```json\n{"tasks":[{ "id": "T1", "title": "right", "status": "todo" }]}\n```';
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].id, 'T1');
});

test('parseGenerationResponse throws ProjectGenerationError when no PRD text before JSON fence', () => {
  assert.throws(
    () => parseGenerationResponse('```json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }]}\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /no PRD text/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when no JSON fence', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n\nNo fence here.'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /fenced JSON block/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when JSON is malformed', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\nnot valid json\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /malformed JSON/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when JSON is a bare array instead of object', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /object/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when tasks array is empty', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n{"tasks":[]}\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /non-empty/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when tasks field is missing', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n{"recommendedSkills":[]}\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"tasks"/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing id', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n{"tasks":[{ "title": "x", "status": "todo" }]}\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"id"/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing title', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n{"tasks":[{ "id": "T1", "status": "todo" }]}\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"title"/);
      return true;
    }
  );
});

test('parseGenerationResponse extracts recommendedSkills from valid response', () => {
  const { recommendedSkills } = parseGenerationResponse(VALID_RESPONSE);
  assert.equal(recommendedSkills.length, 1);
  assert.equal(recommendedSkills[0].name, 'jest');
  assert.ok(recommendedSkills[0].description.length > 0);
  assert.ok(recommendedSkills[0].rationale.length > 0);
});

test('parseGenerationResponse returns empty recommendedSkills when field is absent', () => {
  const response = '# P\n```json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }]}\n```';
  const { recommendedSkills } = parseGenerationResponse(response);
  assert.deepEqual(recommendedSkills, []);
});

test('parseGenerationResponse returns empty recommendedSkills when field is empty array', () => {
  const response = '# P\n```json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }],"recommendedSkills":[]}\n```';
  const { recommendedSkills } = parseGenerationResponse(response);
  assert.deepEqual(recommendedSkills, []);
});

test('parseGenerationResponse silently skips malformed skill entries', () => {
  const response = '# P\n```json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }],"recommendedSkills":[{"name":"ok","description":"d","rationale":"r"},{"name":42}]}\n```';
  const { recommendedSkills } = parseGenerationResponse(response);
  assert.equal(recommendedSkills.length, 1);
  assert.equal(recommendedSkills[0].name, 'ok');
});

test('parseGenerationResponse sets taskCountWarning when response has more than 8 tasks', () => {
  const tasks = Array.from({ length: 9 }, (_, i) => `{ "id": "T${i + 1}", "title": "task ${i + 1}", "status": "todo" }`).join(', ');
  const response = `# P\n\`\`\`json\n{"tasks":[${tasks}]}\n\`\`\``;
  const result = parseGenerationResponse(response);
  assert.equal(result.tasks.length, 9);
  assert.ok(result.taskCountWarning, 'expected taskCountWarning to be set');
  assert.match(result.taskCountWarning!, /9 tasks/);
});

test('parseGenerationResponse does not set taskCountWarning for 8 tasks or fewer', () => {
  const tasks = Array.from({ length: 8 }, (_, i) => `{ "id": "T${i + 1}", "title": "task ${i + 1}", "status": "todo" }`).join(', ');
  const response = `# P\n\`\`\`json\n{"tasks":[${tasks}]}\n\`\`\``;
  const { taskCountWarning } = parseGenerationResponse(response);
  assert.equal(taskCountWarning, undefined);
});

import { generateProjectDraft } from '../src/ralph/projectGenerator';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import * as nodeOs from 'node:os';

// Claude provider: stdout is NDJSON with a "result" field
const VALID_CLAUDE_STDOUT = JSON.stringify({
  type: 'result',
  result: `# Draft Project\n\n## Overview\nOverview text.\n\n## Phase 1\nDo the first thing.\n\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "Phase 1 work", "status": "todo" }],"recommendedSkills":[{"name":"vitest","description":"Fast unit test runner","rationale":"Suits the project stack"}]}\n\`\`\``,
  num_turns: 1
});

test('generateProjectDraft returns prdText, tasks, and recommendedSkills on success (claude provider)', async () => {
  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 0,
    stdout: VALID_CLAUDE_STDOUT,
    stderr: ''
  }));

  try {
    const result = await generateProjectDraft(
      'Build a task manager',
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      nodeOs.tmpdir()
    );
    assert.ok(result.prdText.startsWith('# Draft Project'));
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'T1');
    assert.equal(result.tasks[0].status, 'todo');
    assert.equal(result.recommendedSkills.length, 1);
    assert.equal(result.recommendedSkills[0].name, 'vitest');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft throws ProjectGenerationError when CLI exits non-zero', async () => {
  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 1,
    stdout: '',
    stderr: 'error: something went wrong'
  }));

  try {
    await assert.rejects(
      () => generateProjectDraft('Build something', { ...DEFAULT_CONFIG, cliProvider: 'claude' }, nodeOs.tmpdir()),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        assert.match(err.message, /exited with code 1/);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft throws ProjectGenerationError when response has no JSON fence', async () => {
  const stdoutNoFence = JSON.stringify({
    type: 'result',
    result: '# P\n\nNo fence.',
    num_turns: 1
  });

  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 0,
    stdout: stdoutNoFence,
    stderr: ''
  }));

  try {
    await assert.rejects(
      () => generateProjectDraft('Build something', { ...DEFAULT_CONFIG, cliProvider: 'claude' }, nodeOs.tmpdir()),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft uses copilotCommandPath when cliProvider is copilot', async () => {
  let capturedCommand = '';
  setProcessRunnerOverride((cmd, _args, _opts) => {
    capturedCommand = cmd;
    return {
      code: 0,
      stdout: `GitHub Copilot response\n# P\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }]}\n\`\`\``,
      stderr: ''
    };
  });

  try {
    await generateProjectDraft(
      'Build something',
      { ...DEFAULT_CONFIG, cliProvider: 'copilot', copilotCommandPath: 'my-copilot' },
      nodeOs.tmpdir()
    ).catch(() => {});
    assert.equal(capturedCommand, 'my-copilot');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft uses prdGenerationTemplate when set instead of built-in prompt', async () => {
  let capturedStdin = '';
  const customTemplate = 'CUSTOM TEMPLATE for {OBJECTIVE}';
  const stdoutCustom = JSON.stringify({
    type: 'result',
    result: `# Custom\n\n## Overview\nCustom overview.\n\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "custom task", "status": "todo" }]}\n\`\`\``,
    num_turns: 1
  });

  setProcessRunnerOverride((_cmd, _args, opts) => {
    if (opts?.stdinText) {
      capturedStdin = opts.stdinText as string;
    }
    return { code: 0, stdout: stdoutCustom, stderr: '' };
  });

  try {
    await generateProjectDraft(
      'my objective',
      { ...DEFAULT_CONFIG, cliProvider: 'claude', prdGenerationTemplate: customTemplate },
      nodeOs.tmpdir()
    );
    assert.ok(capturedStdin.includes('CUSTOM TEMPLATE'), 'expected custom template to be used in prompt');
    assert.ok(capturedStdin.includes('my objective'), 'expected objective to be substituted');
    assert.ok(!capturedStdin.includes('agentic coding loop'), 'expected built-in template NOT to be used');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('parseGenerationResponse maps suggestedValidationCommand to task validation field', () => {
  const response = `# P\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo", "suggestedValidationCommand": "npm run validate" }]}\n\`\`\``;
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].validation, 'npm run validate');
});

test('parseGenerationResponse handles missing suggestedValidationCommand without error', () => {
  const response = `# P\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "x", "status": "todo" }]}\n\`\`\``;
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].validation, undefined);
});

test('generateProjectDraft uses codexCommandPath and parses codex response correctly', async () => {
  const codexResponse = `# Codex Project\n\n## Overview\nSome overview.\n\n## Phase 1\nDo something.\n\n\`\`\`json\n{"tasks":[{ "id": "T1", "title": "Phase 1 work", "status": "todo" }]}\n\`\`\``;
  const fsSync = require('node:fs');

  let capturedCommand = '';
  setProcessRunnerOverride((cmd, args, _opts) => {
    capturedCommand = cmd;
    // Codex CLI writes to --output-last-message <path>
    const idx = args.indexOf('--output-last-message');
    if (idx !== -1 && args[idx + 1]) {
      fsSync.writeFileSync(args[idx + 1], codexResponse, 'utf8');
    }
    return { code: 0, stdout: '', stderr: '' };
  });

  try {
    const result = await generateProjectDraft(
      'Build something',
      { ...DEFAULT_CONFIG, cliProvider: 'codex', codexCommandPath: 'my-codex' },
      nodeOs.tmpdir()
    );
    assert.equal(capturedCommand, 'my-codex');
    assert.ok(result.prdText.startsWith('# Codex Project'));
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'T1');
  } finally {
    setProcessRunnerOverride(null);
  }
});
