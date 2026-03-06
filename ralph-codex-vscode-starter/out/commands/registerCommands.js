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
const codexCliSupport_1 = require("../services/codexCliSupport");
const workspaceScanner_1 = require("../services/workspaceScanner");
const workspaceSupport_1 = require("./workspaceSupport");
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function createdPathSummary(rootPath, createdPaths) {
    if (createdPaths.length === 0) {
        return null;
    }
    const labels = createdPaths
        .map((target) => path.relative(rootPath, target) || path.basename(target))
        .join(', ');
    return `Initialized or repaired Ralph workspace paths: ${labels}.`;
}
async function withWorkspaceFolder() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
    }
    return folder;
}
async function ensureCodexCliReady(config) {
    const support = await (0, codexCliSupport_1.inspectCodexCliSupport)(config.codexCommandPath);
    if (support.check === 'pathMissing') {
        throw new Error(`Codex CLI path "${config.codexCommandPath}" does not exist. Update ralphCodex.codexCommandPath or install Codex CLI.`);
    }
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
async function preparePrompt(workspaceFolder, stateManager, logger, progress) {
    progress.report({ message: 'Ensuring Ralph workspace' });
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await stateManager.ensureWorkspace(rootPath, config);
    await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
    if (snapshot.createdPaths.length > 0) {
        logger.warn('Initialized or repaired Ralph workspace paths.', {
            rootPath,
            createdPaths: snapshot.createdPaths
        });
    }
    progress.report({ message: 'Reading Ralph state and workspace summary' });
    const objectiveText = await maybeSeedObjective(stateManager, snapshot.paths);
    const progressText = await stateManager.readProgressText(snapshot.paths);
    const tasksText = await stateManager.readTaskFileText(snapshot.paths);
    const taskCounts = await stateManager.taskCounts(snapshot.paths);
    const summary = await (0, workspaceScanner_1.scanWorkspace)(rootPath, workspaceFolder.name);
    const promptKind = (0, promptBuilder_1.choosePromptKind)(snapshot.state);
    const iteration = snapshot.state.nextIteration;
    progress.report({ message: 'Writing prompt artifact' });
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
        objectiveText,
        createdPaths: snapshot.createdPaths
    };
}
async function showWarnings(warnings) {
    if (warnings.length === 0) {
        return;
    }
    await vscode.window.showWarningMessage(warnings.join(' '));
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
async function runExecIteration(workspaceFolder, stateManager, strategies, logger, mode, progress, loopState) {
    const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
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
        loopState,
        promptPath: prepared.promptPath
    });
    progress.report({
        message: loopState
            ? `Running Codex CLI iteration ${loopState.index} of ${loopState.total}`
            : `Running Codex CLI iteration ${prepared.iteration}`
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
        throw new Error(`codex exec failed on iteration ${prepared.iteration} with exit code ${execResult.exitCode}. See ${path.basename(execResult.transcriptPath)} and the Ralph Codex output channel.`);
    }
    if (mode === 'singleExec') {
        const note = createdPathSummary(prepared.rootPath, prepared.createdPaths);
        void vscode.window.showInformationMessage(note
            ? `Ralph CLI iteration ${prepared.iteration} completed. ${note}`
            : `Ralph CLI iteration ${prepared.iteration} completed.`);
    }
}
async function collectStatusSnapshot(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const [summary, ideCommandSupport, codexCliSupport] = await Promise.all([
        (0, workspaceScanner_1.scanWorkspace)(workspaceFolder.uri.fsPath, workspaceFolder.name),
        (0, workspaceSupport_1.inspectIdeCommandSupport)(config),
        (0, codexCliSupport_1.inspectCodexCliSupport)(config.codexCommandPath)
    ]);
    let taskCounts = null;
    let taskFileError = null;
    if (inspection.fileStatus.taskFilePath) {
        try {
            taskCounts = await stateManager.taskCounts(inspection.paths);
        }
        catch (error) {
            taskFileError = toErrorMessage(error);
        }
    }
    const missingRalphPaths = Object.entries(inspection.fileStatus)
        .filter(([, present]) => !present)
        .map(([label]) => label);
    return {
        workspace: workspaceFolder.name,
        rootPath: workspaceFolder.uri.fsPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        activationMode: vscode.workspace.isTrusted ? 'full' : 'limited',
        preferredHandoffMode: config.preferredHandoffMode,
        codexCommandPath: config.codexCommandPath,
        codexCliSupport,
        ideCommandSupport,
        nextIteration: inspection.state.nextIteration,
        objectivePreview: inspection.state.objectivePreview,
        lastPromptKind: inspection.state.lastPromptKind,
        lastPromptPath: inspection.state.lastPromptPath,
        lastRun: inspection.state.lastRun,
        taskCounts,
        taskFileError,
        ralphFileStatus: inspection.fileStatus,
        missingRalphPaths,
        manifests: summary.manifests,
        lifecycleCommands: summary.lifecycleCommands,
        progressPath: inspection.paths.progressPath,
        taskFilePath: inspection.paths.taskFilePath,
        stateFilePath: inspection.paths.stateFilePath,
        logFilePath: inspection.paths.logFilePath
    };
}
function registerCommand(context, logger, spec) {
    context.subscriptions.push(vscode.commands.registerCommand(spec.commandId, async () => {
        logger.info('Command started.', {
            commandId: spec.commandId,
            workspaceTrusted: vscode.workspace.isTrusted
        });
        try {
            if (spec.requiresTrustedWorkspace ?? true) {
                (0, workspaceSupport_1.requireTrustedWorkspace)(spec.label);
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: spec.label,
                cancellable: false
            }, async (progress) => spec.handler(progress));
            logger.info('Command completed.', { commandId: spec.commandId });
        }
        catch (error) {
            logger.show(false);
            logger.error(`Command failed: ${spec.commandId}`, error);
            const choice = await vscode.window.showErrorMessage(toErrorMessage(error), 'Show Output');
            if (choice === 'Show Output') {
                logger.show(false);
            }
        }
    }));
}
function registerCommands(context, logger) {
    const stateManager = new stateManager_1.RalphStateManager(context.workspaceState, logger);
    const strategies = new providerFactory_1.CodexStrategyRegistry(logger);
    registerCommand(context, logger, {
        commandId: 'ralphCodex.generatePrompt',
        label: 'Ralph Codex: Prepare Prompt',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
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
                    await showWarnings(result.warnings);
                }
            }
            logger.info('Prompt generated and stored.', {
                promptPath: prepared.promptPath,
                nextIteration: recordState.nextIteration,
                promptKind: prepared.promptKind
            });
            const note = createdPathSummary(prepared.rootPath, prepared.createdPaths);
            void vscode.window.showInformationMessage(note
                ? `Prepared ${prepared.promptKind} prompt at ${path.basename(prepared.promptPath)}. ${note}`
                : `Prepared ${prepared.promptKind} prompt at ${path.basename(prepared.promptPath)}.`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openCodexAndCopyPrompt',
        label: 'Ralph Codex: Open Codex IDE',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
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
                await vscode.window.showWarningMessage('preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.');
            }
            if (result) {
                await showWarnings(result.warnings);
                if (result.success) {
                    void vscode.window.showInformationMessage(result.message);
                }
                else {
                    void vscode.window.showWarningMessage(result.message);
                }
            }
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runRalphIteration',
        label: 'Ralph Codex: Run CLI Iteration',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            await ensureCodexCliReady((0, readConfig_1.readConfig)(workspaceFolder));
            await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'singleExec', progress);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runRalphLoop',
        label: 'Ralph Codex: Run CLI Loop',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            await ensureCodexCliReady(config);
            logger.show(false);
            logger.info('Starting Ralph loop.', {
                rootPath: workspaceFolder.uri.fsPath,
                iterationCap: config.ralphIterationCap
            });
            for (let index = 0; index < config.ralphIterationCap; index += 1) {
                progress.report({
                    message: `Preparing iteration ${index + 1} of ${config.ralphIterationCap}`,
                    increment: 100 / config.ralphIterationCap
                });
                await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'loop', progress, {
                    index: index + 1,
                    total: config.ralphIterationCap
                });
            }
            void vscode.window.showInformationMessage(`Ralph CLI loop completed ${config.ralphIterationCap} iteration(s).`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.showRalphStatus',
        label: 'Ralph Codex: Show Status',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Collecting workspace and Ralph status' });
            const workspaceFolder = await withWorkspaceFolder();
            const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
            logger.show(false);
            logger.info('Ralph status snapshot.', status);
            void vscode.window.showInformationMessage(vscode.workspace.isTrusted
                ? 'Ralph status written to the Ralph Codex output channel.'
                : 'Ralph status written to the Ralph Codex output channel in limited mode.');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.resetRalphWorkspaceState',
        label: 'Ralph Codex: Reset Runtime State',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const confirmed = await vscode.window.showWarningMessage('Reset Ralph runtime state? This preserves the PRD, progress log, and task file, but deletes .ralph/state.json, generated prompts, run artifacts, and extension logs.', { modal: true }, 'Reset');
            if (confirmed !== 'Reset') {
                return;
            }
            progress.report({ message: 'Removing generated Ralph artifacts' });
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const snapshot = await stateManager.resetRuntimeState(workspaceFolder.uri.fsPath, config);
            await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
            logger.info('Reset Ralph workspace runtime state.', {
                rootPath: workspaceFolder.uri.fsPath,
                createdPaths: snapshot.createdPaths
            });
            void vscode.window.showInformationMessage('Ralph runtime state reset. Durable PRD, progress, and task files were preserved.');
        }
    });
}
//# sourceMappingURL=registerCommands.js.map