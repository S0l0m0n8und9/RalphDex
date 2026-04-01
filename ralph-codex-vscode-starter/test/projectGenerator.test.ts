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
[
  { "id": "T1", "title": "Build core data model", "status": "todo" },
  { "id": "T2", "title": "Expose REST interface", "status": "todo" }
]
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
  const response = '# P\n```json\n[{ "id": "T1", "title": "x", "status": "in_progress" }]\n```';
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].status, 'todo');
});

test('parseGenerationResponse uses the LAST json fence when multiple are present', () => {
  const response = '# P\n```json\n[{ "id": "TX", "title": "wrong", "status": "todo" }]\n```\nMore text.\n```json\n[{ "id": "T1", "title": "right", "status": "todo" }]\n```';
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].id, 'T1');
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

test('parseGenerationResponse throws ProjectGenerationError when JSON is an empty array', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /non-empty array/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing id', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[{ "title": "x", "status": "todo" }]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"id"/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing title', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[{ "id": "T1", "status": "todo" }]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"title"/);
      return true;
    }
  );
});

import { generateProjectDraft } from '../src/ralph/projectGenerator';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import * as nodeOs from 'node:os';

// Claude provider: stdout is NDJSON with a "result" field
const VALID_CLAUDE_STDOUT = JSON.stringify({
  type: 'result',
  result: `# Draft Project\n\n## Overview\nOverview text.\n\n## Phase 1\nDo the first thing.\n\n\`\`\`json\n[{ "id": "T1", "title": "Phase 1 work", "status": "todo" }]\n\`\`\``,
  num_turns: 1
});

test('generateProjectDraft returns prdText and tasks on success (claude provider)', async () => {
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
