import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectDoctrineContext,
  createDoctrinePack,
  DOCTRINE_REPAIR_COMMAND_LABEL,
  DOCTRINE_MARKDOWN_FILES,
  inspectDoctrinePack,
  PROTECTED_DOCTRINE_FILES
} from '../src/ralph/doctrine';

const GENERATED_AT = '2026-04-29T00:00:00.000Z';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-doctrine-'));
}

test('createDoctrinePack creates all required doctrine files with a valid evidence index', async () => {
  const rootPath = await makeTempRoot();

  const result = await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });

  assert.equal(result.createdPaths.length, DOCTRINE_MARKDOWN_FILES.length + 1);
  for (const fileName of [...DOCTRINE_MARKDOWN_FILES, 'evidence-index.json']) {
    await fs.access(path.join(rootPath, '.ralph', 'doctrine', fileName));
  }

  const evidenceIndex = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'doctrine', 'evidence-index.json'), 'utf8')
  );
  assert.equal(evidenceIndex.schemaVersion, 1);
  assert.equal(evidenceIndex.generatedAt, GENERATED_AT);
  assert.equal(evidenceIndex.doctrineRoot, '.ralph/doctrine');
  assert.deepEqual(evidenceIndex.evidence, []);

  const inspection = await inspectDoctrinePack(rootPath);
  assert.equal(inspection.health, 'healthy');
  assert.deepEqual(inspection.protectedFiles, PROTECTED_DOCTRINE_FILES);
});

test('createDoctrinePack does not overwrite existing doctrine files', async () => {
  const rootPath = await makeTempRoot();
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  const protectedPath = path.join(doctrineDir, 'invariants.md');
  await fs.writeFile(protectedPath, '# Existing doctrine\n\nOperator-owned content.\n', 'utf8');

  const result = await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });

  assert.equal(await fs.readFile(protectedPath, 'utf8'), '# Existing doctrine\n\nOperator-owned content.\n');
  assert.ok(!result.createdPaths.includes(protectedPath));
  assert.ok(result.existingPaths.includes(protectedPath));
  await fs.access(path.join(doctrineDir, 'project-profile.md'));
});

test('createDoctrinePack completes a partially existing doctrine folder', async () => {
  const rootPath = await makeTempRoot();
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  await fs.writeFile(path.join(doctrineDir, 'project-profile.md'), '# Existing profile\n', 'utf8');

  const result = await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });

  assert.equal(result.createdPaths.length, DOCTRINE_MARKDOWN_FILES.length);
  assert.ok(result.existingPaths.includes(path.join(doctrineDir, 'project-profile.md')));
  await fs.access(path.join(doctrineDir, 'evidence-index.json'));
  await fs.access(path.join(doctrineDir, 'risks.md'));
  assert.equal(await fs.readFile(path.join(doctrineDir, 'project-profile.md'), 'utf8'), '# Existing profile\n');
});

test('createDoctrinePack repairs an invalid evidence index without overwriting doctrine markdown files', async () => {
  const rootPath = await makeTempRoot();
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  const agentsPath = path.join(doctrineDir, 'agents.md');
  const evidenceIndexPath = path.join(doctrineDir, 'evidence-index.json');
  await fs.writeFile(agentsPath, [
    '# Custom Agents',
    '',
    '## Purpose',
    '',
    'Human-owned rules.',
    '',
    '## Source Of Truth',
    '',
    '- Human review.',
    '',
    '## Protected Status',
    '',
    '- Protected: yes.',
    '',
    '## Working Rules',
    '',
    '- Stay deterministic.',
    '',
    '## Provider Boundaries',
    '',
    '- Providers must not rewrite this file.',
    '',
    '## Prompt Context Rules',
    '',
    '- Keep context compact.',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(evidenceIndexPath, '{not json', 'utf8');

  const result = await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });

  assert.match(await fs.readFile(agentsPath, 'utf8'), /## Working Rules/);
  assert.ok(result.existingPaths.includes(agentsPath));
  assert.ok(result.repairedPaths.includes(evidenceIndexPath));

  const evidenceIndex = JSON.parse(await fs.readFile(evidenceIndexPath, 'utf8'));
  assert.equal(evidenceIndex.schemaVersion, 1);
  assert.equal(evidenceIndex.generatedAt, GENERATED_AT);
  assert.equal(evidenceIndex.doctrineRoot, '.ralph/doctrine');
  assert.deepEqual(evidenceIndex.evidence, []);

  const inspection = await inspectDoctrinePack(rootPath);
  assert.equal(inspection.health, 'healthy');
});

test('inspectDoctrinePack detects a missing required doctrine file', async () => {
  const rootPath = await makeTempRoot();
  await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });
  await fs.unlink(path.join(rootPath, '.ralph', 'doctrine', 'risks.md'));

  const inspection = await inspectDoctrinePack(rootPath);

  assert.equal(inspection.health, 'incomplete');
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'doctrine_required_file_missing'));
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.message.includes(DOCTRINE_REPAIR_COMMAND_LABEL)));
});

