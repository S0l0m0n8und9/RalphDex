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
exports.registerCommands = registerCommands;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const providerFactory_1 = require("../codex/providerFactory");
const promptBuilder_1 = require("../prompt/promptBuilder");
const stateManager_1 = require("../ralph/stateManager");
const workspaceScanner_1 = require("../services/workspaceScanner");
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function withWorkspaceFolder() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
    }
    return folder;
}
async function maybeSeedObjective(stateManager, paths) {
    const objectiveText = await stateManager.readObjectiveText(paths);
    if (!stateManager.isDefaultObjective(objectiveText)) {
        return objectiveText;
    }
    const seededObjective = await vscode.window.showInputBox({
        prompt: 'Seed the PRD with a short objective for this workspace',
        placeHolder: 'Example: Harden the VS Code extension starter into a reliable v1'
    });
    if (!seededObjective?.trim()) {
        return objectiveText;
    }
    const nextText = [
        '# Product / project brief',
        '',
        seededObjective.trim()
    ].join('\n');
    await stateManager.writeObjectiveText(paths, nextText);
    return `${nextText}\n`;
}
async function preparePrompt(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await stateManager.ensureWorkspace(rootPath, config);
    await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
    const objectiveText = await maybeSeedObjective(stateManager, snapshot.paths);
    const progressText = await stateManager.readProgressText(snapshot.paths);
    const tasksText = await stateManager.readTaskFileText(snapshot.paths);
    const taskCounts = await stateManager.taskCounts(snapshot.paths);
    const summary = await (0, workspaceScanner_1.scanWorkspace)(rootPath, workspaceFolder.name);
    const promptKind = (0, promptBuilder_1.choosePromptKind)(snapshot.state);
    const iteration = snapshot.state.nextIteration;
    const prompt = (0, promptBuilder_1.buildPrompt)({
        kind: promptKind,
        iteration,
        objectiveText,
        progressText,
        tasksText,
        taskCounts,
        summary,
        state: snapshot.state,
        paths: snapshot.paths
    });
    const promptPath = await stateManager.writePrompt(snapshot.paths, (0, promptBuilder_1.createPromptFileName)(promptKind, iteration), prompt);
    logger.info('Generated Ralph prompt.', {
        rootPath,
        promptKind,
        iteration,
        promptPath
    });
    return {
        config,
        rootPath,
        state: snapshot.state,
        paths: snapshot.paths,
        promptKind,
        promptPath,
        prompt,
        iteration,
        objectiveText
    };
}
function showWarnings(warnings) {
    if (warnings.length === 0) {
        return undefined;
    }
    return vscode.window.showWarningMessage(warnings.join(' '));
}
function runRecordFromExec(mode, prepared, startedAt, execResult) {
    const summary = execResult.lastMessage
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
        ?? `Exit code ${execResult.exitCode}`;
    return {
        iteration: prepared.iteration,
        mode,
        promptKind: prepared.promptKind,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: execResult.exitCode === 0 ? 'succeeded' : 'failed',
        exitCode: execResult.exitCode,
        promptPath: prepared.promptPath,
        transcriptPath: execResult.transcriptPath,
        lastMessagePath: execResult.lastMessagePath,
        summary
    };
}
async function runExecIteration(workspaceFolder, stateManager, strategies, logger, mode) {
    const prepared = await preparePrompt(workspaceFolder, stateManager, logger);
    const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
    const runArtifacts = stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
    const execStrategy = strategies.getCliExecStrategy();
    if (!execStrategy.runExec) {
        throw new Error('The configured Codex CLI strategy does not support codex exec.');
    }
    const startedAt = new Date().toISOString();
    logger.show(false);
    logger.info('Running Ralph iteration.', {
        iteration: prepared.iteration,
        mode,
        promptPath: prepared.promptPath
    });
    const execResult = await execStrategy.runExec({
        commandPath: prepared.config.codexCommandPath,
        workspaceRoot: prepared.rootPath,
        prompt: prepared.prompt,
        promptPath: prepared.promptPath,
        transcriptPath: runArtifacts.transcriptPath,
        lastMessagePath: runArtifacts.lastMessagePath,
        model: prepared.config.model,
        sandboxMode: prepared.config.sandboxMode,
        approvalMode: prepared.config.approvalMode,
        onStdoutChunk: (chunk) => logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
        onStderrChunk: (chunk) => logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
    });
    const runRecord = runRecordFromExec(mode, prepared, startedAt, execResult);
    await stateManager.recordRun(prepared.rootPath, prepared.paths, prepared.state, runRecord, prepared.objectiveText);
    logger.info('Completed Ralph iteration.', {
        iteration: prepared.iteration,
        exitCode: execResult.exitCode,
        transcriptPath: execResult.transcriptPath,
        lastMessagePath: execResult.lastMessagePath
    });
    if (execResult.exitCode !== 0) {
        throw new Error(`codex exec failed on iteration ${prepared.iteration}. See Ralph Codex output and ${path.basename(execResult.transcriptPath)}.`);
    }
    void vscode.window.showInformationMessage(`Ralph iteration ${prepared.iteration} completed.`);
}
function registerCommand(context, logger, commandId, handler) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async () => {
        try {
            await handler();
        }
        catch (error) {
            logger.show(false);
            logger.error(`Command failed: ${commandId}`, error);
            void vscode.window.showErrorMessage(toErrorMessage(error));
        }
    }));
}
function registerCommands(context, logger) {
    const stateManager = new stateManager_1.RalphStateManager(context.workspaceState, logger);
    const strategies = new providerFactory_1.CodexStrategyRegistry(logger);
    registerCommand(context, logger, 'ralphCodex.generatePrompt', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        const prepared = await preparePrompt(workspaceFolder, stateManager, logger);
        const recordState = await stateManager.recordPrompt(prepared.rootPath, prepared.paths, prepared.state, prepared.promptKind, prepared.promptPath, prepared.objectiveText);
        if (prepared.config.clipboardAutoCopy) {
            const clipboardStrategy = strategies.getById('clipboard');
            const result = await clipboardStrategy.handoffPrompt?.({
                prompt: prepared.prompt,
                promptPath: prepared.promptPath,
                promptKind: prepared.promptKind,
                iteration: prepared.iteration,
                copyToClipboard: true,
                openSidebarCommandId: prepared.config.openSidebarCommandId,
                newChatCommandId: prepared.config.newChatCommandId
            });
            if (result) {
                void showWarnings(result.warnings);
            }
        }
        logger.info('Prompt generated and stored.', {
            promptPath: prepared.promptPath,
            nextIteration: recordState.nextIteration,
            promptKind: prepared.promptKind
        });
        void vscode.window.showInformationMessage(`Generated ${prepared.promptKind} prompt at ${path.basename(prepared.promptPath)}.`);
    });
    registerCommand(context, logger, 'ralphCodex.openCodexAndCopyPrompt', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        const prepared = await preparePrompt(workspaceFolder, stateManager, logger);
        const strategy = strategies.getPromptHandoffStrategy(prepared.config.preferredHandoffMode);
        const result = await strategy.handoffPrompt?.({
            prompt: prepared.prompt,
            promptPath: prepared.promptPath,
            promptKind: prepared.promptKind,
            iteration: prepared.iteration,
            copyToClipboard: true,
            openSidebarCommandId: prepared.config.openSidebarCommandId,
            newChatCommandId: prepared.config.newChatCommandId
        });
        await stateManager.recordPrompt(prepared.rootPath, prepared.paths, prepared.state, prepared.promptKind, prepared.promptPath, prepared.objectiveText);
        if (prepared.config.preferredHandoffMode === 'cliExec') {
            void vscode.window.showWarningMessage('Preferred handoff mode is set to cliExec. The IDE handoff command falls back to clipboard handoff; use Run One Ralph Iteration for Codex CLI execution.');
        }
        if (result) {
            void showWarnings(result.warnings);
            void vscode.window.showInformationMessage(result.message);
        }
    });
    registerCommand(context, logger, 'ralphCodex.runRalphIteration', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'singleExec');
    });
    registerCommand(context, logger, 'ralphCodex.runRalphLoop', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        const config = (0, readConfig_1.readConfig)(workspaceFolder);
        logger.show(false);
        logger.info('Starting Ralph loop.', {
            rootPath: workspaceFolder.uri.fsPath,
            iterationCap: config.ralphIterationCap
        });
        for (let remaining = 0; remaining < config.ralphIterationCap; remaining += 1) {
            await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'loop');
        }
        void vscode.window.showInformationMessage(`Ralph loop completed ${config.ralphIterationCap} iteration(s).`);
    });
    registerCommand(context, logger, 'ralphCodex.showRalphStatus', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        const config = (0, readConfig_1.readConfig)(workspaceFolder);
        const snapshot = await stateManager.ensureWorkspace(workspaceFolder.uri.fsPath, config);
        await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
        const taskCounts = await stateManager.taskCounts(snapshot.paths);
        const summary = await (0, workspaceScanner_1.scanWorkspace)(workspaceFolder.uri.fsPath, workspaceFolder.name);
        const status = {
            workspace: workspaceFolder.name,
            rootPath: workspaceFolder.uri.fsPath,
            preferredHandoffMode: config.preferredHandoffMode,
            codexCommandPath: config.codexCommandPath,
            nextIteration: snapshot.state.nextIteration,
            objectivePreview: snapshot.state.objectivePreview,
            lastPromptKind: snapshot.state.lastPromptKind,
            lastPromptPath: snapshot.state.lastPromptPath,
            lastRun: snapshot.state.lastRun,
            taskCounts,
            manifests: summary.manifests,
            lifecycleCommands: summary.lifecycleCommands,
            progressPath: snapshot.paths.progressPath,
            taskFilePath: snapshot.paths.taskFilePath,
            stateFilePath: snapshot.paths.stateFilePath,
            logFilePath: snapshot.paths.logFilePath
        };
        logger.show(false);
        logger.info('Ralph status snapshot.', status);
        void vscode.window.showInformationMessage('Ralph status written to the Ralph Codex output channel.');
    });
    registerCommand(context, logger, 'ralphCodex.resetRalphWorkspaceState', async () => {
        const workspaceFolder = await withWorkspaceFolder();
        const confirmed = await vscode.window.showWarningMessage('Reset Ralph runtime state? This preserves the PRD, progress log, and task file, but deletes .ralph/state.json, generated prompts, run artifacts, and extension logs.', { modal: true }, 'Reset');
        if (confirmed !== 'Reset') {
            return;
        }
        const config = (0, readConfig_1.readConfig)(workspaceFolder);
        const snapshot = await stateManager.resetRuntimeState(workspaceFolder.uri.fsPath, config);
        await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
        logger.info('Reset Ralph workspace runtime state.', { rootPath: workspaceFolder.uri.fsPath });
        void vscode.window.showInformationMessage('Ralph workspace runtime state reset. Durable PRD/progress/task files were preserved.');
    });
}
//# sourceMappingURL=registerCommands.js.map