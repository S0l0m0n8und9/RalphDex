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
exports.RalphStateManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const pathResolver_1 = require("./pathResolver");
const taskFile_1 = require("./taskFile");
const STATE_HISTORY_LIMIT = 20;
const DEFAULT_PRD = [
    '# Product / project brief',
    '',
    'Describe the current objective for Ralph here.',
    '',
    '- What should Codex change?',
    '- What constraints matter?',
    '- What does “done” look like?'
].join('\n');
const DEFAULT_PROGRESS = [
    '# Progress',
    '',
    '- Ralph workspace initialized.',
    '- Use this file for durable progress notes between fresh Codex runs.'
].join('\n');
function defaultState() {
    return {
        version: 1,
        objectivePreview: null,
        nextIteration: 1,
        lastPromptKind: null,
        lastPromptPath: null,
        lastRun: null,
        runHistory: [],
        updatedAt: new Date().toISOString()
    };
}
function stateKey(rootPath) {
    return `ralphCodex.workspaceState:${rootPath}`;
}
function summarizeObjective(text) {
    const line = text
        .split('\n')
        .map((value) => value.trim())
        .find((value) => value.length > 0 && !value.startsWith('#') && !value.startsWith('-'));
    return line ? line.slice(0, 160) : null;
}
function normalizeWorkspaceState(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return defaultState();
    }
    const record = candidate;
    const history = Array.isArray(record.runHistory) ? record.runHistory.filter((item) => {
        if (typeof item !== 'object' || item === null) {
            return false;
        }
        const run = item;
        return typeof run.iteration === 'number'
            && typeof run.mode === 'string'
            && typeof run.promptKind === 'string'
            && typeof run.startedAt === 'string'
            && typeof run.finishedAt === 'string'
            && typeof run.status === 'string'
            && (typeof run.exitCode === 'number' || run.exitCode === null)
            && typeof run.promptPath === 'string'
            && typeof run.summary === 'string';
    }) : [];
    return {
        version: 1,
        objectivePreview: typeof record.objectivePreview === 'string' ? record.objectivePreview : null,
        nextIteration: typeof record.nextIteration === 'number' && record.nextIteration > 0 ? Math.floor(record.nextIteration) : 1,
        lastPromptKind: record.lastPromptKind === 'bootstrap' || record.lastPromptKind === 'iteration' ? record.lastPromptKind : null,
        lastPromptPath: typeof record.lastPromptPath === 'string' ? record.lastPromptPath : null,
        lastRun: history.length > 0 ? history[history.length - 1] : null,
        runHistory: history.slice(-STATE_HISTORY_LIMIT),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
    };
}
async function ensureFile(target, content) {
    try {
        await fs.access(target);
    }
    catch {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, `${content.trimEnd()}\n`, 'utf8');
    }
}
async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(target, fallback = '') {
    try {
        return await fs.readFile(target, 'utf8');
    }
    catch {
        return fallback;
    }
}
class RalphStateManager {
    workspaceState;
    logger;
    constructor(workspaceState, logger) {
        this.workspaceState = workspaceState;
        this.logger = logger;
    }
    resolvePaths(rootPath, config) {
        return (0, pathResolver_1.resolveRalphPaths)(rootPath, config);
    }
    async inspectWorkspace(rootPath, config) {
        const paths = this.resolvePaths(rootPath, config);
        return {
            paths,
            state: await this.loadState(rootPath, paths),
            createdPaths: [],
            fileStatus: await this.collectFileStatus(paths)
        };
    }
    async ensureWorkspace(rootPath, config) {
        const paths = this.resolvePaths(rootPath, config);
        const createdPaths = [];
        for (const dir of [paths.promptDir, paths.runDir, paths.logDir]) {
            if (!(await pathExists(dir))) {
                createdPaths.push(dir);
            }
            await fs.mkdir(dir, { recursive: true });
        }
        if (!(await pathExists(paths.prdPath))) {
            createdPaths.push(paths.prdPath);
        }
        await ensureFile(paths.prdPath, DEFAULT_PRD);
        if (!(await pathExists(paths.progressPath))) {
            createdPaths.push(paths.progressPath);
        }
        await ensureFile(paths.progressPath, DEFAULT_PROGRESS);
        if (!(await pathExists(paths.taskFilePath))) {
            createdPaths.push(paths.taskFilePath);
            await fs.mkdir(path.dirname(paths.taskFilePath), { recursive: true });
            await fs.writeFile(paths.taskFilePath, (0, taskFile_1.stringifyTaskFile)((0, taskFile_1.createDefaultTaskFile)()), 'utf8');
        }
        const stateFileExists = await pathExists(paths.stateFilePath);
        const state = await this.loadState(rootPath, paths);
        await this.saveState(rootPath, paths, state);
        if (!stateFileExists) {
            createdPaths.push(paths.stateFilePath);
        }
        return {
            paths,
            state,
            createdPaths,
            fileStatus: await this.collectFileStatus(paths)
        };
    }
    async loadState(rootPath, paths) {
        const diskStateText = await readText(paths.stateFilePath);
        if (diskStateText.trim()) {
            try {
                return normalizeWorkspaceState(JSON.parse(diskStateText));
            }
            catch (error) {
                this.logger.warn('Failed to parse .ralph/state.json. Falling back to workspace storage.', {
                    rootPath,
                    stateFilePath: paths.stateFilePath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        const storedState = await this.workspaceState.get(stateKey(rootPath));
        return normalizeWorkspaceState(storedState);
    }
    async saveState(rootPath, paths, state) {
        const normalized = {
            ...state,
            lastRun: state.runHistory.length > 0 ? state.runHistory[state.runHistory.length - 1] : state.lastRun,
            updatedAt: new Date().toISOString()
        };
        await fs.writeFile(paths.stateFilePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
        await this.workspaceState.update(stateKey(rootPath), normalized);
    }
    async readObjectiveText(paths) {
        return readText(paths.prdPath, `${DEFAULT_PRD}\n`);
    }
    async writeObjectiveText(paths, text) {
        await fs.writeFile(paths.prdPath, `${text.trimEnd()}\n`, 'utf8');
    }
    async readProgressText(paths) {
        return readText(paths.progressPath, `${DEFAULT_PROGRESS}\n`);
    }
    async readTaskFileText(paths) {
        const raw = await readText(paths.taskFilePath);
        if (!raw.trim()) {
            const seeded = (0, taskFile_1.stringifyTaskFile)((0, taskFile_1.createDefaultTaskFile)());
            await fs.writeFile(paths.taskFilePath, seeded, 'utf8');
            return seeded;
        }
        try {
            (0, taskFile_1.parseTaskFile)(raw);
        }
        catch (error) {
            throw new Error(`Failed to parse Ralph task file at ${paths.taskFilePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return raw;
    }
    async readTaskFile(paths) {
        return (0, taskFile_1.parseTaskFile)(await this.readTaskFileText(paths));
    }
    async taskCounts(paths) {
        return (0, taskFile_1.countTaskStatuses)(await this.readTaskFile(paths));
    }
    async writePrompt(paths, fileName, prompt) {
        const target = path.join(paths.promptDir, fileName);
        await fs.writeFile(target, `${prompt.trimEnd()}\n`, 'utf8');
        return target;
    }
    runArtifactPaths(paths, artifactBaseName) {
        return {
            transcriptPath: path.join(paths.runDir, `${artifactBaseName}.transcript.md`),
            lastMessagePath: path.join(paths.runDir, `${artifactBaseName}.last-message.md`)
        };
    }
    async recordPrompt(rootPath, paths, state, promptKind, promptPath, objectiveText) {
        const nextState = {
            ...state,
            objectivePreview: summarizeObjective(objectiveText),
            lastPromptKind: promptKind,
            lastPromptPath: promptPath,
            updatedAt: new Date().toISOString()
        };
        await this.saveState(rootPath, paths, nextState);
        return nextState;
    }
    async recordRun(rootPath, paths, state, runRecord, objectiveText) {
        const history = [...state.runHistory, runRecord].slice(-STATE_HISTORY_LIMIT);
        const nextState = {
            ...state,
            objectivePreview: summarizeObjective(objectiveText),
            nextIteration: runRecord.iteration + 1,
            lastPromptKind: runRecord.promptKind,
            lastPromptPath: runRecord.promptPath,
            lastRun: runRecord,
            runHistory: history,
            updatedAt: new Date().toISOString()
        };
        await this.saveState(rootPath, paths, nextState);
        return nextState;
    }
    async resetRuntimeState(rootPath, config) {
        const paths = this.resolvePaths(rootPath, config);
        await fs.rm(paths.promptDir, { recursive: true, force: true });
        await fs.rm(paths.runDir, { recursive: true, force: true });
        await fs.rm(paths.logDir, { recursive: true, force: true });
        await fs.rm(paths.stateFilePath, { force: true });
        await this.workspaceState.update(stateKey(rootPath), undefined);
        return this.ensureWorkspace(rootPath, config);
    }
    isDefaultObjective(text) {
        return text.trim() === DEFAULT_PRD.trim();
    }
    async collectFileStatus(paths) {
        const [prdPath, progressPath, taskFilePath, stateFilePath, promptDir, runDir, logDir] = await Promise.all([
            pathExists(paths.prdPath),
            pathExists(paths.progressPath),
            pathExists(paths.taskFilePath),
            pathExists(paths.stateFilePath),
            pathExists(paths.promptDir),
            pathExists(paths.runDir),
            pathExists(paths.logDir)
        ]);
        return {
            prdPath,
            progressPath,
            taskFilePath,
            stateFilePath,
            promptDir,
            runDir,
            logDir
        };
    }
}
exports.RalphStateManager = RalphStateManager;
//# sourceMappingURL=stateManager.js.map