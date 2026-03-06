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
const vscode = __importStar(require("vscode"));
const CANDIDATES = {
    manifests: ['package.json', 'pnpm-workspace.yaml', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'global.json', '*.sln'],
    ciFiles: ['.github/workflows', 'azure-pipelines.yml', '.gitlab-ci.yml'],
    docs: ['README.md', 'docs', 'AGENTS.md'],
    sourceRoots: ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend']
};
async function exists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
async function findSolutionFiles(root) {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sln')).map((entry) => entry.name);
}
function detectPackageManagers(manifests) {
    const packageManagers = new Set();
    for (const manifest of manifests) {
        if (manifest.includes('package.json'))
            packageManagers.add('npm');
        if (manifest.includes('pnpm-workspace.yaml'))
            packageManagers.add('pnpm');
        if (manifest.includes('pyproject.toml') || manifest.includes('requirements.txt'))
            packageManagers.add('python');
        if (manifest.includes('Cargo.toml'))
            packageManagers.add('cargo');
        if (manifest.includes('go.mod'))
            packageManagers.add('go');
        if (manifest.includes('pom.xml') || manifest.includes('build.gradle'))
            packageManagers.add('java');
        if (manifest.endsWith('.sln') || manifest.includes('global.json'))
            packageManagers.add('dotnet');
    }
    return Array.from(packageManagers);
}
function inferTestSignals(manifests, docs) {
    const signals = new Set();
    for (const manifest of manifests) {
        if (manifest.includes('package.json'))
            signals.add('Check package.json scripts for test/lint/build.');
        if (manifest.includes('pyproject.toml') || manifest.includes('requirements.txt'))
            signals.add('Check pytest/tox/nox configuration.');
        if (manifest.includes('Cargo.toml'))
            signals.add('cargo test likely available.');
        if (manifest.endsWith('.sln') || manifest.includes('global.json'))
            signals.add('dotnet test likely available.');
    }
    if (docs.some((item) => item.toLowerCase().includes('readme'))) {
        signals.add('Inspect README.md for canonical dev commands.');
    }
    return Array.from(signals);
}
async function scanWorkspace() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
    }
    const rootPath = folder.uri.fsPath;
    const manifests = [];
    for (const candidate of CANDIDATES.manifests) {
        if (candidate === '*.sln') {
            manifests.push(...(await findSolutionFiles(rootPath)));
            continue;
        }
        const target = path.join(rootPath, candidate);
        if (await exists(target))
            manifests.push(candidate);
    }
    const ciFiles = [];
    for (const candidate of CANDIDATES.ciFiles) {
        const target = path.join(rootPath, candidate);
        if (await exists(target))
            ciFiles.push(candidate);
    }
    const docs = [];
    for (const candidate of CANDIDATES.docs) {
        const target = path.join(rootPath, candidate);
        if (await exists(target))
            docs.push(candidate);
    }
    const sourceRoots = [];
    for (const candidate of CANDIDATES.sourceRoots) {
        const target = path.join(rootPath, candidate);
        if (await exists(target))
            sourceRoots.push(candidate);
    }
    return {
        workspaceName: folder.name,
        rootPath,
        manifests,
        packageManagers: detectPackageManagers(manifests),
        testSignals: inferTestSignals(manifests, docs),
        ciFiles,
        docs,
        sourceRoots
    };
}
//# sourceMappingURL=repoScanner.js.map