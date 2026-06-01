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
const contract_1 = require("./contract");
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
    return 'Usage: node out/shim/main.js [--json] <workspace-path>';
}
function parseArgs(argv) {
    let json = false;
    const positionals = [];
    for (const arg of argv) {
        if (arg === '--json') {
            json = true;
        }
        else if (arg === '--') {
            continue;
        }
        else if (arg.startsWith('--')) {
            throw new contract_1.ShimError(`Unknown option: ${arg}\n${usage()}`, 'config');
        }
        else {
            positionals.push(arg);
        }
    }
    if (positionals.length === 0) {
        throw new contract_1.ShimError(usage(), 'config');
    }
    if (positionals.length > 1) {
        throw new contract_1.ShimError(`Expected a single workspace path.\n${usage()}`, 'config');
    }
    return { workspacePath: positionals[0], json };
}
async function runIteration(args) {
    const workspaceRoot = node_path_1.default.resolve(args.workspacePath);
    const stat = await fs.stat(workspaceRoot).catch(() => null);
    if (!stat?.isDirectory()) {
        throw new contract_1.ShimError(`Workspace path does not exist or is not a directory: ${workspaceRoot}`, 'config');
    }
    // In --json mode stdout must contain only the JSON report, so route human/log
    // output to stderr.
    const logSink = args.json
        ? (text) => process.stderr.write(text)
        : (text) => process.stdout.write(text);
    let host;
    try {
        host = (0, stdoutHost_1.createStdoutHost)(workspaceRoot, process.env, logSink);
    }
    catch (error) {
        // A malformed .ralph-config.json surfaces here as a config-category failure.
        throw new contract_1.ShimError(error instanceof Error ? error.message : String(error), 'config');
    }
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
    return (0, contract_1.buildIterationReport)(run.result);
}
async function main() {
    let args;
    let report;
    try {
        args = parseArgs(process.argv.slice(2));
        report = await runIteration(args);
    }
    catch (error) {
        report = (0, contract_1.buildErrorReport)(error);
    }
    if (args?.json) {
        // Exactly one line of JSON on stdout: the machine-readable contract.
        process.stdout.write(`${JSON.stringify(report)}\n`);
    }
    else if (!report.ok && report.error) {
        process.stderr.write(`${report.error.message}\n`);
    }
    process.exitCode = report.exitCode;
}
void main();
//# sourceMappingURL=main.js.map