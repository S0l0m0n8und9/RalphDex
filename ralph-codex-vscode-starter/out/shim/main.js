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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const stdoutHost_1 = require("./stdoutHost");
const installVscodeShim_1 = require("./installVscodeShim");
class MemoryMemento {
    values = new Map();
    keys() {
        return Array.from(this.values.keys());
    }
    get(key, defaultValue) {
        return this.values.has(key) ? this.values.get(key) : defaultValue;
    }
    async update(key, value) {
        if (value === undefined) {
            this.values.delete(key);
            return;
        }
        this.values.set(key, value);
    }
}
function usage() {
    return 'Usage: node out/shim/main.js <workspace-path>';
}
async function main() {
    const workspaceArg = process.argv[2];
    if (!workspaceArg) {
        throw new Error(usage());
    }
    const workspaceRoot = node_path_1.default.resolve(workspaceArg);
    const stat = await fs.stat(workspaceRoot).catch(() => null);
    if (!stat?.isDirectory()) {
        throw new Error(`Workspace path does not exist or is not a directory: ${workspaceRoot}`);
    }
    const host = (0, stdoutHost_1.createStdoutHost)(workspaceRoot, process.env);
    (0, installVscodeShim_1.installVscodeShim)(workspaceRoot, host);
    const vscode = await Promise.resolve().then(() => __importStar(require('vscode')));
    const [{ Logger }, { RalphStateManager }, { CodexStrategyRegistry }, { RalphIterationEngine }] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('../services/logger'))),
        Promise.resolve().then(() => __importStar(require('../ralph/stateManager'))),
        Promise.resolve().then(() => __importStar(require('../codex/providerFactory'))),
        Promise.resolve().then(() => __importStar(require('../ralph/iterationEngine')))
    ]);
    const logger = new Logger(host.outputChannel);
    const stateManager = new RalphStateManager(new MemoryMemento(), logger);
    const strategies = new CodexStrategyRegistry(logger);
    const engine = new RalphIterationEngine(stateManager, strategies, logger);
    const workspaceFolder = {
        uri: vscode.Uri.file(workspaceRoot),
        name: node_path_1.default.basename(workspaceRoot),
        index: 0
    };
    const run = await engine.runCliIteration(workspaceFolder, 'singleExec', host.progress, { reachedIterationCap: false });
    host.outputChannel.appendLine(`Ralph shim iteration ${run.result.iteration} finished: ${run.result.summary}`);
}
void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
//# sourceMappingURL=main.js.map