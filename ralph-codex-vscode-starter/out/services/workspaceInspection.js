"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizePackageJson = summarizePackageJson;
exports.detectPackageManagers = detectPackageManagers;
exports.inferTestSignals = inferTestSignals;
exports.extractNamedTargets = extractNamedTargets;
exports.extractJustTargets = extractJustTargets;
exports.extractCiCommands = extractCiCommands;
exports.inferValidationCommands = inferValidationCommands;
const LIFECYCLE_SCRIPT_ORDER = ['validate', 'check', 'lint', 'test', 'build', 'compile', 'typecheck'];
const VALIDATION_TARGET_ORDER = ['validate', 'check', 'lint', 'test', 'build', 'compile', 'typecheck'];
const CI_COMMAND_PATTERNS = [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[a-z0-9:_-]+/gi,
    /\bpytest\b(?:\s+[^\n\r#]+)?/gi,
    /\bcargo\s+(?:test|check)\b(?:\s+[^\n\r#]+)?/gi,
    /\bgo\s+test\b(?:\s+[^\n\r#]+)?/gi,
    /\bdotnet\s+test\b(?:\s+[^\n\r#]+)?/gi,
    /\bmake\s+[a-z0-9:_-]+/gi,
    /\bjust\s+[a-z0-9:_-]+/gi
];
function uniqueOrdered(values) {
    const seen = new Set();
    const ordered = [];
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
function normalizePackageManager(value) {
    if (!value) {
        return null;
    }
    const normalized = value.split('@')[0]?.trim();
    return normalized || null;
}
function scriptCommand(packageManager, script) {
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
function collectScriptCommands(scriptNames, preferredOrder, packageManager) {
    const commands = [];
    const available = [...scriptNames].sort();
    for (const prefix of preferredOrder) {
        const matches = available.filter((script) => script === prefix || script.startsWith(`${prefix}:`));
        commands.push(...matches.map((script) => scriptCommand(packageManager, script)));
    }
    return uniqueOrdered(commands);
}
function summarizePackageJson(pkg) {
    const candidate = typeof pkg === 'object' && pkg !== null ? pkg : {};
    const scriptsCandidate = typeof candidate.scripts === 'object' && candidate.scripts !== null
        ? candidate.scripts
        : {};
    const scriptNames = Object.keys(scriptsCandidate);
    const packageManager = normalizePackageManager(typeof candidate.packageManager === 'string' ? candidate.packageManager : null);
    const lifecycleCommands = collectScriptCommands(scriptNames, LIFECYCLE_SCRIPT_ORDER, packageManager);
    const validationCommands = collectScriptCommands(scriptNames, VALIDATION_TARGET_ORDER, packageManager);
    const testSignals = new Set();
    if (scriptNames.some((name) => name === 'test' || name.startsWith('test:'))) {
        testSignals.add('package.json defines a test script.');
    }
    if (scriptNames.some((name) => name === 'lint' || name.startsWith('lint:'))) {
        testSignals.add('package.json defines a lint script.');
    }
    if (scriptNames.some((name) => ['validate', 'check'].some((prefix) => name === prefix || name.startsWith(`${prefix}:`)))) {
        testSignals.add('package.json defines a validate/check script.');
    }
    if (scriptNames.some((name) => ['build', 'compile', 'typecheck'].some((prefix) => name === prefix || name.startsWith(`${prefix}:`)))) {
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
function detectPackageManagers(fileNames, packageJson) {
    const managers = new Set();
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
function inferTestSignals(manifests, docs, tests, packageJson) {
    const signals = new Set(packageJson?.testSignals ?? []);
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
    if (tests.length > 0) {
        signals.add(`Detected test roots: ${tests.join(', ')}.`);
    }
    return Array.from(signals);
}
function extractNamedTargets(raw) {
    const targets = new Set();
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
function extractJustTargets(raw) {
    const targets = new Set();
    for (const line of raw.split('\n')) {
        const match = line.match(/^([A-Za-z0-9_-]+)(?:\s+[A-Za-z0-9_-]+)*:\s*$/);
        if (!match) {
            continue;
        }
        targets.add(match[1]);
    }
    return Array.from(targets);
}
function extractCiCommands(raw) {
    const commands = [];
    for (const pattern of CI_COMMAND_PATTERNS) {
        const matches = raw.match(pattern);
        if (matches) {
            commands.push(...matches);
        }
    }
    return uniqueOrdered(commands);
}
function inferValidationCommands(input) {
    const commands = new Set(input.packageJson?.validationCommands ?? []);
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
        commands.add('python -m pytest');
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
//# sourceMappingURL=workspaceInspection.js.map