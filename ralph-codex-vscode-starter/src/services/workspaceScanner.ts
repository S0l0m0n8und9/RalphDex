import * as fs from 'fs/promises';
import * as path from 'path';
import {
  detectPackageManagers,
  extractCiCommands,
  extractJustTargets,
  extractNamedTargets,
  inferTestSignals,
  inferValidationCommands,
  RepoRootCandidate,
  RepoRootSelection,
  summarizePackageJson,
  WorkspaceCommandEvidence,
  WorkspaceFieldEvidence,
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

const PACKAGE_MANAGER_INDICATOR_FILES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'global.json'
];

const CI_FILES = ['.gitlab-ci.yml', 'azure-pipelines.yml'];
const DOC_FILES = ['README.md', 'README', 'docs', 'AGENTS.md'];
const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client'];
const TEST_ROOTS = ['test', 'tests', '__tests__', 'spec', 'specs'];
const EXCLUDED_CHILD_DIRECTORIES = new Set([
  '.codex',
  '.git',
  '.ralph',
  '.vscode',
  'node_modules'
]);

interface RootEntries {
  entryNames: string[];
  fileNames: string[];
  directoryNames: string[];
}

function uniqueOrdered(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function buildFieldEvidence(checked: string[], matches: string[], label: string): WorkspaceFieldEvidence {
  return {
    checked,
    matches,
    emptyReason: matches.length > 0
      ? null
      : `No ${label} matched among ${checked.length} shallow root checks.`
  };
}

function buildCommandEvidence(input: {
  selected: string[];
  packageJsonScripts?: string[];
  makeTargets?: string[];
  justTargets?: string[];
  ciCommands?: string[];
  manifestSignals?: string[];
}): WorkspaceCommandEvidence {
  return {
    selected: input.selected,
    packageJsonScripts: input.packageJsonScripts ?? [],
    makeTargets: input.makeTargets ?? [],
    justTargets: input.justTargets ?? [],
    ciCommands: input.ciCommands ?? [],
    manifestSignals: input.manifestSignals ?? [],
    emptyReason: input.selected.length > 0
      ? null
      : 'No shallow command sources produced a candidate command.'
  };
}

async function readRootEntries(rootPath: string): Promise<RootEntries> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const entryNames = entries.map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  const fileNames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const directoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return {
    entryNames,
    fileNames,
    directoryNames
  };
}

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

  return uniqueOrdered(commands);
}

function candidateMarkers(entries: RootEntries): string[] {
  const manifests = MANIFEST_FILES.filter((candidate) => entries.entryNames.includes(candidate));
  const docs = DOC_FILES.filter((candidate) => entries.entryNames.includes(candidate));
  const sourceRoots = SOURCE_ROOTS.filter((candidate) => entries.entryNames.includes(candidate));
  const tests = TEST_ROOTS.filter((candidate) => entries.entryNames.includes(candidate));
  const ciFiles = CI_FILES.filter((candidate) => entries.entryNames.includes(candidate));
  const solutionFiles = entries.fileNames.filter((name) => name.endsWith('.sln') || name.endsWith('.csproj'));

  return uniqueOrdered([
    ...manifests,
    ...docs,
    ...sourceRoots,
    ...tests,
    ...ciFiles,
    ...solutionFiles
  ]);
}

function buildCandidate(pathToCandidate: string, workspaceRootPath: string, entries: RootEntries): RepoRootCandidate {
  const markers = candidateMarkers(entries);

  return {
    path: pathToCandidate,
    relativePath: path.relative(workspaceRootPath, pathToCandidate) || '.',
    markerCount: markers.length,
    markers
  };
}

async function chooseScanRoot(
  workspaceRootPath: string,
  focusPath?: string | null
): Promise<{ selectedRootPath: string; rootSelection: RepoRootSelection }> {
  const workspaceEntries = await readRootEntries(workspaceRootPath);
  const workspaceCandidate = buildCandidate(workspaceRootPath, workspaceRootPath, workspaceEntries);
  const childEntries = await Promise.all(workspaceEntries.directoryNames
    .filter((directory) => !EXCLUDED_CHILD_DIRECTORIES.has(directory))
    .map(async (directory) => {
      const candidatePath = path.join(workspaceRootPath, directory);

      try {
        const entries = await readRootEntries(candidatePath);
        return buildCandidate(candidatePath, workspaceRootPath, entries);
      } catch {
        return null;
      }
    }));
  const childCandidates = childEntries.filter((candidate): candidate is RepoRootCandidate => candidate !== null);
  const candidates = [workspaceCandidate, ...childCandidates]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const focusedCandidate = focusPath
    ? childCandidates.find((candidate) => focusPath.startsWith(`${candidate.path}${path.sep}`) || focusPath === candidate.path)
    : null;

  let selected = workspaceCandidate;
  let strategy: RepoRootSelection['strategy'] = 'workspaceRoot';
  let summary = 'Using the workspace root because it already exposes shallow repo markers.';

  if (focusedCandidate && focusedCandidate.markerCount > 0) {
    selected = focusedCandidate;
    strategy = 'focusedChild';
    summary = `Using focused child ${focusedCandidate.relativePath} because it contains the active work and exposes shallow repo markers.`;
  } else if (workspaceCandidate.markerCount === 0) {
    const bestChild = [...childCandidates]
      .sort((left, right) => {
        if (right.markerCount !== left.markerCount) {
          return right.markerCount - left.markerCount;
        }

        return left.relativePath.localeCompare(right.relativePath);
      })[0];

    if (bestChild && bestChild.markerCount > 0) {
      selected = bestChild;
      strategy = 'scoredChild';
      summary = `Using child ${bestChild.relativePath} because the workspace root had no shallow repo markers.`;
    } else {
      summary = 'Using the workspace root because no immediate child exposed stronger shallow repo markers.';
    }
  }

  return {
    selectedRootPath: selected.path,
    rootSelection: {
      workspaceRootPath,
      selectedRootPath: selected.path,
      strategy,
      summary,
      candidates
    }
  };
}

