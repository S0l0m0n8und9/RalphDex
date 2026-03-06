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
const iterationEngine_1 = require("../ralph/iterationEngine");
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
async function showWarnings(warnings) {
    if (warnings.length === 0) {
        return;
    }
    await vscode.window.showWarningMessage(warnings.join(' '));
}
function iterationFailureMessage(result) {
    return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralph Codex output channel.`;
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
        verifierModes: config.verifierModes,
        noProgressThreshold: config.noProgressThreshold,
        repeatedFailureThreshold: config.repeatedFailureThreshold,
        artifactRetentionPath: config.artifactRetentionPath,
        gitCheckpointMode: config.gitCheckpointMode,
        validationCommandOverride: config.validationCommandOverride || null,
        stopOnHumanReviewNeeded: config.stopOnHumanReviewNeeded,
        codexCliSupport,
        ideCommandSupport,
        nextIteration: inspection.state.nextIteration,
        objectivePreview: inspection.state.objectivePreview,
        lastPromptKind: inspection.state.lastPromptKind,
        lastPromptPath: inspection.state.lastPromptPath,
        lastRun: inspection.state.lastRun,
        lastIteration: inspection.state.lastIteration,
        taskCounts,
        taskFileError,
        ralphFileStatus: inspection.fileStatus,
        missingRalphPaths,
        manifests: summary.manifests,
        projectMarkers: summary.projectMarkers,
        lifecycleCommands: summary.lifecycleCommands,
        validationCommands: summary.validationCommands,
        ciFiles: summary.ciFiles,
        ciCommands: summary.ciCommands,
        progressPath: inspection.paths.progressPath,
        taskFilePath: inspection.paths.taskFilePath,
        stateFilePath: inspection.paths.stateFilePath,
        artifactDir: inspection.paths.artifactDir,
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
    const engine = new iterationEngine_1.RalphIterationEngine(stateManager, strategies, logger);
    registerCommand(context, logger, {
        commandId: 'ralphCodex.generatePrompt',
        label: 'Ralph Codex: Prepare Prompt',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const prepared = await engine.preparePrompt(workspaceFolder, progress);
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
                promptKind: prepared.promptKind,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                validationCommand: prepared.validationCommand
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
            const prepared = await engine.preparePrompt(workspaceFolder, progress);
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
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false
            });
            if (run.result.executionStatus === 'failed') {
                throw new Error(iterationFailureMessage(run.result));
            }
            const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
            const baseMessage = run.result.executionStatus === 'skipped'
                ? `Ralph CLI iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
                : `Ralph CLI iteration ${run.result.iteration} completed. ${run.result.summary}`;
            void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
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
                iterationCap: config.ralphIterationCap,
                verifierModes: config.verifierModes,
                noProgressThreshold: config.noProgressThreshold,
                repeatedFailureThreshold: config.repeatedFailureThreshold
            });
            let lastRun = null;
            for (let index = 0; index < config.ralphIterationCap; index += 1) {
                progress.report({
                    message: `Running Ralph loop iteration ${index + 1} of ${config.ralphIterationCap}`,
                    increment: 100 / config.ralphIterationCap
                });
                lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
                    reachedIterationCap: index + 1 >= config.ralphIterationCap
                });
                if (lastRun.result.executionStatus === 'failed') {
                    throw new Error(iterationFailureMessage(lastRun.result));
                }
                if (!lastRun.loopDecision.shouldContinue) {
                    void vscode.window.showInformationMessage(`Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`);
                    return;
                }
            }
            void vscode.window.showInformationMessage(lastRun
                ? `Ralph CLI loop completed ${config.ralphIterationCap} iteration(s). Last outcome: ${lastRun.result.completionClassification}.`
                : 'Ralph CLI loop completed with no iterations.');
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
            const confirmed = await vscode.window.showWarningMessage('Reset Ralph runtime state? This preserves the PRD, progress log, and task file, but deletes .ralph/state.json, generated prompts, run artifacts, iteration artifacts, and extension logs.', { modal: true }, 'Reset');
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