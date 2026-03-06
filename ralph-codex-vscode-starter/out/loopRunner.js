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
exports.runSingleExec = runSingleExec;
exports.runLoop = runLoop;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const promptFactory_1 = require("./promptFactory");
const repoScanner_1 = require("./repoScanner");
async function ensureDir(target) {
    await fs.mkdir(target, { recursive: true });
}
async function readIfExists(target) {
    try {
        return await fs.readFile(target, 'utf8');
    }
    catch {
        return '';
    }
}
function runProcess(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { cwd, shell: process.platform === 'win32' });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
}
async function runSingleExec(config, objective, iteration) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder)
        throw new Error('Open a workspace folder first.');
    const root = folder.uri.fsPath;
    const outDir = path.join(root, config.promptOutputFolder);
    await ensureDir(outDir);
    const summary = await (0, repoScanner_1.scanWorkspace)();
    const progressPath = path.join(root, '.ralph', 'progress.md');
    const tasksPath = path.join(root, '.ralph', 'tasks.json');
    const progressText = await readIfExists(progressPath);
    const tasksText = await readIfExists(tasksPath);
    const prompt = (0, promptFactory_1.buildIterationPrompt)({
        summary,
        objective,
        iteration,
        progressText,
        tasksText
    });
    const promptPath = path.join(outDir, `iteration-${String(iteration).padStart(3, '0')}.prompt.md`);
    const transcriptPath = path.join(outDir, `iteration-${String(iteration).padStart(3, '0')}.transcript.txt`);
    await fs.writeFile(promptPath, prompt, 'utf8');
    const args = [
        'exec',
        '--model', config.model,
        '--sandbox', config.sandboxMode,
        '--ask-for-approval', config.approvalMode,
        '--cd', root,
        prompt
    ];
    const result = await runProcess(config.codexExecutable, args, root);
    const transcript = [`# Prompt`, '', prompt, '', '# Stdout', '', result.stdout, '', '# Stderr', '', result.stderr].join('\n');
    await fs.writeFile(transcriptPath, transcript, 'utf8');
    return {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        promptPath,
        transcriptPath
    };
}
async function runLoop(config, options, output) {
    for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
        output.appendLine(`\n=== Ralph iteration ${iteration}/${options.maxIterations} ===`);
        const result = await runSingleExec({
            ...config,
            model: options.model,
            sandboxMode: options.sandboxMode,
            approvalMode: options.approvalMode
        }, options.objective, iteration);
        output.appendLine(`Exit code: ${result.code}`);
        output.appendLine(`Prompt: ${result.promptPath}`);
        if (result.transcriptPath)
            output.appendLine(`Transcript: ${result.transcriptPath}`);
        if (result.stdout.trim()) {
            output.appendLine('--- stdout ---');
            output.appendLine(result.stdout.trim());
        }
        if (result.stderr.trim()) {
            output.appendLine('--- stderr ---');
            output.appendLine(result.stderr.trim());
        }
        if (result.code !== 0) {
            throw new Error(`Codex exec failed on iteration ${iteration}. Inspect the output channel and transcript.`);
        }
    }
}
//# sourceMappingURL=loopRunner.js.map