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