export async function scanWorkspace(
  workspaceRootPath: string,
  workspaceName = path.basename(workspaceRootPath),
  options: {
    focusPath?: string | null;
  } = {}
): Promise<WorkspaceScan> {
  const { selectedRootPath, rootSelection } = await chooseScanRoot(workspaceRootPath, options.focusPath);
  const entries = await readRootEntries(selectedRootPath);
  const notes: string[] = [];

  const manifests = MANIFEST_FILES.filter((candidate) => entries.entryNames.includes(candidate));
  const solutionFiles = entries.fileNames.filter((name) => name.endsWith('.sln') || name.endsWith('.csproj'));
  manifests.push(...solutionFiles);

  const docs = DOC_FILES.filter((candidate) => entries.entryNames.includes(candidate));
  const sourceRoots = SOURCE_ROOTS.filter((candidate) => entries.entryNames.includes(candidate));
  const tests = TEST_ROOTS.filter((candidate) => entries.entryNames.includes(candidate));
  const ciFiles = [
    ...CI_FILES.filter((candidate) => entries.entryNames.includes(candidate)),
    ...(await collectGitHubWorkflowFiles(selectedRootPath))
  ];
  const packageManagerIndicators = uniqueOrdered([
    ...PACKAGE_MANAGER_INDICATOR_FILES.filter((candidate) => entries.entryNames.includes(candidate)),
    ...solutionFiles
  ]);

  let packageJsonSummary = null;
  if (entries.entryNames.includes('package.json')) {
    try {
      const raw = await readJsonIfExists(path.join(selectedRootPath, 'package.json'));
      if (raw === undefined) {
        notes.push('package.json exists but could not be read.');
      } else {
        packageJsonSummary = summarizePackageJson(raw);
      }
    } catch {
      notes.push('package.json exists but could not be parsed.');
    }
  }

  const makeTargets = entries.entryNames.includes('Makefile')
    ? extractNamedTargets(await readTextIfExists(path.join(selectedRootPath, 'Makefile')) ?? '')
    : [];
  const justTargets = entries.entryNames.includes('justfile')
    ? extractJustTargets(await readTextIfExists(path.join(selectedRootPath, 'justfile')) ?? '')
    : [];
  const ciCommands = await collectCiCommands(selectedRootPath, ciFiles);
  const packageManagers = detectPackageManagers(entries.entryNames, packageJsonSummary);
  const lifecycleCommands = packageJsonSummary?.lifecycleCommands ?? [];
  const validationCommands = inferValidationCommands({
    manifests,
    packageJson: packageJsonSummary,
    makeTargets,
    justTargets,
    ciCommands
  });
  const testSignals = inferTestSignals(manifests, docs, tests, packageJsonSummary);
  const projectMarkers = uniqueOrdered([
    ...manifests,
    ...ciFiles,
    ...docs,
    ...sourceRoots,
    ...tests
  ]);

  if (makeTargets.length > 0) {
    notes.push(`Makefile targets detected: ${makeTargets.join(', ')}`);
  }
  if (justTargets.length > 0) {
    notes.push(`just targets detected: ${justTargets.join(', ')}`);
  }
  if (selectedRootPath !== workspaceRootPath) {
    notes.push(rootSelection.summary);
  }

  return {
    workspaceName,
    workspaceRootPath,
    rootPath: selectedRootPath,
    rootSelection,
    manifests,
    projectMarkers,
    packageManagers,
    packageManagerIndicators,
    ciFiles,
    ciCommands,
    docs,
    sourceRoots,
    tests,
    lifecycleCommands,
    validationCommands,
    testSignals,
    notes,
    evidence: {
      rootEntries: entries.entryNames,
      manifests: buildFieldEvidence([...MANIFEST_FILES, '*.sln', '*.csproj'], manifests, 'manifests'),
      sourceRoots: buildFieldEvidence(SOURCE_ROOTS, sourceRoots, 'source roots'),
      tests: buildFieldEvidence(TEST_ROOTS, tests, 'test roots'),
      docs: buildFieldEvidence(DOC_FILES, docs, 'docs'),
      ciFiles: buildFieldEvidence([...CI_FILES, '.github/workflows/*.yml'], ciFiles, 'CI files'),
      packageManagers: {
        indicators: packageManagerIndicators,
        detected: packageManagers,
        packageJsonPackageManager: packageJsonSummary?.packageManager ?? null,
        emptyReason: packageManagers.length > 0
          ? null
          : 'No package manager indicators were found at the inspected root.'
      },
      validationCommands: buildCommandEvidence({
        selected: validationCommands,
        packageJsonScripts: packageJsonSummary?.validationCommands ?? [],
        makeTargets: makeTargets.map((target) => `make ${target}`),
        justTargets: justTargets.map((target) => `just ${target}`),
        ciCommands,
        manifestSignals: manifests.filter((manifest) => [
          'pyproject.toml',
          'requirements.txt',
          'Cargo.toml',
          'go.mod',
          'global.json'
        ].includes(manifest))
      }),
      lifecycleCommands: buildCommandEvidence({
        selected: lifecycleCommands,
        packageJsonScripts: packageJsonSummary?.lifecycleCommands ?? []
      })
    },
    packageJson: packageJsonSummary
  };
}
