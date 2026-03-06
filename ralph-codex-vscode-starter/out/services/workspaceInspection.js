"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizePackageJson = summarizePackageJson;
exports.detectPackageManagers = detectPackageManagers;
exports.inferTestSignals = inferTestSignals;
const LIFECYCLE_SCRIPT_ORDER = ['lint', 'test', 'build', 'compile', 'typecheck'];
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
function summarizePackageJson(pkg) {
    const candidate = typeof pkg === 'object' && pkg !== null ? pkg : {};
    const scriptsCandidate = typeof candidate.scripts === 'object' && candidate.scripts !== null
        ? candidate.scripts
        : {};
    const scriptNames = Object.keys(scriptsCandidate);
    const packageManager = normalizePackageManager(typeof candidate.packageManager === 'string' ? candidate.packageManager : null);
    const lifecycleCommands = LIFECYCLE_SCRIPT_ORDER
        .filter((script) => scriptNames.includes(script))
        .map((script) => scriptCommand(packageManager, script));
    const testSignals = new Set();
    if (scriptNames.includes('test')) {
        testSignals.add('package.json defines a test script.');
    }
    if (scriptNames.includes('lint')) {
        testSignals.add('package.json defines a lint script.');
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
    if (names.has('global.json') || fileNames.some((name) => name.endsWith('.sln'))) {
        managers.add('dotnet');
    }
    return Array.from(managers);
}
function inferTestSignals(manifests, docs, packageJson) {
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
    if (manifests.includes('global.json') || manifests.some((manifest) => manifest.endsWith('.sln'))) {
        signals.add('dotnet test is likely available.');
    }
    if (docs.some((item) => item.toLowerCase().startsWith('readme'))) {
        signals.add('README.md may define the canonical build/test commands.');
    }
    return Array.from(signals);
}
//# sourceMappingURL=workspaceInspection.js.map