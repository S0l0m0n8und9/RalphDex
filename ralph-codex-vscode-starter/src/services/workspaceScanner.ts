import * as fs from 'fs/promises';
import * as path from 'path';
import {
  detectPackageManagers,
  extractCiCommands,
  extractJustTargets,
  extractNamedTargets,
  inferTestSignals,
  inferValidationCommands,
  summarizePackageJson,
  WorkspaceScan
} from './workspaceInspection';

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
  'global.json',
  'Makefile',
  'justfile',
  'docker-compose.yml',
  'docker-compose.yaml'
];

const CI_FILES = ['.gitlab-ci.yml', 'azure-pipelines.yml'];
const DOC_FILES = ['README.md', 'README', 'docs', 'AGENTS.md'];
const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client'];

async function readTextIfExists(target: string): Promise<string | undefined> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return undefined;
  }
}

async function readJsonIfExists(target: string): Promise<unknown | undefined> {
  const raw = await readTextIfExists(target);
  if (raw === undefined) {
    return undefined;
  }

  return JSON.parse(raw) as unknown;
}

async function collectGitHubWorkflowFiles(rootPath: string): Promise<string[]> {
  const workflowDir = path.join(rootPath, '.github', 'workflows');

  try {
    const entries = await fs.readdir(workflowDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')))
      .map((entry) => path.posix.join('.github', 'workflows', entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function collectCiCommands(rootPath: string, ciFiles: string[]): Promise<string[]> {
  const commands: string[] = [];

  for (const ciFile of ciFiles) {
    const raw = await readTextIfExists(path.join(rootPath, ciFile));
    if (!raw) {
      continue;
    }

    commands.push(...extractCiCommands(raw));
  }

  return Array.from(new Set(commands));
}

export async function scanWorkspace(rootPath: string, workspaceName = path.basename(rootPath)): Promise<WorkspaceScan> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const entryNames = entries.map((entry) => entry.name);
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const notes: string[] = [];

  const manifests = MANIFEST_FILES.filter((candidate) => entryNames.includes(candidate));
  const solutionFiles = fileNames.filter((name) => name.endsWith('.sln') || name.endsWith('.csproj'));
  manifests.push(...solutionFiles);

  const docs = DOC_FILES.filter((candidate) => entryNames.includes(candidate));
  const ciFiles = [
    ...CI_FILES.filter((candidate) => entryNames.includes(candidate)),
    ...(await collectGitHubWorkflowFiles(rootPath))
  ];
  const sourceRoots = SOURCE_ROOTS.filter((candidate) => entryNames.includes(candidate));

  let packageJsonSummary = null;
  if (entryNames.includes('package.json')) {
    try {
      const raw = await readJsonIfExists(path.join(rootPath, 'package.json'));
      if (raw === undefined) {
        notes.push('package.json exists but could not be read.');
      } else {
        packageJsonSummary = summarizePackageJson(raw);
      }
    } catch {
      notes.push('package.json exists but could not be parsed.');
    }
  }

  const makeTargets = entryNames.includes('Makefile')
    ? extractNamedTargets(await readTextIfExists(path.join(rootPath, 'Makefile')) ?? '')
    : [];
  const justTargets = entryNames.includes('justfile')
    ? extractJustTargets(await readTextIfExists(path.join(rootPath, 'justfile')) ?? '')
    : [];
  const ciCommands = await collectCiCommands(rootPath, ciFiles);
  const packageManagers = detectPackageManagers(entryNames, packageJsonSummary);
  const lifecycleCommands = packageJsonSummary?.lifecycleCommands ?? [];
  const validationCommands = inferValidationCommands({
    manifests,
    packageJson: packageJsonSummary,
    makeTargets,
    justTargets,
    ciCommands
  });
  const testSignals = inferTestSignals(manifests, docs, packageJsonSummary);
  const projectMarkers = Array.from(new Set([
    ...manifests,
    ...ciFiles,
    ...docs,
    ...sourceRoots
  ]));

  if (makeTargets.length > 0) {
    notes.push(`Makefile targets detected: ${makeTargets.join(', ')}`);
  }
  if (justTargets.length > 0) {
    notes.push(`just targets detected: ${justTargets.join(', ')}`);
  }

  return {
    workspaceName,
    rootPath,
    manifests,
    projectMarkers,
    packageManagers,
    ciFiles,
    ciCommands,
    docs,
    sourceRoots,
    lifecycleCommands,
    validationCommands,
    testSignals,
    notes,
    packageJson: packageJsonSummary
  };
}
