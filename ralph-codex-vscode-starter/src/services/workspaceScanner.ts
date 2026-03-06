import * as fs from 'fs/promises';
import * as path from 'path';
import { detectPackageManagers, inferTestSignals, summarizePackageJson, WorkspaceScan } from './workspaceInspection';

const MANIFEST_FILES = [
  'package.json',
  'tsconfig.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'global.json'
];

const CI_FILES = ['.github', '.gitlab-ci.yml', 'azure-pipelines.yml'];
const DOC_FILES = ['README.md', 'README', 'docs', 'AGENTS.md'];
const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client'];

async function readJsonIfExists(target: string): Promise<unknown | undefined> {
  try {
    const raw = await fs.readFile(target, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export async function scanWorkspace(rootPath: string, workspaceName = path.basename(rootPath)): Promise<WorkspaceScan> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const entryNames = entries.map((entry) => entry.name);
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const notes: string[] = [];

  const manifests = MANIFEST_FILES.filter((candidate) => entryNames.includes(candidate));
  const solutionFiles = fileNames.filter((name) => name.endsWith('.sln'));
  manifests.push(...solutionFiles);

  const docs = DOC_FILES.filter((candidate) => entryNames.includes(candidate));
  const ciFiles = CI_FILES.filter((candidate) => entryNames.includes(candidate));
  const sourceRoots = SOURCE_ROOTS.filter((candidate) => entryNames.includes(candidate));

  let packageJsonSummary = null;
  if (entryNames.includes('package.json')) {
    const raw = await readJsonIfExists(path.join(rootPath, 'package.json'));
    if (raw === undefined) {
      notes.push('package.json exists but could not be parsed.');
    } else {
      packageJsonSummary = summarizePackageJson(raw);
    }
  }

  const packageManagers = detectPackageManagers(entryNames, packageJsonSummary);
  const lifecycleCommands = packageJsonSummary?.lifecycleCommands ?? [];
  const testSignals = inferTestSignals(manifests, docs, packageJsonSummary);

  return {
    workspaceName,
    rootPath,
    manifests,
    packageManagers,
    ciFiles,
    docs,
    sourceRoots,
    lifecycleCommands,
    testSignals,
    notes,
    packageJson: packageJsonSummary
  };
}