test('inspectDoctrinePack detects a missing required heading', async () => {
  const rootPath = await makeTempRoot();
  await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });
  await fs.writeFile(path.join(rootPath, '.ralph', 'doctrine', 'project-profile.md'), '# Project Profile\n\n## Purpose\n\nOnly one heading.\n', 'utf8');

  const inspection = await inspectDoctrinePack(rootPath);

  assert.equal(inspection.health, 'incomplete');
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'doctrine_required_heading_missing'));
});

test('inspectDoctrinePack detects invalid evidence-index JSON', async () => {
  const rootPath = await makeTempRoot();
  await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });
  await fs.writeFile(path.join(rootPath, '.ralph', 'doctrine', 'evidence-index.json'), '{not json', 'utf8');

  const inspection = await inspectDoctrinePack(rootPath);

  assert.equal(inspection.health, 'invalid evidence index');
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'doctrine_evidence_index_invalid'));
});

test('collectDoctrineContext returns entries for all files when all are present and budget not exceeded', async () => {
  const rootPath = await makeTempRoot();
  await createDoctrinePack(rootPath, { generatedAt: GENERATED_AT });

  const ctx = await collectDoctrineContext(rootPath);

  assert.equal(ctx.entries.length, DOCTRINE_MARKDOWN_FILES.length);
  assert.ok(ctx.entries.every((e) => !e.truncated));
  assert.ok(ctx.totalChars <= ctx.budgetChars);
  assert.equal(ctx.budgetExceeded, false);
  const protectedNames = new Set(PROTECTED_DOCTRINE_FILES as readonly string[]);
  for (const entry of ctx.entries) {
    assert.equal(entry.isProtected, protectedNames.has(entry.fileName));
    assert.equal(entry.relativePath, `.ralph/doctrine/${entry.fileName}`);
  }
});

test('collectDoctrineContext returns empty entries when doctrine directory is missing', async () => {
  const rootPath = await makeTempRoot();

  const ctx = await collectDoctrineContext(rootPath);

  assert.equal(ctx.entries.length, 0);
  assert.equal(ctx.totalChars, 0);
  assert.equal(ctx.budgetExceeded, false);
});

test('collectDoctrineContext returns only existing files when doctrine is partial', async () => {
  const rootPath = await makeTempRoot();
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  await fs.writeFile(path.join(doctrineDir, 'project-profile.md'), '# Project Profile\n', 'utf8');
  await fs.writeFile(path.join(doctrineDir, 'invariants.md'), '# Invariants\n', 'utf8');

  const ctx = await collectDoctrineContext(rootPath);

  assert.equal(ctx.entries.length, 2);
  assert.ok(ctx.entries.some((e) => e.fileName === 'project-profile.md'));
  assert.ok(ctx.entries.some((e) => e.fileName === 'invariants.md'));
});

test('collectDoctrineContext truncates files when budget is exceeded', async () => {
  const rootPath = await makeTempRoot();
  const doctrineDir = path.join(rootPath, '.ralph', 'doctrine');
  await fs.mkdir(doctrineDir, { recursive: true });
  const longContent = 'x'.repeat(500);
  await fs.writeFile(path.join(doctrineDir, 'project-profile.md'), longContent, 'utf8');
  await fs.writeFile(path.join(doctrineDir, 'invariants.md'), longContent, 'utf8');

  // budget of 100 chars → each file gets 50 chars (floor(100/8))
  const ctx = await collectDoctrineContext(rootPath, 100);

  assert.ok(ctx.entries.every((e) => e.truncated));
  assert.ok(ctx.totalChars <= ctx.budgetChars);
});
