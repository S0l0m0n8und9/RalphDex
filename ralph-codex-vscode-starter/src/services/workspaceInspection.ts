export interface PackageJsonSummary {
  name: string | null;
  packageManager: string | null;
  hasWorkspaces: boolean;
  scriptNames: string[];
  lifecycleCommands: string[];
  validationCommands: string[];
  testSignals: string[];
}

export interface WorkspaceScan {
  workspaceName: string;
  rootPath: string;
  manifests: string[];
  projectMarkers: string[];
  packageManagers: string[];
  ciFiles: string[];
  ciCommands: string[];
  docs: string[];
  sourceRoots: string[];
  lifecycleCommands: string[];
  validationCommands: string[];
  testSignals: string[];
  notes: string[];
  packageJson: PackageJsonSummary | null;
}

const LIFECYCLE_SCRIPT_ORDER = ['validate', 'check', 'lint', 'test', 'build', 'compile', 'typecheck'];
const VALIDATION_TARGET_ORDER = ['validate', 'check', 'lint', 'test', 'build', 'compile'];
const CI_COMMAND_PATTERNS = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[a-z0-9:_-]+/gi,
  /\bpytest\b(?:\s+[^\n\r#]+)?/gi,
  /\bcargo\s+(?:test|check)\b(?:\s+[^\n\r#]+)?/gi,
  /\bgo\s+test\b(?:\s+[^\n\r#]+)?/gi,
  /\bdotnet\s+test\b(?:\s+[^\n\r#]+)?/gi,
  /\bmake\s+[a-z0-9:_-]+/gi,
  /\bjust\s+[a-z0-9:_-]+/gi
];

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

function normalizePackageManager(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.split('@')[0]?.trim();
  return normalized || null;
}

function scriptCommand(packageManager: string | null, script: string): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

export function summarizePackageJson(pkg: unknown): PackageJsonSummary {
  const candidate = typeof pkg === 'object' && pkg !== null ? (pkg as Record<string, unknown>) : {};
  const scriptsCandidate = typeof candidate.scripts === 'object' && candidate.scripts !== null
    ? candidate.scripts as Record<string, unknown>
    : {};
  const scriptNames = Object.keys(scriptsCandidate);
  const packageManager = normalizePackageManager(typeof candidate.packageManager === 'string' ? candidate.packageManager : null);
  const lifecycleCommands = LIFECYCLE_SCRIPT_ORDER
    .filter((script) => scriptNames.includes(script))
    .map((script) => scriptCommand(packageManager, script));

  const validationCommands = VALIDATION_TARGET_ORDER
    .filter((script) => scriptNames.includes(script))
    .map((script) => scriptCommand(packageManager, script));

  const testSignals = new Set<string>();
  if (scriptNames.includes('test')) {
    testSignals.add('package.json defines a test script.');
  }
  if (scriptNames.includes('lint')) {
    testSignals.add('package.json defines a lint script.');
  }
  if (scriptNames.includes('validate') || scriptNames.includes('check')) {
    testSignals.add('package.json defines a validate/check script.');
  }
  if (scriptNames.includes('build') || scriptNames.includes('compile')) {
    testSignals.add('package.json defines a build/compile script.');
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : null,
    packageManager,
    hasWorkspaces: Array.isArray(candidate.workspaces) || typeof candidate.workspaces === 'object',
    scriptNames,
    lifecycleCommands,
    validationCommands,
    testSignals: Array.from(testSignals)
  };
}

export function detectPackageManagers(fileNames: string[], packageJson: PackageJsonSummary | null): string[] {
  const managers = new Set<string>();
  const names = new Set(fileNames);

  if (packageJson?.packageManager) {
    managers.add(packageJson.packageManager);
  }
  if (names.has('package-lock.json') || names.has('package.json')) {
    managers.add('npm');
  }
  if (names.has('pnpm-lock.yaml') || names.has('pnpm-workspace.yaml')) {
    managers.add('pnpm');
  }
  if (names.has('yarn.lock')) {
    managers.add('yarn');
  }
  if (names.has('bun.lockb') || names.has('bun.lock')) {
    managers.add('bun');
  }
  if (names.has('pyproject.toml') || names.has('requirements.txt')) {
    managers.add('python');
  }
  if (names.has('Cargo.toml')) {
    managers.add('cargo');
  }
  if (names.has('go.mod')) {
    managers.add('go');
  }
  if (names.has('pom.xml') || names.has('build.gradle') || names.has('build.gradle.kts')) {
    managers.add('java');
  }
  if (names.has('global.json') || fileNames.some((name) => name.endsWith('.sln') || name.endsWith('.csproj'))) {
    managers.add('dotnet');
  }

  return Array.from(managers);
}

export function inferTestSignals(
  manifests: string[],
  docs: string[],
  packageJson: PackageJsonSummary | null
): string[] {
  const signals = new Set<string>(packageJson?.testSignals ?? []);

  if (manifests.includes('pyproject.toml') || manifests.includes('requirements.txt')) {
    signals.add('Check pytest/tox/nox configuration.');
  }
  if (manifests.includes('Cargo.toml')) {
    signals.add('cargo test is likely available.');
  }
  if (manifests.includes('go.mod')) {
    signals.add('go test is likely available.');
  }
  if (manifests.includes('global.json') || manifests.some((manifest) => manifest.endsWith('.sln') || manifest.endsWith('.csproj'))) {
    signals.add('dotnet test is likely available.');
  }
  if (manifests.includes('Makefile')) {
    signals.add('Makefile targets may define the canonical validation entrypoint.');
  }
  if (manifests.includes('justfile')) {
    signals.add('just targets may define the canonical validation entrypoint.');
  }
  if (docs.some((item) => item.toLowerCase().startsWith('readme'))) {
    signals.add('README.md may define the canonical build/test commands.');
  }

  return Array.from(signals);
}

export function extractNamedTargets(raw: string): string[] {
  const targets = new Set<string>();

  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:/);
    if (!match) {
      continue;
    }

    const target = match[1];
    if (!target.startsWith('.')) {
      targets.add(target);
    }
  }

  return Array.from(targets);
}

export function extractJustTargets(raw: string): string[] {
  const targets = new Set<string>();

  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)(?:\s+[A-Za-z0-9_-]+)*:\s*$/);
    if (!match) {
      continue;
    }

    targets.add(match[1]);
  }

  return Array.from(targets);
}

export function extractCiCommands(raw: string): string[] {
  const commands: string[] = [];

  for (const pattern of CI_COMMAND_PATTERNS) {
    const matches = raw.match(pattern);
    if (matches) {
      commands.push(...matches);
    }
  }

  return uniqueOrdered(commands);
}

export interface ValidationCommandInput {
  manifests: string[];
  packageJson: PackageJsonSummary | null;
  makeTargets?: string[];
  justTargets?: string[];
  ciCommands?: string[];
}

export function inferValidationCommands(input: ValidationCommandInput): string[] {
  const commands = new Set<string>(input.packageJson?.validationCommands ?? []);
  const makeTargets = new Set(input.makeTargets ?? []);
  const justTargets = new Set(input.justTargets ?? []);

  for (const target of VALIDATION_TARGET_ORDER) {
    if (makeTargets.has(target)) {
      commands.add(`make ${target}`);
    }
  }

  for (const target of VALIDATION_TARGET_ORDER) {
    if (justTargets.has(target)) {
      commands.add(`just ${target}`);
    }
  }

  if (input.manifests.includes('pyproject.toml') || input.manifests.includes('requirements.txt')) {
    commands.add('pytest');
  }
  if (input.manifests.includes('Cargo.toml')) {
    commands.add('cargo test');
    commands.add('cargo check');
  }
  if (input.manifests.includes('go.mod')) {
    commands.add('go test ./...');
  }
  if (input.manifests.includes('global.json') || input.manifests.some((manifest) => manifest.endsWith('.sln') || manifest.endsWith('.csproj'))) {
    commands.add('dotnet test');
  }

  for (const command of input.ciCommands ?? []) {
    commands.add(command);
  }

  return uniqueOrdered(commands);
}
