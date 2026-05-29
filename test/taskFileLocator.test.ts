import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTaskEntryLocations,
  findTasksArrayStart,
  lineAndColumnAt,
  parseJsonString
} from '../src/ralph/taskFileLocator';

test('lineAndColumnAt reports 1-based line and column', () => {
  const text = 'a\nbc\nd';
  assert.deepEqual(lineAndColumnAt(text, 0), { line: 1, column: 1 });
  assert.deepEqual(lineAndColumnAt(text, 2), { line: 2, column: 1 });
  assert.deepEqual(lineAndColumnAt(text, 3), { line: 2, column: 2 });
  assert.deepEqual(lineAndColumnAt(text, 5), { line: 3, column: 1 });
});

test('parseJsonString reads a quoted string and returns the index after the closing quote', () => {
  const text = '{"key":"value"}';
  const parsed = parseJsonString(text, text.indexOf('"value"'));
  assert.equal(parsed.value, 'value');
  assert.equal(text[parsed.endIndex - 1], '"');
});

test('parseJsonString preserves escape sequences', () => {
  const text = '"a\\"b"';
  const parsed = parseJsonString(text, 0);
  assert.equal(parsed.value, 'a"b');
});

test('findTasksArrayStart locates the top-level tasks array opening bracket', () => {
  const raw = '{\n  "version": 2,\n  "tasks": [\n    { "id": "T1" }\n  ]\n}';
  const start = findTasksArrayStart(raw);
  assert.notEqual(start, null);
  assert.equal(raw[start as number], '[');
});

test('findTasksArrayStart ignores a nested "tasks" key', () => {
  const raw = '{\n  "meta": { "tasks": [1, 2] },\n  "version": 2\n}';
  // The only `tasks` here is nested one level deep (objectDepth 2), so it is
  // not treated as the top-level tasks array.
  assert.equal(findTasksArrayStart(raw), null);
});

test('extractTaskEntryLocations returns one location per top-level task in order', () => {
  const raw = [
    '{',
    '  "version": 2,',
    '  "tasks": [',
    '    { "id": "T1", "title": "First" },',
    '    { "id": "T2", "title": "Second" }',
    '  ]',
    '}'
  ].join('\n');

  const locations = extractTaskEntryLocations(raw);
  assert.equal(locations.length, 2);
  assert.deepEqual(locations.map((l) => l.arrayIndex), [0, 1]);
  // Both entries start on their own lines (4 and 5, 1-based).
  assert.equal(locations[0].line, 4);
  assert.equal(locations[1].line, 5);
});

test('extractTaskEntryLocations returns empty for an empty array or a missing tasks key', () => {
  assert.deepEqual(extractTaskEntryLocations('{ "tasks": [] }'), []);
  assert.deepEqual(extractTaskEntryLocations('{ "version": 2 }'), []);
});

test('extractTaskEntryLocations is unfazed by braces and commas inside string values', () => {
  const raw = '{ "tasks": [ { "id": "T1", "title": "a, {b} ]" }, { "id": "T2" } ] }';
  const locations = extractTaskEntryLocations(raw);
  assert.equal(locations.length, 2);
  assert.deepEqual(locations.map((l) => l.arrayIndex), [0, 1]);
});
