import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StructureDefinition,
  StructureDirectoryEntry,
  StructureDirectoryRole
} from './structureDefinition';

const ROLE_MAP: ReadonlyMap<string, StructureDirectoryRole> = new Map([
  ['src', 'source'],
  ['source', 'source'],
  ['lib', 'source'],
  ['test', 'test'],
  ['tests', 'test'],
  ['__tests__', 'test'],
  ['spec', 'test'],
  ['specs', 'test'],
  ['docs', 'docs'],
  ['doc', 'docs'],
  ['documentation', 'docs'],
  ['scripts', 'scripts'],
  ['script', 'scripts'],
  ['bin', 'scripts'],
  ['tools', 'scripts'],
  ['.ralph', 'state'],
  ['dist', 'output'],
  ['out', 'output'],
  ['build', 'output'],
  ['output', 'output'],
  ['.next', 'output'],
  ['coverage', 'output'],
  ['assets', 'assets'],
  ['static', 'assets'],
  ['public', 'assets'],
  ['media', 'assets'],
  ['images', 'assets'],
  ['config', 'config'],
  ['.github', 'config'],
  ['.vscode', 'config'],
  ['node_modules', 'other']
]);

const CONFIG_FILE_INDICATORS = [
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.prettierrc',
  'jest.config.js',
  'jest.config.ts',
  'vitest.config.ts',
  'webpack.config.js',
  'rollup.config.js',
  '.babelrc',
  'Makefile',
  'pyproject.toml',
  'setup.py',
  'Cargo.toml',
  'go.mod'
];

const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.pnpm-store',
  '.yarn',
  '.npm',
  '.cache',
  '.venv',
  'venv',
  '__pycache__'
]);

function inferDirRole(name: string): StructureDirectoryRole {
  return ROLE_MAP.get(name.toLowerCase()) ?? 'other';
}

export async function inferStructureDefinition(rootPath: string): Promise<StructureDefinition> {
  const directories: StructureDirectoryEntry[] = [];

  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return { version: 1, directories };
  }

  const dirNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !IGNORED_DIRECTORY_NAMES.has(name.toLowerCase()));

  const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));

  for (const name of dirNames) {
    directories.push({
      path: name,
      role: inferDirRole(name),
      description: `Inferred from directory name.`
    });
  }

  const hasConfigFiles = CONFIG_FILE_INDICATORS.some((indicator) => fileNames.has(indicator));
  if (hasConfigFiles) {
    directories.push({
      path: '.',
      role: 'config',
      description: 'Root-level configuration files.'
    });
  }

  return { version: 1, directories };
}

export interface GenerateStructureOutcome {
  written: boolean;
  reason: string;
}

export async function generateStructureDefinition(
  rootPath: string,
  outputPath: string
): Promise<GenerateStructureOutcome> {
  try {
    await fs.access(outputPath);
    return { written: false, reason: 'File already exists; skipped to avoid overwrite.' };
  } catch {
    // file absent — proceed
  }

  const definition = await inferStructureDefinition(rootPath);
  const content = JSON.stringify(definition, null, 2);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, 'utf8');

  return { written: true, reason: 'Structure definition inferred and written.' };
}
