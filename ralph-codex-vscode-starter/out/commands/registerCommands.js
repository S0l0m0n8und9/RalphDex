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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const providerFactory_1 = require("../codex/providerFactory");
const iterationEngine_1 = require("../ralph/iterationEngine");
const stateManager_1 = require("../ralph/stateManager");
const taskFile_1 = require("../ralph/taskFile");
const async_1 = require("../util/async");
const error_1 = require("../util/error");
const fs_1 = require("../util/fs");
const validate_1 = require("../util/validate");
const workspaceSupport_1 = require("./workspaceSupport");
const statusSnapshot_1 = require("./statusSnapshot");
const artifactCommands_1 = require("./artifactCommands");
const pipeline_1 = require("../ralph/pipeline");
const pathResolver_1 = require("../ralph/pathResolver");
function createdPathSummary(rootPath, createdPaths) {
    if (createdPaths.length === 0) {
        return null;
    }
    const labels = createdPaths
        .map((target) => path.relative(rootPath, target) || path.basename(target))
        .join(', ');
    return `Initialized or repaired Ralph workspace paths: ${labels}.`;
}
const RALPH_GITIGNORE_CONTENT = [
    '/artifacts',
    '/done-task-audit*.md',
    '/logs',
    '/prompts',
    '/runs',
    '/state.json'
].join('\n');
const RALPH_PRD_PLACEHOLDER = '<!-- TODO: Replace with your Ralph objective before running iterations. -->\n';
async function withWorkspaceFolder() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
    }
    return folder;
}
async function showWarnings(warnings) {
    if (warnings.length === 0) {
        return;
    }
    await vscode.window.showWarningMessage(warnings.join(' '));
}
async function openTextFile(target) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document, { preview: false });
}
async function initializeFreshWorkspace(rootPath) {
    const ralphDir = path.join(rootPath, '.ralph');
    const prdPath = path.join(ralphDir, 'prd.md');
    const tasksPath = path.join(ralphDir, 'tasks.json');
    const progressPath = path.join(ralphDir, 'progress.md');
    const gitignorePath = path.join(ralphDir, '.gitignore');
    if (await (0, fs_1.pathExists)(prdPath)) {
        throw new Error('Ralph workspace initialization aborted because .ralph/prd.md already exists.');
    }
    await fs.mkdir(ralphDir, { recursive: true });
    await fs.writeFile(prdPath, RALPH_PRD_PLACEHOLDER, 'utf8');
    const taskFileLocked = await (0, taskFile_1.withTaskFileLock)(tasksPath, undefined, async () => {
        await fs.writeFile(tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
    });
    if (taskFileLocked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${taskFileLocked.lockPath} after ${taskFileLocked.attempts} attempt(s).`);
    }
    await fs.writeFile(progressPath, '', 'utf8');
    if (!(await (0, fs_1.pathExists)(gitignorePath))) {
        await fs.writeFile(gitignorePath, `${RALPH_GITIGNORE_CONTENT}\n`, 'utf8');
    }
    return {
        ralphDir,
        prdPath,
        tasksPath,
        progressPath,
        gitignorePath
    };
}
/**
 * Derive initial task drafts from PRD text.
 * Returns tasks whose titles come from the PRD's headings (or a placeholder).
 * IDs start at T<offset+1>.
 */
function draftTasksFromPrd(prdText, idOffset = 0) {
    const sections = (0, pipeline_1.parsePrdSections)(prdText);
    return sections.map((title, i) => ({
        id: `T${idOffset + i + 1}`,
        title,
        status: 'todo'
    }));
}
/**
 * Append tasks to an existing tasks.json file under lock.
 */
async function appendTasksToFile(tasksPath, newTasks) {
    if (newTasks.length === 0) {
        return;
    }
    const locked = await (0, taskFile_1.withTaskFileLock)(tasksPath, undefined, async () => {
        const raw = await fs.readFile(tasksPath, 'utf8');
        const taskFile = (0, taskFile_1.parseTaskFile)(raw);
        const next = (0, taskFile_1.bumpMutationCount)({
            ...taskFile,
            tasks: [...taskFile.tasks, ...newTasks]
        });
        await fs.writeFile(tasksPath, (0, taskFile_1.stringifyTaskFile)(next), 'utf8');
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
function buildReviewAgentId(agentId) {
    return (0, validate_1.buildPrefixedAgentId)('review', agentId);
}
function buildScmAgentId(agentId) {
    return (0, validate_1.buildPrefixedAgentId)('scm', agentId);
}
function renderSuggestedChildTasksForOutput(tasks) {
    const lines = ['Review agent proposed follow-up tasks:'];
    for (const task of tasks) {
        lines.push(`- ${task.id}: ${task.title}`);
        lines.push(`  parent: ${task.parentId}`);
        lines.push(`  rationale: ${task.rationale}`);
        lines.push(`  validation: ${task.validation ?? 'none'}`);
        lines.push(`  dependsOn: ${task.dependsOn.length > 0 ? task.dependsOn.map((dependency) => `${dependency.taskId} (${dependency.reason})`).join(', ') : 'none'}`);
    }
    lines.push('Run "Ralph Codex: Apply Latest Task Decomposition Proposal" to commit these proposed child tasks.');
    return lines.join('\n');
}
function iterationFailureMessage(result) {
    return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralph Codex output channel.`;
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
                cancellable: spec.cancellable ?? false
            }, async (progress, token) => spec.handler(progress, token));
            logger.info('Command completed.', { commandId: spec.commandId });
        }
        catch (error) {
            logger.show(false);
            logger.error(`Command failed: ${spec.commandId}`, error);
            const choice = await vscode.window.showErrorMessage((0, error_1.toErrorMessage)(error), 'Show Output');
            if (choice === 'Show Output') {
                logger.show(false);
            }
        }
    }));
}
function registerCommands(context, logger, broadcaster) {
    const stateManager = new stateManager_1.RalphStateManager(context.workspaceState, logger);
    const strategies = new providerFactory_1.CodexStrategyRegistry(logger);
    const engine = new iterationEngine_1.RalphIterationEngine(stateManager, strategies, logger);
    registerCommand(context, logger, {
        commandId: 'ralphCodex.initializeWorkspace',
        label: 'Ralph Codex: Initialize Workspace',
        handler: async (progress) => {
            progress.report({ message: 'Creating a fresh .ralph workspace scaffold' });
            const workspaceFolder = await withWorkspaceFolder();
            const prdPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'prd.md');
            if (await (0, fs_1.pathExists)(prdPath)) {
                void vscode.window.showWarningMessage('Ralph workspace initialization aborted because .ralph/prd.md already exists. Refusing to overwrite active Ralph state.');
                return;
            }
            const result = await initializeFreshWorkspace(workspaceFolder.uri.fsPath);
            logger.info('Initialized a fresh Ralph workspace scaffold.', {
                rootPath: workspaceFolder.uri.fsPath,
                ralphDir: result.ralphDir,
                prdPath: result.prdPath,
                tasksPath: result.tasksPath,
                progressPath: result.progressPath,
                gitignorePath: result.gitignorePath
            });
            // Step 1: Seed the PRD with a brief objective
            const objective = await vscode.window.showInputBox({
                prompt: 'Enter a short project objective (press Escape to fill in prd.md manually)',
                placeHolder: 'Example: Build a reliable v2 iteration engine for the VS Code extension',
                ignoreFocusOut: true
            });
            const prdText = objective?.trim()
                ? `# Product / project brief\n\n${objective.trim()}\n`
                : RALPH_PRD_PLACEHOLDER;
            if (objective?.trim()) {
                await fs.writeFile(result.prdPath, prdText, 'utf8');
                logger.info('Seeded PRD with user-provided objective.');
            }
            // Step 2: Auto-generate starter tasks from PRD headings
            const drafts = draftTasksFromPrd(prdText);
            await appendTasksToFile(result.tasksPath, drafts);
            logger.info(`Generated ${drafts.length} starter task(s) from PRD.`);
            // Open both files side-by-side so the user can review and refine
            await openTextFile(result.prdPath);
            await openTextFile(result.tasksPath);
            void vscode.window.showInformationMessage(`Ralph workspace ready. Review prd.md and tasks.json — refine them with your AI assistant before running your first loop.`, 'Got it');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.addTask',
        label: 'Ralph Codex: Add Task',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            const tasksPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'tasks.json');
            const prdPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'prd.md');
            if (!(await (0, fs_1.pathExists)(tasksPath))) {
                void vscode.window.showErrorMessage('No .ralph/tasks.json found. Run "Ralph Codex: Initialize Workspace" first.');
                return;
            }
            const raw = await fs.readFile(tasksPath, 'utf8');
            const taskFile = (0, taskFile_1.parseTaskFile)(raw);
            const idOffset = taskFile.tasks.length;
            const prdText = (await (0, fs_1.pathExists)(prdPath))
                ? await fs.readFile(prdPath, 'utf8')
                : '';
            const drafts = draftTasksFromPrd(prdText, idOffset);
            // Avoid collisions with existing IDs
            const existingIds = new Set(taskFile.tasks.map((t) => t.id));
            let counter = idOffset + 1;
            const deduped = drafts.map((t) => {
                while (existingIds.has(`T${counter}`)) {
                    counter++;
                }
                const id = `T${counter}`;
                existingIds.add(id);
                counter++;
                return { ...t, id };
            });
            await appendTasksToFile(tasksPath, deduped);
            logger.info(`Generated ${deduped.length} task(s) from PRD via addTask command.`);
            await openTextFile(tasksPath);
            void vscode.window.showInformationMessage(`Added ${deduped.length} task(s) from PRD. Review and refine tasks.json before running your loop.`, 'Got it');
        }
    });
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
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                executionPlanPath: prepared.executionPlanPath,
                nextIteration: recordState.nextIteration,
                promptKind: prepared.promptKind,
                promptTarget: prepared.executionPlan.promptTarget,
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
            broadcaster?.emitIterationStart({
                iteration: 0,
                iterationCap: 1,
                selectedTaskId: null,
                selectedTaskTitle: null
            });
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                broadcaster
            });
            broadcaster?.emitIterationEnd({
                iteration: run.result.iteration,
                classification: run.result.completionClassification,
                stopReason: run.result.stopReason
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
        commandId: 'ralphCodex.runReviewAgent',
        label: 'Ralph: Run Review Agent',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: {
                    agentRole: 'review',
                    agentId: buildReviewAgentId(config.agentId)
                }
            });
            if (run.result.executionStatus === 'failed') {
                throw new Error(iterationFailureMessage(run.result));
            }
            const completionReportPath = path.join(run.result.artifactDir, 'completion-report.json');
            const completionArtifact = await (0, statusSnapshot_1.readJsonArtifact)(completionReportPath).then(statusSnapshot_1.normalizeCompletionReportArtifact);
            const suggestedChildTasks = completionArtifact?.report?.suggestedChildTasks ?? [];
            if (suggestedChildTasks.length > 0) {
                logger.show(false);
                logger.appendText(renderSuggestedChildTasksForOutput(suggestedChildTasks));
                const choice = await vscode.window.showInformationMessage(`Review agent proposed ${suggestedChildTasks.length} follow-up task(s). Run Apply Latest Task Decomposition Proposal to commit them.`, 'Apply Latest Task Decomposition Proposal', 'Show Output');
                if (choice === 'Apply Latest Task Decomposition Proposal') {
                    await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');
                }
                else if (choice === 'Show Output') {
                    logger.show(false);
                }
            }
            const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
            const baseMessage = run.result.executionStatus === 'skipped'
                ? `Ralph review iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
                : `Ralph review iteration ${run.result.iteration} completed. ${run.result.summary}`;
            void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runWatchdogAgent',
        label: 'Ralph: Run Watchdog Agent',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: {
                    agentRole: 'watchdog',
                    agentId: 'watchdog'
                }
            });
            if (run.result.executionStatus === 'failed') {
                throw new Error(iterationFailureMessage(run.result));
            }
            const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
            const baseMessage = run.result.executionStatus === 'skipped'
                ? `Ralph watchdog iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
                : `Ralph watchdog iteration ${run.result.iteration} completed. ${run.result.summary}`;
            void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runScmAgent',
        label: 'Ralph: Run SCM Agent',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: {
                    agentRole: 'scm',
                    agentId: buildScmAgentId(config.agentId)
                }
            });
            if (run.result.executionStatus === 'failed') {
                throw new Error(iterationFailureMessage(run.result));
            }
            const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
            const baseMessage = run.result.executionStatus === 'skipped'
                ? `Ralph SCM iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
                : `Ralph SCM iteration ${run.result.iteration} completed. ${run.result.summary}`;
            void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runRalphLoop',
        label: 'Ralph Codex: Run CLI Loop',
        cancellable: true,
        handler: async (progress, token) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            logger.show(false);
            logger.info('Starting Ralph loop.', {
                rootPath: workspaceFolder.uri.fsPath,
                iterationCap: config.ralphIterationCap,
                verifierModes: config.verifierModes,
                noProgressThreshold: config.noProgressThreshold,
                repeatedFailureThreshold: config.repeatedFailureThreshold
            });
            broadcaster?.emitLoopStart(config.ralphIterationCap);
            let lastRun = null;
            for (let index = 0; index < config.ralphIterationCap; index += 1) {
                if (token.isCancellationRequested) {
                    broadcaster?.emitLoopEnd(index, 'cancelled');
                    void vscode.window.showInformationMessage(`Ralph CLI loop cancelled after ${index} iteration(s).`);
                    return;
                }
                progress.report({
                    message: `Running Ralph loop iteration ${index + 1} of ${config.ralphIterationCap}`,
                    increment: 100 / config.ralphIterationCap
                });
                broadcaster?.emitIterationStart({
                    iteration: index + 1,
                    iterationCap: config.ralphIterationCap,
                    selectedTaskId: null,
                    selectedTaskTitle: null
                });
                lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
                    reachedIterationCap: index + 1 >= config.ralphIterationCap,
                    broadcaster
                });
                broadcaster?.emitIterationEnd({
                    iteration: lastRun.result.iteration,
                    classification: lastRun.result.completionClassification,
                    stopReason: lastRun.result.stopReason
                });
                if (lastRun.result.executionStatus === 'failed') {
                    broadcaster?.emitLoopEnd(index + 1, 'execution_failed');
                    throw new Error(iterationFailureMessage(lastRun.result));
                }
                if (lastRun.autoReviewContext && config.autoReviewOnParentDone) {
                    progress.report({ message: `Parent ${lastRun.autoReviewContext.parentTaskId} done — running review agent` });
                    try {
                        await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                            reachedIterationCap: false,
                            configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) },
                            focusTaskId: lastRun.autoReviewContext.parentTaskId
                        });
                    }
                    catch (reviewError) {
                        logger.warn('Auto-review after parent-done failed.', { error: (0, error_1.toErrorMessage)(reviewError) });
                    }
                }
                if (!lastRun.loopDecision.shouldContinue) {
                    if (lastRun.result.stopReason === 'control_plane_reload_required'
                        && config.autoReloadOnControlPlaneChange) {
                        logger.info('Ralph is reloading the extension host to apply control-plane changes.', {
                            iteration: lastRun.result.iteration,
                            stopReason: lastRun.result.stopReason
                        });
                        await (0, async_1.sleep)(1500);
                        await vscode.commands.executeCommand('workbench.action.reloadWindow');
                        return;
                    }
                    const isStallStop = lastRun.result.stopReason === 'repeated_no_progress'
                        || lastRun.result.stopReason === 'repeated_identical_failure';
                    if (isStallStop && config.autoWatchdogOnStall) {
                        progress.report({ message: 'Loop stalled — running watchdog agent' });
                        try {
                            await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                                reachedIterationCap: false,
                                configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' }
                            });
                        }
                        catch (watchdogError) {
                            logger.warn('Auto-watchdog after stall failed.', { error: (0, error_1.toErrorMessage)(watchdogError) });
                        }
                    }
                    broadcaster?.emitLoopEnd(index + 1, lastRun.result.stopReason);
                    void vscode.window.showInformationMessage(`Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`);
                    return;
                }
            }
            if (config.autoReviewOnLoopComplete && lastRun) {
                progress.report({ message: 'Loop complete — running review agent' });
                try {
                    await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                        reachedIterationCap: false,
                        configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) }
                    });
                }
                catch (reviewError) {
                    logger.warn('Auto-review on loop complete failed.', { error: (0, error_1.toErrorMessage)(reviewError) });
                }
            }
            broadcaster?.emitLoopEnd(config.ralphIterationCap, lastRun?.result.stopReason ?? null);
            void vscode.window.showInformationMessage(lastRun
                ? `Ralph CLI loop completed ${config.ralphIterationCap} iteration(s). Last outcome: ${lastRun.result.completionClassification}.`
                : 'Ralph CLI loop completed with no iterations.');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runMultiAgentLoop',
        label: 'Ralph Codex: Run Multi-Agent Loop',
        cancellable: true,
        handler: async (progress, token) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const agentCount = config.agentCount;
            logger.show(false);
            logger.info('Starting multi-agent loop.', {
                rootPath: workspaceFolder.uri.fsPath,
                agentCount,
                iterationCap: config.ralphIterationCap
            });
            if (agentCount < 2) {
                void vscode.window.showWarningMessage('ralphCodex.agentCount is 1. Running a single-agent loop. Set agentCount ≥ 2 for concurrent multi-agent mode.');
            }
            progress.report({ message: `Starting ${agentCount} concurrent agent loop(s)` });
            broadcaster?.emitLoopStart(config.ralphIterationCap);
            // Build distinct agentId per slot. Use suffix only when multiple agents share the same base id.
            const agentSlots = Array.from({ length: agentCount }, (_, i) => ({
                slotIndex: i,
                agentId: agentCount > 1 ? `${config.agentId}-${i + 1}` : config.agentId
            }));
            const agentLoops = agentSlots.map(async ({ agentId }) => {
                let lastRun = null;
                for (let index = 0; index < config.ralphIterationCap; index += 1) {
                    if (token.isCancellationRequested) {
                        logger.info('Multi-agent loop: cancelled by user.', { agentId, iteration: index });
                        return { agentId, lastRun, reloadRequired: false };
                    }
                    broadcaster?.emitIterationStart({
                        iteration: index + 1,
                        iterationCap: config.ralphIterationCap,
                        selectedTaskId: null,
                        selectedTaskTitle: null,
                        agentId
                    });
                    lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
                        reachedIterationCap: index + 1 >= config.ralphIterationCap,
                        configOverrides: { agentId },
                        broadcaster
                    });
                    broadcaster?.emitIterationEnd({
                        iteration: lastRun.result.iteration,
                        classification: lastRun.result.completionClassification,
                        stopReason: lastRun.result.stopReason,
                        agentId
                    });
                    if (lastRun.result.executionStatus === 'failed') {
                        throw new Error(`Agent ${agentId}: ${iterationFailureMessage(lastRun.result)}`);
                    }
                    if (lastRun.autoReviewContext && config.autoReviewOnParentDone) {
                        try {
                            await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                                reachedIterationCap: false,
                                configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(agentId) },
                                focusTaskId: lastRun.autoReviewContext.parentTaskId
                            });
                        }
                        catch (reviewError) {
                            logger.warn('Multi-agent auto-review after parent-done failed.', { agentId, error: (0, error_1.toErrorMessage)(reviewError) });
                        }
                    }
                    if (!lastRun.loopDecision.shouldContinue) {
                        if (lastRun.result.stopReason === 'control_plane_reload_required'
                            && config.autoReloadOnControlPlaneChange) {
                            logger.info('Multi-agent loop: agent hit control-plane change.', { agentId, iteration: lastRun.result.iteration });
                            return { agentId, lastRun, reloadRequired: true };
                        }
                        const isStallStop = lastRun.result.stopReason === 'repeated_no_progress'
                            || lastRun.result.stopReason === 'repeated_identical_failure';
                        if (isStallStop && config.autoWatchdogOnStall) {
                            try {
                                await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                                    reachedIterationCap: false,
                                    configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' }
                                });
                            }
                            catch (watchdogError) {
                                logger.warn('Multi-agent auto-watchdog after stall failed.', { agentId, error: (0, error_1.toErrorMessage)(watchdogError) });
                            }
                        }
                        logger.info('Multi-agent loop: agent stopped early.', {
                            agentId,
                            iteration: lastRun.result.iteration,
                            stopReason: lastRun.result.stopReason,
                            message: lastRun.loopDecision.message
                        });
                        return { agentId, lastRun, reloadRequired: false };
                    }
                }
                return { agentId, lastRun, reloadRequired: false };
            });
            const settled = await Promise.allSettled(agentLoops);
            const failures = settled.filter((r) => r.status === 'rejected');
            const fulfilled = settled.filter((r) => r.status === 'fulfilled');
            if (fulfilled.some((r) => r.value.reloadRequired)) {
                logger.info('Multi-agent loop: reloading extension host to apply control-plane changes.', {});
                await (0, async_1.sleep)(1500);
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
                return;
            }
            if (failures.length > 0) {
                const messages = failures.map((r) => (0, error_1.toErrorMessage)(r.reason)).join('; ');
                throw new Error(`${failures.length} of ${agentCount} agent(s) failed: ${messages}`);
            }
            const summary = fulfilled
                .map(({ value: { agentId, lastRun } }) => lastRun ? `${agentId}: ${lastRun.result.completionClassification}` : `${agentId}: no iterations`)
                .join('; ');
            broadcaster?.emitLoopEnd(config.ralphIterationCap, null);
            void vscode.window.showInformationMessage(`Ralph multi-agent loop finished (${agentCount} agent(s)). ${summary}`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runPipeline',
        label: 'Ralph Codex: Run Pipeline',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const paths = (0, pathResolver_1.resolveRalphPaths)(workspaceFolder.uri.fsPath, config);
            progress.report({ message: 'Scaffolding pipeline: decomposing PRD into tasks' });
            const { artifact, artifactPath, rootTaskId, childTaskIds } = await (0, pipeline_1.scaffoldPipelineRun)({
                prdPath: paths.prdPath,
                taskFilePath: paths.taskFilePath,
                artifactDir: paths.artifactDir
            });
            logger.info('Pipeline scaffold created.', {
                runId: artifact.runId,
                rootTaskId,
                childTaskIds,
                artifactPath
            });
            progress.report({ message: `Pipeline ${artifact.runId}: starting multi-agent loop (${childTaskIds.length} task(s))` });
            let loopStatus = 'complete';
            try {
                await vscode.commands.executeCommand('ralphCodex.runMultiAgentLoop');
            }
            catch (error) {
                loopStatus = 'failed';
                logger.error('Pipeline multi-agent loop failed.', error);
            }
            // Review→PR phase: only run when the multi-agent loop succeeded.
            let reviewTranscriptPath;
            let prUrl;
            if (loopStatus === 'complete') {
                progress.report({ message: `Pipeline ${artifact.runId}: running review agent` });
                try {
                    const reviewRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                        reachedIterationCap: false,
                        configOverrides: {
                            agentRole: 'review',
                            agentId: buildReviewAgentId(config.agentId)
                        }
                    });
                    reviewTranscriptPath = reviewRun.result.execution.transcriptPath;
                    if (reviewRun.result.executionStatus !== 'failed') {
                        progress.report({ message: `Pipeline ${artifact.runId}: running SCM agent` });
                        const scmRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                            reachedIterationCap: false,
                            configOverrides: {
                                agentRole: 'scm',
                                agentId: buildScmAgentId(config.agentId)
                            }
                        });
                        const scmReportPath = path.join(scmRun.result.artifactDir, 'completion-report.json');
                        const scmReport = await (0, statusSnapshot_1.readJsonArtifact)(scmReportPath).then(statusSnapshot_1.normalizeCompletionReportArtifact);
                        prUrl = (0, pipeline_1.extractPrUrl)(scmReport?.report?.progressNote);
                    }
                }
                catch (error) {
                    logger.error('Pipeline review/SCM phase failed.', error);
                }
            }
            const finalArtifact = {
                ...artifact,
                status: loopStatus,
                loopEndTime: new Date().toISOString(),
                ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath }),
                ...(prUrl !== undefined && { prUrl })
            };
            await (0, pipeline_1.writePipelineArtifact)(paths.artifactDir, finalArtifact);
            logger.info('Pipeline run complete.', {
                runId: artifact.runId,
                status: loopStatus,
                artifactPath
            });
            const prSuffix = prUrl ? ` PR: ${prUrl}` : '';
            void vscode.window.showInformationMessage(`Ralph pipeline ${artifact.runId} finished with status: ${loopStatus}. Root task: ${rootTaskId} (${childTaskIds.length} subtask(s)).${prSuffix}`);
        }
    });
    // Delegate artifact-inspection and maintenance commands to the extracted module.
    (0, artifactCommands_1.registerArtifactAndMaintenanceCommands)(context, logger, stateManager, registerCommand);
}
//# sourceMappingURL=registerCommands.js.map