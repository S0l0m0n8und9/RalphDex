import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import {
  inferStructureDefinition,
  generateStructureDefinition
} from '../src/ralph/structureInference';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-structure-infer-'));
}

test('inferStructureDefinition assigns correct roles to well-known directories', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'test'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'docs'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(rootPath, '.ralph'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'dist'), { recursive: true });
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({ name: 'demo' }));

  const result = await inferStructureDefinition(rootPath);

  assert.equal(result.version, 1);
  const byPath = new Map(result.directories.map((d) => [d.path, d]));
  assert.equal(byPath.get('src')?.role, 'source');
  assert.equal(byPath.get('test')?.role, 'test');
  assert.equal(byPath.get('docs')?.role, 'docs');
  assert.equal(byPath.get('scripts')?.role, 'scripts');
  assert.equal(byPath.get('.ralph')?.role, 'state');
  assert.equal(byPath.get('dist')?.role, 'output');
});

test('inferStructureDefinition includes config files as config-role entries', async () => {
  const rootPath = await makeTempRoot();
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({ name: 'demo' }));
  await fs.writeFile(path.join(rootPath, 'tsconfig.json'), JSON.stringify({}));

  const result = await inferStructureDefinition(rootPath);

  assert.equal(result.version, 1);
  const byPath = new Map(result.directories.map((d) => [d.path, d]));
  assert.equal(byPath.get('.')?.role, 'config');
});

test('inferStructureDefinition handles empty directory gracefully', async () => {
  const rootPath = await makeTempRoot();

  const result = await inferStructureDefinition(rootPath);

  assert.equal(result.version, 1);
  assert.ok(Array.isArray(result.directories));
});

test('generateStructureDefinition writes the file when it does not exist', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'test'), { recursive: true });
  const outputPath = path.join(rootPath, '.ralph', 'structure.json');
  await fs.mkdir(path.join(rootPath, '.ralph'), { recursive: true });

  const outcome = await generateStructureDefinition(rootPath, outputPath);

  assert.equal(outcome.written, true);
  const raw = await fs.readFile(outputPath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, 1);
  assert.ok(Array.isArray(parsed.directories));
  const byPath = Object.fromEntries(parsed.directories.map((d: { path: string; role: string }) => [d.path, d]));
  assert.ok(byPath['src'] || byPath['test']);
});

test('generateStructureDefinition does not overwrite an existing file', async () => {
  const rootPath = await makeTempRoot();
  const outputPath = path.join(rootPath, 'structure.json');
  const existing = JSON.stringify({ version: 1, directories: [{ path: 'existing', role: 'other' }] });
  await fs.writeFile(outputPath, existing, 'utf8');

  const outcome = await generateStructureDefinition(rootPath, outputPath);

  assert.equal(outcome.written, false);
  const raw = await fs.readFile(outputPath, 'utf8');
  assert.equal(raw, existing);
});

test('generateStructureDefinition creates parent directory if needed', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  const outputPath = path.join(rootPath, 'nested', 'dir', 'structure.json');

  const outcome = await generateStructureDefinition(rootPath, outputPath);

  assert.equal(outcome.written, true);
  const raw = await fs.readFile(outputPath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, 1);
});

test('generateStructureDefinition writes a well-formed structure definition for a representative repo tree', async () => {
  const rootPath = await makeTempRoot();
  await Promise.all([
    fs.mkdir(path.join(rootPath, 'src'), { recursive: true }),
    fs.mkdir(path.join(rootPath, 'test'), { recursive: true }),
    fs.mkdir(path.join(rootPath, 'docs'), { recursive: true }),
    fs.mkdir(path.join(rootPath, '.github'), { recursive: true }),
    fs.mkdir(path.join(rootPath, 'assets'), { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({ name: 'fixture-repo' }), 'utf8'),
    fs.writeFile(path.join(rootPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }), 'utf8')
  ]);

  const outputPath = path.join(rootPath, '.ralph', 'structure.json');
  const outcome = await generateStructureDefinition(rootPath, outputPath);
  const parsed = JSON.parse(await fs.readFile(outputPath, 'utf8')) as {
    version: number;
    directories: Array<{ path: string; role: string; description?: string }>;
  };
  const byPath = new Map(parsed.directories.map((entry) => [entry.path, entry]));

  assert.equal(outcome.written, true);
  assert.equal(parsed.version, 1);
  assert.deepEqual(
    [...byPath.entries()]
      .filter(([entryPath]) => ['src', 'test', 'docs', '.github', 'assets', '.'].includes(entryPath))
      .map(([entryPath, entry]) => [entryPath, entry.role])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ['.', 'config'],
      ['.github', 'config'],
      ['assets', 'assets'],
      ['docs', 'docs'],
      ['src', 'source'],
      ['test', 'test']
    ]
  );
});
