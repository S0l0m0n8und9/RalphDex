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
exports.RalphStateWatcher = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const taskFile_1 = require("../ralph/taskFile");
/**
 * Watches `.ralph/tasks.json`, claim/dead-letter state, and compact per-task
 * artifacts for changes, reads the core state files, and fires a typed event
 * with the combined state.
 * Debounces at 300ms to avoid thrashing during rapid writes.
 */
class RalphStateWatcher {
    workspaceRoot;
    _onStateChange = new vscode.EventEmitter();
    onStateChange = this._onStateChange.event;
    watchers = [];
    debounceTimer = null;
    ralphDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.ralphDir = path.join(workspaceRoot, '.ralph');
        const statePattern = new vscode.RelativePattern(this.ralphDir, '{tasks.json,state.json,claims.json,dead-letter.json,prd.md}');
        const artifactPattern = new vscode.RelativePattern(this.ralphDir, 'artifacts/**/{task-plan.json,failure-analysis.json,recovery-state.json}');
        const orchestrationPattern = new vscode.RelativePattern(this.ralphDir, '{orchestration/**/*.json,artifacts/**/{human-gate-*.json,replan-*.json,plan-graph.json}}');
        for (const pattern of [statePattern, artifactPattern, orchestrationPattern]) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            watcher.onDidChange(() => this.scheduleRefresh());
            watcher.onDidCreate(() => this.scheduleRefresh());
            watcher.onDidDelete(() => this.scheduleRefresh());
            this.watchers.push(watcher);
        }
    }
    scheduleRefresh() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.refresh();
        }, 300);
    }
    async refresh() {
        const state = await readWatchedState(this.ralphDir);
        this._onStateChange.fire(state);
        return state;
    }
    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        for (const watcher of this.watchers) {
            watcher.dispose();
        }
        this._onStateChange.dispose();
    }
}
exports.RalphStateWatcher = RalphStateWatcher;
async function readWatchedState(ralphDir) {
    let taskFile = null;
    let workspaceState = null;
    let selectedTaskId = null;
    try {
        const taskText = await fs.readFile(path.join(ralphDir, 'tasks.json'), 'utf8');
        taskFile = (0, taskFile_1.parseTaskFile)(taskText);
        const selected = (0, taskFile_1.selectNextTask)(taskFile);
        selectedTaskId = selected?.id ?? null;
    }
    catch {
        // tasks.json missing or invalid — leave null
    }
    try {
        const stateText = await fs.readFile(path.join(ralphDir, 'state.json'), 'utf8');
        const parsed = JSON.parse(stateText);
        if (parsed && typeof parsed === 'object' && parsed.version === 2) {
            workspaceState = parsed;
        }
    }
    catch {
        // state.json missing or invalid — leave null
    }
    let prdExists = false;
    try {
        await fs.access(path.join(ralphDir, 'prd.md'));
        prdExists = true;
    }
    catch {
        // prd.md absent
    }
    return { taskFile, workspaceState, selectedTaskId, prdExists };
}
//# sourceMappingURL=stateWatcher.js.map