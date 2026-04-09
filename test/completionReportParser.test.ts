import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTrailingJsonObject,
  parseCompletionReport,
  sanitizeCompletionText
} from '../src/ralph/completionReportParser';

test('sanitizeCompletionText normalizes bullets, whitespace, and empty values', () => {
  assert.equal(sanitizeCompletionText('  -  shipped   parser coverage \n\n today  '), 'shipped parser coverage today');
  assert.equal(sanitizeCompletionText('   \n\t   '), undefined);
  assert.equal(sanitizeCompletionText(undefined), undefined);
});

test('extractTrailingJsonObject returns the last complete JSON object at the end of a message', () => {
  const value = extractTrailingJsonObject('Progress update.\n{"selectedTaskId":"T27.1","requestedStatus":"in_progress"}');

  assert.equal(value, '{"selectedTaskId":"T27.1","requestedStatus":"in_progress"}');
});

test('extractTrailingJsonObject ignores braces that appear inside JSON strings', () => {
  const value = extractTrailingJsonObject('Done.\n{"progressNote":"Handled {braces} safely","selectedTaskId":"T27.1","requestedStatus":"done"}');

  assert.equal(
    value,
    '{"progressNote":"Handled {braces} safely","selectedTaskId":"T27.1","requestedStatus":"done"}'
  );
});

test('parseCompletionReport accepts a fenced JSON completion report and sanitizes text fields', () => {
  const parsed = parseCompletionReport([
    'Compact summary.',
    '```json',
    '{',
    '  "selectedTaskId": "T27.1",',
    '  "requestedStatus": "blocked",',
    '  "progressNote": " - Waiting   on   verifier access. ",',
    '  "blocker": "  Child process spawn EPERM  ",',
    '  "validationRan": " cd ralph-codex-vscode-starter && npm test ",',
    '  "needsHumanReview": true',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'parsed');
  assert.ok(parsed.report);
  assert.equal(parsed.report.selectedTaskId, 'T27.1');
  assert.equal(parsed.report.requestedStatus, 'blocked');
  assert.equal(parsed.report.progressNote, 'Waiting on verifier access.');
  assert.equal(parsed.report.blocker, 'Child process spawn EPERM');
  assert.equal(parsed.report.validationRan, 'cd ralph-codex-vscode-starter && npm test');
  assert.equal(parsed.report.needsHumanReview, true);
  assert.equal(parsed.report.suggestedChildTasks, undefined);
  assert.equal(parsed.parseError, null);
});

test('parseCompletionReport accepts a trailing JSON object without a fence', () => {
  const parsed = parseCompletionReport(
    'Summary first.\n{"selectedTaskId":"T27.1","requestedStatus":"in_progress","progressNote":"Updated parser tests."}'
  );

  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.report?.selectedTaskId, 'T27.1');
  assert.equal(parsed.report?.requestedStatus, 'in_progress');
  assert.equal(parsed.report?.progressNote, 'Updated parser tests.');
});

test('parseCompletionReport accepts suggested child tasks when provided', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T27.1",',
    '  "requestedStatus": "in_progress",',
    '  "suggestedChildTasks": [',
    '    {',
    '      "id": "T27.1.a",',
    '      "title": "Add missing regression coverage",',
    '      "parentId": "T27.1",',
    '      "dependsOn": [],',
    '      "validation": " npm test ",',
    '      "rationale": " Missing regression coverage leaves the review incomplete. "',
    '    }',
    '  ]',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'parsed');
  assert.deepEqual(parsed.report?.suggestedChildTasks, [
    {
      id: 'T27.1.a',
      title: 'Add missing regression coverage',
      parentId: 'T27.1',
      dependsOn: [],
      validation: 'npm test',
      rationale: 'Missing regression coverage leaves the review incomplete.'
    }
  ]);
});

