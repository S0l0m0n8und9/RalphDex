import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseCrewRoster } from '../src/ralph/crewRoster';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-crew-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('parseCrewRoster returns null members when crew.json does not exist', async () => {
  await withTempDir(async (dir) => {
    const result = await parseCrewRoster(path.join(dir, 'crew.json'));
    assert.equal(result.members, null);
    assert.deepEqual(result.warnings, []);
  });
});

test('parseCrewRoster parses a valid crew.json with 3 agents', async () => {
  await withTempDir(async (dir) => {
    const crewPath = path.join(dir, 'crew.json');
    const roster = [
      { id: 'planner-1', role: 'planner', goal: 'Decompose the backlog' },
      { id: 'builder-1', role: 'implementer', backstory: 'Specialist in TypeScript' },
      { id: 'reviewer-1', role: 'reviewer' }
    ];
    await fs.writeFile(crewPath, JSON.stringify(roster), 'utf8');

    const result = await parseCrewRoster(crewPath);
    assert.equal(result.warnings.length, 0);
    assert.ok(result.members !== null);
    assert.equal(result.members.length, 3);
    assert.equal(result.members[0].id, 'planner-1');
    assert.equal(result.members[0].role, 'planner');
    assert.equal(result.members[0].goal, 'Decompose the backlog');
    assert.equal(result.members[1].id, 'builder-1');
    assert.equal(result.members[1].role, 'implementer');
    assert.equal(result.members[1].backstory, 'Specialist in TypeScript');
    assert.equal(result.members[2].id, 'reviewer-1');
    assert.equal(result.members[2].role, 'reviewer');
  });
});

test('parseCrewRoster returns warnings for malformed crew.json without crashing', async () => {
  await withTempDir(async (dir) => {
    const crewPath = path.join(dir, 'crew.json');
    await fs.writeFile(crewPath, 'not valid json }{', 'utf8');

    const result = await parseCrewRoster(crewPath);
    assert.ok(result.members !== null);
    assert.equal(result.members.length, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].toLowerCase().includes('not valid json') || result.warnings[0].toLowerCase().includes('json'));
  });
});

test('parseCrewRoster warns and skips entries with missing id', async () => {
  await withTempDir(async (dir) => {
    const crewPath = path.join(dir, 'crew.json');
    const roster = [
      { role: 'implementer' },
      { id: 'builder-1', role: 'implementer' }
    ];
    await fs.writeFile(crewPath, JSON.stringify(roster), 'utf8');

    const result = await parseCrewRoster(crewPath);
    assert.ok(result.members !== null);
    assert.equal(result.members.length, 1);
    assert.equal(result.members[0].id, 'builder-1');
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('"id"'));
  });
});

test('parseCrewRoster warns and skips entries with invalid role', async () => {
  await withTempDir(async (dir) => {
    const crewPath = path.join(dir, 'crew.json');
    const roster = [
      { id: 'agent-1', role: 'unknown-role' },
      { id: 'agent-2', role: 'implementer' }
    ];
    await fs.writeFile(crewPath, JSON.stringify(roster), 'utf8');

    const result = await parseCrewRoster(crewPath);
    assert.ok(result.members !== null);
    assert.equal(result.members.length, 1);
    assert.equal(result.members[0].id, 'agent-2');
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('invalid role'));
  });
});

test('parseCrewRoster returns warning when crew.json is not an array', async () => {
  await withTempDir(async (dir) => {
    const crewPath = path.join(dir, 'crew.json');
    await fs.writeFile(crewPath, JSON.stringify({ id: 'agent-1', role: 'implementer' }), 'utf8');

    const result = await parseCrewRoster(crewPath);
    assert.ok(result.members !== null);
    assert.equal(result.members.length, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('array'));
  });
});
