"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspace = scanWorkspace;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const workspaceInspection_1 = require("./workspaceInspection");
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
function buildFieldEvidence(checked, matches, label) {
    return {
        checked,
        matches,
        emptyReason: matches.length > 0
            ? null
            : `No ${label} matched among ${checked.length} shallow root checks.`
    };
}
function buildCommandEvidence(input) {
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
async function readRootEntries(rootPath) {
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
async function readTextIfExists(target) {
    try {
        return await fs.readFile(target, 'utf8');
    }
    catch {
        return undefined;
    }
}
async function readJsonIfExists(target) {
    const raw = await readTextIfExists(target);
    if (raw === undefined) {
        return undefined;
    }
    return JSON.parse(raw);
}
async function collectGitHubWorkflowFiles(rootPath) {
    const workflowDir = path.join(rootPath, '.github', 'workflows');
    try {
        const entries = await fs.readdir(workflowDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')))
            .map((entry) => path.posix.join('.github', 'workflows', entry.name))
            .sort();
    }
    catch {
        return [];
    }
}
async function collectCiCommands(rootPath, ciFiles) {
    const commands = [];
    for (const ciFile of ciFiles) {
        const raw = await readTextIfExists(path.join(rootPath, ciFile));
        if (!raw) {
            continue;
        }
        commands.push(...(0, workspaceInspection_1.extractCiCommands)(raw));
    }
    return uniqueOrdered(commands);
}
function candidateMarkers(entries) {
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
function buildCandidate(pathToCandidate, workspaceRootPath, entries) {
    const markers = candidateMarkers(entries);
    return {
        path: pathToCandidate,
        relativePath: path.relative(workspaceRootPath, pathToCandidate) || '.',
        markerCount: markers.length,
        markers
    };
}
async function chooseScanRoot(workspaceRootPath, focusPath) {
    const workspaceEntries = await readRootEntries(workspaceRootPath);
    const workspaceCandidate = buildCandidate(workspaceRootPath, workspaceRootPath, workspaceEntries);
    const childEntries = await Promise.all(workspaceEntries.directoryNames
        .filter((directory) => !EXCLUDED_CHILD_DIRECTORIES.has(directory))
        .map(async (directory) => {
        const candidatePath = path.join(workspaceRootPath, directory);
        try {
            const entries = await readRootEntries(candidatePath);
            return buildCandidate(candidatePath, workspaceRootPath, entries);
        }
        catch {
            return null;
        }
    }));
    const childCandidates = childEntries.filter((candidate) => candidate !== null);
    const candidates = [workspaceCandidate, ...childCandidates]
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const focusedCandidate = focusPath
        ? childCandidates.find((candidate) => focusPath.startsWith(`${candidate.path}${path.sep}`) || focusPath === candidate.path)
        : null;
    let selected = workspaceCandidate;
    let strategy = 'workspaceRoot';
    let summary = 'Using the workspace root because it already exposes shallow repo markers.';
    if (focusedCandidate && focusedCandidate.markerCount > 0) {
        selected = focusedCandidate;
        strategy = 'focusedChild';
        summary = `Using focused child ${focusedCandidate.relativePath} because it contains the active work and exposes shallow repo markers.`;
    }
    else if (workspaceCandidate.markerCount === 0) {
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
        }
        else {
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
async function scanWorkspace(workspaceRootPath, workspaceName = path.basename(workspaceRootPath), options = {}) {
    const { selectedRootPath, rootSelection } = await chooseScanRoot(workspaceRootPath, options.focusPath);
    const entries = await readRootEntries(selectedRootPath);
    const notes = [];
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
            }
            else {
                packageJsonSummary = (0, workspaceInspection_1.summarizePackageJson)(raw);
            }
        }
        catch {
            notes.push('package.json exists but could not be parsed.');
        }
    }
    const makeTargets = entries.entryNames.includes('Makefile')
        ? (0, workspaceInspection_1.extractNamedTargets)(await readTextIfExists(path.join(selectedRootPath, 'Makefile')) ?? '')
        : [];
    const justTargets = entries.entryNames.includes('justfile')
        ? (0, workspaceInspection_1.extractJustTargets)(await readTextIfExists(path.join(selectedRootPath, 'justfile')) ?? '')
        : [];
    const ciCommands = await collectCiCommands(selectedRootPath, ciFiles);
    const packageManagers = (0, workspaceInspection_1.detectPackageManagers)(entries.entryNames, packageJsonSummary);
    const lifecycleCommands = packageJsonSummary?.lifecycleCommands ?? [];
    const validationCommands = (0, workspaceInspection_1.inferValidationCommands)({
        manifests,
        packageJson: packageJsonSummary,
        makeTargets,
        justTargets,
        ciCommands
    });
    const testSignals = (0, workspaceInspection_1.inferTestSignals)(manifests, docs, tests, packageJsonSummary);
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
//# sourceMappingURL=workspaceScanner.js.map