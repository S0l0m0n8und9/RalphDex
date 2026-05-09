import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompletionReport } from '../src/ralph/completionReportParser';

test('parseCompletionReport rejects a second fenced report object after a trailing comment', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T1",',
    '  "requestedStatus": "done"',
    '}',
    '// revised report follows',
    '{',
    '  "selectedTaskId": "T2",',
    '  "requestedStatus": "blocked"',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'invalid');
  assert.match(parsed.parseError ?? '', /multiple JSON objects/);
});

test('parseCompletionReport rejects a second fenced report object after trailing prose', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T1",',
    '  "requestedStatus": "done"',
    '}',
    'Actually, use this corrected report instead:',
    '{',
    '  "selectedTaskId": "T2",',
    '  "requestedStatus": "blocked"',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'invalid');
  assert.match(parsed.parseError ?? '', /multiple JSON objects/);
});

test('parseCompletionReport accepts harmless trailing prose braces that are not strict JSON', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T3",',
    '  "requestedStatus": "done"',
    '}',
    'Note: this mentions braces like {not JSON} and should remain harmless.',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.report?.selectedTaskId, 'T3');
  assert.equal(parsed.report?.requestedStatus, 'done');
  assert.match(parsed.warnings.join('\n'), /Ignored trailing content/);
});