test('parseCompletionReport accepts watchdog actions when provided', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T39.2",',
    '  "requestedStatus": "done",',
    '  "watchdog_actions": [',
    '    {',
    '      "taskId": "T12",',
    '      "agentId": "builder-2",',
    '      "action": "decompose_task",',
    '      "severity": "HIGH",',
    '      "reason": "Repeated no-progress iterations",',
    '      "evidence": "Three trailing runs ended no_progress with no file changes.",',
    '      "trailingNoProgressCount": 3,',
    '      "trailingRepeatedFailureCount": 0,',
    '      "suggestedChildTasks": [',
    '        {',
    '          "id": "T12.1",',
    '          "title": "Split the stalled task",',
    '          "parentId": "T12",',
    '          "dependsOn": [],',
    '          "validation": " npm test ",',
    '          "rationale": " Reduce the stalled scope. "',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'parsed');
  assert.deepEqual(parsed.report?.watchdog_actions, [
    {
      taskId: 'T12',
      agentId: 'builder-2',
      action: 'decompose_task',
      severity: 'HIGH',
      reason: 'Repeated no-progress iterations',
      evidence: 'Three trailing runs ended no_progress with no file changes.',
      trailingNoProgressCount: 3,
      trailingRepeatedFailureCount: 0,
      suggestedChildTasks: [
        {
          id: 'T12.1',
          title: 'Split the stalled task',
          parentId: 'T12',
          dependsOn: [],
          validation: 'npm test',
          rationale: 'Reduce the stalled scope.'
        }
      ]
    }
  ]);
});

test('parseCompletionReport rejects invalid requestedStatus values', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{"selectedTaskId":"T27.1","requestedStatus":"ship-it"}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'invalid');
  assert.equal(parsed.report, null);
  assert.match(parsed.parseError ?? '', /requestedStatus must be one of done, blocked, or in_progress/);
});

test('parseCompletionReport rejects invalid suggested child task payloads', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T27.1",',
    '  "requestedStatus": "in_progress",',
    '  "suggestedChildTasks": [{"id":"T27.1.a"}]',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'invalid');
  assert.match(parsed.parseError ?? '', /suggestedChildTasks must be an array of valid suggested child tasks/);
});

test('parseCompletionReport ignores invalid watchdog action payloads', () => {
  const parsed = parseCompletionReport([
    '```json',
    '{',
    '  "selectedTaskId": "T39.2",',
    '  "requestedStatus": "done",',
    '  "watchdog_actions": [{"taskId":"T12","action":"resolve_stale_claim"}]',
    '}',
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.report?.watchdog_actions?.length ?? 0, 0);
});

test('parseCompletionReport reports missing when no trailing report block exists', () => {
  const parsed = parseCompletionReport('No structured completion report was emitted.');

  assert.deepEqual(parsed, {
    status: 'missing',
    report: null,
    rawBlock: null,
    parseError: null
  });
});

test('extractTrailingJsonObject handles escaped quotes inside JSON strings', () => {
  const value = extractTrailingJsonObject(
    'Result:\n{"note":"say \\"hi\\"","id":"T1","requestedStatus":"done"}'
  );
  assert.equal(
    value,
    '{"note":"say \\"hi\\"","id":"T1","requestedStatus":"done"}'
  );
});

test('parseCompletionReport rejects suggestedChildTasks array exceeding size cap', () => {
  const children = Array.from({ length: 11 }, (_, i) => ({
    id: `T1.${i}`,
    title: `Child ${i}`,
    parentId: 'T1',
    dependsOn: [],
    validation: 'npm test',
    rationale: 'Filler task.'
  }));
  const parsed = parseCompletionReport([
    '```json',
    JSON.stringify({
      selectedTaskId: 'T1',
      requestedStatus: 'in_progress',
      suggestedChildTasks: children
    }),
    '```'
  ].join('\n'));

  assert.equal(parsed.status, 'invalid');
  assert.match(parsed.parseError ?? '', /suggestedChildTasks/);
});
