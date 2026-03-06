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
    'global.json'
];
const CI_FILES = ['.github', '.gitlab-ci.yml', 'azure-pipelines.yml'];
const DOC_FILES = ['README.md', 'README', 'docs', 'AGENTS.md'];
const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client'];
async function readJsonIfExists(target) {
    try {
        const raw = await fs.readFile(target, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
async function scanWorkspace(rootPath, workspaceName = path.basename(rootPath)) {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const entryNames = entries.map((entry) => entry.name);
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const notes = [];
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
        }
        else {
            packageJsonSummary = (0, workspaceInspection_1.summarizePackageJson)(raw);
        }
    }
    const packageManagers = (0, workspaceInspection_1.detectPackageManagers)(entryNames, packageJsonSummary);
    const lifecycleCommands = packageJsonSummary?.lifecycleCommands ?? [];
    const testSignals = (0, workspaceInspection_1.inferTestSignals)(manifests, docs, packageJsonSummary);
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
//# sourceMappingURL=workspaceScanner.js.map