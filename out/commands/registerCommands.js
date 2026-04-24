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
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const providers_1 = require("../config/providers");
const providerFactory_1 = require("../codex/providerFactory");
const iterationEngine_1 = require("../ralph/iterationEngine");
const stateManager_1 = require("../ralph/stateManager");
const taskFile_1 = require("../ralph/taskFile");
const codexCliSupport_1 = require("../services/codexCliSupport");
const async_1 = require("../util/async");
const error_1 = require("../util/error");
const fs_1 = require("../util/fs");
const validate_1 = require("../util/validate");
const prdCreationWizardPanel_1 = require("../ui/prdCreationWizardPanel");
const workspaceSupport_1 = require("./workspaceSupport");
const statusSnapshot_1 = require("./statusSnapshot");
const artifactCommands_1 = require("./artifactCommands");
const pipeline_1 = require("../ralph/pipeline");
const pathResolver_1 = require("../ralph/pathResolver");
const projectGenerator_1 = require("../ralph/projectGenerator");
const crewRoster_1 = require("../ralph/crewRoster");
const taskSeeding_1 = require("./taskSeeding");
const prdWizardPersistence_1 = require("./prdWizardPersistence");
const taskCreation_1 = require("../ralph/taskCreation");
const preflight_1 = require("../ralph/preflight");
const prdCreationWizardHost_1 = require("../webview/prdCreationWizardHost");
const statusSnapshot_2 = require("./statusSnapshot");
const dashboardSnapshot_1 = require("../webview/dashboardSnapshot");
const taskDecomposition_1 = require("../ralph/taskDecomposition");
function createActiveLoopStopRegistry() {
    let nextSessionId = 1;
    const cancelledSessionIds = new Set();
    const activeSessionIds = new Set();
    return {
        begin() {
            const sessionId = nextSessionId++;
            activeSessionIds.add(sessionId);
            return {
                isCancellationRequested() {
                    return cancelledSessionIds.has(sessionId);
                },
                dispose() {
                    activeSessionIds.delete(sessionId);
                    cancelledSessionIds.delete(sessionId);
                }
            };
        },
        requestStop() {
            if (activeSessionIds.size === 0) {
                return false;
            }
            for (const sessionId of activeSessionIds) {
                cancelledSessionIds.add(sessionId);
            }
            return true;
        },
        hasActiveLoop() {
            return activeSessionIds.size > 0;
        }
    };
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
        throw new Error('Open a workspace folder before using Ralphdex.');
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
async function runSeedTasksFromFeatureRequestCommand(workspaceFolder, logger, options) {
    const requestText = await vscode.window.showInputBox({
        title: options.inputTitle,
        prompt: options.inputPrompt,
        placeHolder: options.inputPlaceholder
    });
    if (!requestText?.trim()) {
        return;
    }
    try {
        const seeded = await (0, taskSeeding_1.seedTasksFromFeatureRequest)(workspaceFolder, logger, {
            requestText,
            logContext: options.logContext
        });
        await openTextFile(seeded.tasksPath);
        void vscode.window.showInformationMessage(`${options.successMessagePrefix} ${seeded.createdTaskCount} ${options.successMessageTaskLabel}. ` +
            `tasks.json: ${seeded.tasksPath}. Artifact: ${seeded.artifactPath}.`, 'Got it');
    }
    catch (error) {
        const message = error instanceof taskSeeding_1.TaskSeedingCommandError
            ? error.message
            : (0, error_1.toErrorMessage)(error);
        void vscode.window.showErrorMessage(`Task seeding failed: ${message}`);
    }
}
async function readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger) {
    const status = await (0, statusSnapshot_2.collectStatusSnapshot)(workspaceFolder, stateManager, logger);
    const artifactPath = status.latestFailureAnalysisPath;
    if (!artifactPath) {
        return null;
    }
    try {
        const stats = await fs.stat(artifactPath);
        return `${artifactPath}:${stats.mtimeMs}`;
    }
    catch {
        return null;
    }
}
function buildSkipTaskBlocker(diagnosis) {
    return `Skipped after diagnosis (${diagnosis.category}): ${diagnosis.suggestedAction}`;
}
function summarizeProviderDiagnostics(messages) {
    return messages.join(' ');
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
 * Return two self-bootstrapping seed tasks that guide Ralph through expanding
 * a stub PRD into a full document and then generating a real backlog from it.
 * Used as the fallback when AI generation is unavailable or the user skips
 * the objective prompt.
 */
function buildBootstrapSeedTasks() {
    return [
        {
            id: 'T1',
            title: 'Expand PRD into a full product requirements document',
            status: 'todo',
            notes: 'Read the current content of .ralph/prd.md and expand it into a complete PRD. ' +
                'Include structured sections: # Title, ## Overview, ## Goals, ## Scope, ## Non-Goals, ' +
                'and 3–7 ## Work Area sections. Preserve the original user objective. ' +
                'Write the expanded PRD back to .ralph/prd.md.',
            acceptance: [
                'PRD contains a # title heading',
                'PRD contains ## Overview, ## Goals, and at least 3 ## work-area sections'
            ]
        },
        {
            id: 'T2',
            title: 'Create 10 new tasks in tasks.json based on the expanded PRD',
            status: 'todo',
            dependsOn: ['T1'],
            notes: 'Read the expanded PRD in .ralph/prd.md and create 10 actionable tasks in ' +
                '.ralph/tasks.json. Ensure at least 2 tasks have no dependencies (entry points) ' +
                'so Ralph can begin claiming work immediately. Use the v2 task schema: each task ' +
                'needs id, title, status, and optionally acceptance, dependsOn, context, and validation fields.',
            acceptance: [
                'tasks.json contains at least 10 new tasks beyond T1 and T2',
                'At least 2 of the new tasks have no dependsOn (entry points for Ralph)'
            ]
        }
    ];
}
/**
 * Append tasks to an existing tasks.json file under lock.
 */
function buildWizardGenerationPrompt(input) {
    if (input.mode === 'regenerate') {
        const suffix = [
            input.constraints.trim() ? `\n\n## Additional Constraints\n\n${input.constraints.trim()}` : '',
            input.nonGoals.trim() ? `\n\n## Additional Non-Goals\n\n${input.nonGoals.trim()}` : ''
        ].join('');
        return `${input.objective.trim()}${suffix}`;
    }
    const sections = [
        `Project type: ${input.projectType}`,
        '',
        'Objective:',
        input.objective.trim()
    ];
    if (input.constraints.trim()) {
        sections.push('', 'Constraints:', input.constraints.trim());
    }
    if (input.nonGoals.trim()) {
        sections.push('', 'Non-goals:', input.nonGoals.trim());
    }
    return sections.join('\n');
}
async function openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, options) {
    if (!panelManager) {
        throw new Error('PRD Creation Wizard is unavailable because the panel manager was not initialized.');
    }
    if (!(await (0, fs_1.pathExists)(paths.ralphDir))) {
        void vscode.window.showErrorMessage('No .ralph directory found. Run "Ralphdex: Initialize Workspace" first.');
        return;
    }
    prdCreationWizardPanel_1.PrdCreationWizardPanel.createOrReveal(panelManager, {
        initialMode: options?.mode ?? 'new',
        initialObjective: options?.initialObjective,
        initialPrdPreview: options?.initialPrdPreview,
        initialStep: options?.initialStep,
        initialPaths: {
            prdPath: paths.prdPath,
            tasksPath: paths.taskFilePath
        },
        generateDraft: async (input) => {
            const generated = await (0, projectGenerator_1.generateProjectDraft)({
                objective: buildWizardGenerationPrompt(input),
                projectType: input.projectType
            }, config, workspaceFolder.uri.fsPath);
            return {
                prdText: generated.prdText,
                tasks: generated.tasks.map((task) => ({
                    ...task,
                    status: task.status ?? 'todo'
                })),
                taskCountWarning: generated.taskCountWarning
            };
        },
        writeDraft: async (draft) => {
            return (0, prdWizardPersistence_1.writePrdWizardDraft)(draft, {
                prdPath: paths.prdPath,
                tasksPath: paths.taskFilePath
            });
        },
        onWriteComplete: async (result) => {
            logger.info('PRD wizard wrote Ralph files.', {
                filesWritten: result.filesWritten
            });
            await openTextFile(paths.prdPath);
            await openTextFile(paths.taskFilePath);
            const summary = (0, prdCreationWizardHost_1.relativeWizardWriteSummary)(workspaceFolder.uri.fsPath, result);
            void vscode.window.showInformationMessage(`PRD wizard wrote: ${summary.filesWritten.join(', ')}.`);
        }
    });
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
    lines.push('Run "Ralphdex: Apply Latest Task Decomposition Proposal" to commit these proposed child tasks.');
    return lines.join('\n');
}
function iterationFailureMessage(result) {
    return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralphdex output channel.`;
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
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: spec.label,
                cancellable: spec.cancellable ?? false
            }, async (progress, token) => spec.handler(progress, token));
            logger.info('Command completed.', { commandId: spec.commandId });
            return result;
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
function registerCommands(context, logger, broadcaster, panelManager) {
    const stateManager = new stateManager_1.RalphStateManager(context.workspaceState, logger);
    const strategies = new providerFactory_1.CodexStrategyRegistry(logger);
    const engine = new iterationEngine_1.RalphIterationEngine(stateManager, strategies, logger);
    const activeLoopStops = createActiveLoopStopRegistry();
    async function loadFocusedDiagnosis(workspaceFolder) {
        const status = await (0, statusSnapshot_2.collectStatusSnapshot)(workspaceFolder, stateManager, logger);
        return (0, dashboardSnapshot_1.buildDashboardSnapshot)(status).diagnosis;
    }
    async function showFailureDiagnosisNotification(workspaceFolder, previousArtifactStamp) {
        const currentArtifactStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
        if (!currentArtifactStamp || currentArtifactStamp === previousArtifactStamp) {
            return;
        }
        const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
        if (!diagnosis) {
            return;
        }
        const choice = await vscode.window.showInformationMessage(`Failure diagnosis ready for ${diagnosis.taskId}: ${diagnosis.summary}`, 'View Diagnosis', 'Auto-Recover', 'Skip Task');
        if (choice === 'View Diagnosis') {
            await vscode.commands.executeCommand('ralphCodex.openFailureDiagnosis', diagnosis.taskId);
        }
        else if (choice === 'Auto-Recover') {
            await vscode.commands.executeCommand('ralphCodex.autoRecoverTask', diagnosis.taskId);
        }
        else if (choice === 'Skip Task') {
            await vscode.commands.executeCommand('ralphCodex.skipTask', diagnosis.taskId);
        }
    }
    /**
     * Execute the post-scaffold pipeline phases starting at `startPhase`.
     * Writes a phase checkpoint to the artifact after each sub-phase completes
     * so a crash at any point leaves a resumable artifact on disk.
     */
    async function runPipelineFromPhase(startPhase, artifact, workspaceFolder, config, paths, progress) {
        let current = artifact;
        const checkpoint = async (updates) => {
            current = { ...current, ...updates };
            await (0, pipeline_1.writePipelineArtifact)(paths.artifactDir, current);
        };
        // --- Loop phase ---
        let loopStatus = 'complete';
        if (startPhase === 'loop') {
            progress.report({ message: `Pipeline ${current.runId}: starting multi-agent loop (${current.decomposedTaskIds.length} task(s))` });
            try {
                await vscode.commands.executeCommand('ralphCodex.runMultiAgentLoop');
            }
            catch (error) {
                loopStatus = 'failed';
                logger.error('Pipeline multi-agent loop failed.', error);
            }
            if (loopStatus === 'complete') {
                await checkpoint({ phase: 'loop' });
            }
        }
        // --- Review phase ---
        let reviewTranscriptPath;
        let runScm = startPhase === 'scm';
        if (loopStatus === 'complete' && startPhase !== 'scm') {
            progress.report({ message: `Pipeline ${current.runId}: running review agent` });
            try {
                const reviewRun = await vscode.commands.executeCommand('ralphCodex.runReviewAgent');
                reviewTranscriptPath = reviewRun?.transcriptPath;
                await checkpoint({
                    phase: 'review',
                    ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath })
                });
                runScm = true;
            }
            catch (error) {
                logger.error('Pipeline review/SCM phase failed.', error);
            }
        }
        // --- SCM phase ---
        let prUrl;
        if (runScm) {
            progress.report({ message: `Pipeline ${current.runId}: running SCM agent` });
            try {
                const scmRun = await vscode.commands.executeCommand('ralphCodex.runScmAgent');
                prUrl = scmRun?.prUrl;
            }
            catch (error) {
                logger.error('Pipeline SCM phase failed.', error);
            }
        }
        // --- Finalize ---
        await checkpoint({
            status: loopStatus,
            loopEndTime: new Date().toISOString(),
            phase: 'done',
            ...(prUrl !== undefined && { prUrl })
        });
        logger.info('Pipeline run complete.', { runId: current.runId, status: loopStatus });
        const prSuffix = prUrl ? ` PR: ${prUrl}` : '';
        void vscode.window.showInformationMessage(`Ralph pipeline ${current.runId} finished with status: ${loopStatus}. Root task: ${current.rootTaskId} (${current.decomposedTaskIds.length} subtask(s)).${prSuffix}`);
    }
    registerCommand(context, logger, {
        commandId: 'ralphCodex.initializeWorkspace',
        label: 'Ralphdex: Initialize Workspace',
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
            // Read config to know which CLI provider to use for generation
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            // Step 1: Prompt for objective
            const objective = await vscode.window.showInputBox({
                prompt: 'Enter a short project objective (press Escape to fill in prd.md manually)',
                placeHolder: 'Example: Build a reliable v2 iteration engine for the VS Code extension',
                ignoreFocusOut: true
            });
            let prdText;
            let drafts;
            if (objective?.trim()) {
                progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
                try {
                    const generated = await (0, projectGenerator_1.generateProjectDraft)(objective.trim(), config, workspaceFolder.uri.fsPath);
                    prdText = generated.prdText;
                    drafts = generated.tasks;
                    logger.info('Generated PRD and tasks via AI.', { taskCount: drafts.length });
                }
                catch (err) {
                    const reason = err instanceof projectGenerator_1.ProjectGenerationError || err instanceof Error
                        ? err.message
                        : String(err);
                    logger.info(`AI generation failed, falling back to bootstrap seed tasks. Reason: ${reason}`);
                    void vscode.window.showWarningMessage(`AI generation failed — files seeded with bootstrap tasks. Refine before running. (${reason})`);
                    prdText = `# Product / project brief\n\n${objective.trim()}\n`;
                    drafts = buildBootstrapSeedTasks();
                }
            }
            else {
                prdText = RALPH_PRD_PLACEHOLDER;
                drafts = buildBootstrapSeedTasks();
            }
            await fs.writeFile(result.prdPath, prdText, 'utf8');
            logger.info('Wrote prd.md.');
            // Step 2: Write starter tasks
            await (0, taskCreation_1.appendNormalizedTasksToFile)(result.tasksPath, drafts);
            logger.info(`Wrote ${drafts.length} starter task(s) to tasks.json.`);
            // Open both files side-by-side so the user can review and refine
            await openTextFile(result.prdPath);
            await openTextFile(result.tasksPath);
            void vscode.window.showInformationMessage(`Ralph workspace ready. Review prd.md and tasks.json — refine them with your AI assistant before running your first loop.`, 'Got it');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openPrdWizard',
        label: 'Ralphdex: Open PRD Wizard',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const paths = (0, pathResolver_1.resolveRalphPaths)(workspaceFolder.uri.fsPath, config);
            if (!(await (0, fs_1.pathExists)(paths.ralphDir))) {
                progress.report({ message: 'Creating a fresh .ralph workspace scaffold for the PRD wizard' });
                const result = await initializeFreshWorkspace(workspaceFolder.uri.fsPath);
                logger.info('Initialized a fresh Ralph workspace scaffold for the PRD wizard.', {
                    rootPath: workspaceFolder.uri.fsPath,
                    ralphDir: result.ralphDir,
                    prdPath: result.prdPath,
                    tasksPath: result.tasksPath,
                    progressPath: result.progressPath,
                    gitignorePath: result.gitignorePath
                });
            }
            await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
                mode: 'new',
                initialStep: 1
            });
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.addTask',
        label: 'Ralphdex: Add Task',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            await runSeedTasksFromFeatureRequestCommand(workspaceFolder, logger, {
                inputTitle: 'Add Task',
                inputPrompt: 'High-level feature or epic request to seed into backlog tasks',
                inputPlaceholder: 'e.g. Add a provider-backed task seeding engine with durable evidence',
                successMessagePrefix: 'Added',
                successMessageTaskLabel: 'seeded task(s)',
                logContext: 'Task seeding via addTask command'
            });
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.seedTasksFromFeatureRequest',
        label: 'Ralphdex: Seed Tasks from Feature Request',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            await runSeedTasksFromFeatureRequestCommand(workspaceFolder, logger, {
                inputTitle: 'Seed Tasks from Feature Request',
                inputPrompt: 'Describe the feature request or epic to seed into backlog tasks',
                inputPlaceholder: 'e.g. Add a provider-backed task seeding engine with durable evidence',
                successMessagePrefix: 'Seeded',
                successMessageTaskLabel: 'backlog task(s)',
                logContext: 'Task seeding via seedTasksFromFeatureRequest command'
            });
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.generatePrompt',
        label: 'Ralphdex: Prepare Prompt',
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
        label: 'Ralphdex: Open Codex IDE',
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
        label: 'Ralphdex: Run CLI Iteration',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const previousDiagnosisStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
            broadcaster?.emitIterationStart({
                iteration: 0,
                iterationCap: 1,
                selectedTaskId: null,
                selectedTaskTitle: null,
                agentId: config.agentId
            });
            const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: { agentId: config.agentId },
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
            await showFailureDiagnosisNotification(workspaceFolder, previousDiagnosisStamp);
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
                },
                rolePolicySource: 'explicit'
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
            return {
                artifactDir: run.result.artifactDir,
                transcriptPath: run.result.execution.transcriptPath
            };
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
                },
                rolePolicySource: 'explicit'
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
                },
                rolePolicySource: 'explicit'
            });
            if (run.result.executionStatus === 'failed') {
                throw new Error(iterationFailureMessage(run.result));
            }
            const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
            const baseMessage = run.result.executionStatus === 'skipped'
                ? `Ralph SCM iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
                : `Ralph SCM iteration ${run.result.iteration} completed. ${run.result.summary}`;
            void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
            const completionReportPath = path.join(run.result.artifactDir, 'completion-report.json');
            const completionArtifact = await (0, statusSnapshot_1.readJsonArtifact)(completionReportPath).then(statusSnapshot_1.normalizeCompletionReportArtifact);
            return {
                artifactDir: run.result.artifactDir,
                prUrl: (0, pipeline_1.extractPrUrl)(completionArtifact?.report?.progressNote)
            };
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.stopLoop',
        label: 'Ralphdex: Stop Loop',
        handler: async () => {
            if (!activeLoopStops.requestStop()) {
                void vscode.window.showWarningMessage('No Ralph loop is currently running.');
                return;
            }
            void vscode.window.showInformationMessage('Stop requested. Ralph will halt before starting the next iteration.');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runRalphLoop',
        label: 'Ralphdex: Run CLI Loop',
        cancellable: true,
        handler: async (progress, token) => {
            const stopHandle = activeLoopStops.begin();
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const previousDiagnosisStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
            logger.show(false);
            logger.info('Starting Ralph loop.', {
                rootPath: workspaceFolder.uri.fsPath,
                iterationCap: config.ralphIterationCap,
                verifierModes: config.verifierModes,
                noProgressThreshold: config.noProgressThreshold,
                repeatedFailureThreshold: config.repeatedFailureThreshold
            });
            try {
                broadcaster?.emitLoopStart(config.ralphIterationCap);
                let lastRun = null;
                for (let index = 0; index < config.ralphIterationCap; index += 1) {
                    if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
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
                        selectedTaskTitle: null,
                        agentId: config.agentId
                    });
                    lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
                        reachedIterationCap: index + 1 >= config.ralphIterationCap,
                        configOverrides: { agentId: config.agentId },
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
                                rolePolicySource: 'explicit',
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
                                    configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' },
                                    rolePolicySource: 'explicit'
                                });
                            }
                            catch (watchdogError) {
                                logger.warn('Auto-watchdog after stall failed.', { error: (0, error_1.toErrorMessage)(watchdogError) });
                            }
                        }
                        broadcaster?.emitLoopEnd(index + 1, lastRun.result.stopReason);
                        void vscode.window.showInformationMessage(`Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`);
                        await showFailureDiagnosisNotification(workspaceFolder, previousDiagnosisStamp);
                        return;
                    }
                }
                if (config.autoReviewOnLoopComplete && lastRun) {
                    progress.report({ message: 'Loop complete — running review agent' });
                    try {
                        await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                            reachedIterationCap: false,
                            configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) },
                            rolePolicySource: 'explicit'
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
            finally {
                stopHandle.dispose();
            }
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openFailureDiagnosis',
        label: 'Ralphdex: Open Failure Diagnosis',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
            if (!diagnosis) {
                void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
                return;
            }
            await vscode.commands.executeCommand('ralphCodex.showDashboard', {
                activeTab: 'diagnostics'
            });
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.autoRecoverTask',
        label: 'Ralphdex: Auto-Recover Task',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
            if (!diagnosis) {
                void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
                return;
            }
            if (diagnosis.category === 'task_ambiguity') {
                await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');
                return;
            }
            await vscode.commands.executeCommand('ralphCodex.runRalphIteration');
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.skipTask',
        label: 'Ralphdex: Skip Task',
        handler: async () => {
            const workspaceFolder = await withWorkspaceFolder();
            const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
            if (!diagnosis) {
                void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
                return;
            }
            const confirmed = await vscode.window.showWarningMessage(`Mark ${diagnosis.taskId} (${diagnosis.taskTitle}) blocked and skip it for now?`, { modal: true }, 'Skip Task');
            if (confirmed !== 'Skip Task') {
                return;
            }
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
            await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
            await (0, taskDecomposition_1.autoApplyMarkBlockedRemediation)({
                taskFilePath: inspection.paths.taskFilePath,
                taskId: diagnosis.taskId,
                blocker: buildSkipTaskBlocker(diagnosis)
            });
            void vscode.window.showInformationMessage(`Task ${diagnosis.taskId} marked blocked so the loop can move past it.`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runMultiAgentLoop',
        label: 'Ralphdex: Run Multi-Agent Loop',
        cancellable: true,
        handler: async (progress, token) => {
            const stopHandle = activeLoopStops.begin();
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
            // Resolve crew roster from .ralph/crew.json when present; fall back to agentCount synthesis.
            const crewJsonPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'crew.json');
            const crewResult = await (0, crewRoster_1.parseCrewRoster)(crewJsonPath);
            for (const warning of crewResult.warnings) {
                logger.warn(`crew.json: ${warning}`);
            }
            let agentSlots;
            if (crewResult.members !== null && crewResult.members.length > 0) {
                agentSlots = crewResult.members.map((member, i) => ({
                    slotIndex: i,
                    agentId: member.id,
                    crewMember: member
                }));
                logger.info('Multi-agent loop: using crew.json roster.', {
                    memberCount: agentSlots.length,
                    ids: agentSlots.map((slot) => slot.agentId).join(', ')
                });
            }
            else {
                // Fall back to anonymous agentId-N synthesis from agentCount.
                agentSlots = Array.from({ length: agentCount }, (_, i) => ({
                    slotIndex: i,
                    agentId: agentCount > 1 ? `${config.agentId}-${i + 1}` : config.agentId
                }));
            }
            progress.report({ message: `Starting ${agentSlots.length} concurrent agent loop(s)` });
            broadcaster?.emitLoopStart(config.ralphIterationCap);
            try {
                const agentLoops = agentSlots.map(async ({ agentId, crewMember }) => {
                    let lastRun = null;
                    for (let index = 0; index < config.ralphIterationCap; index += 1) {
                        if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
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
                            configOverrides: { agentId, ...(crewMember ? { agentRole: crewMember.role } : {}) },
                            rolePolicySource: crewMember ? 'crew' : 'preset',
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
                                    rolePolicySource: 'explicit',
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
                                        configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' },
                                        rolePolicySource: 'explicit'
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
                    throw new Error(`${failures.length} of ${agentSlots.length} agent(s) failed: ${messages}`);
                }
                if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
                    const startedIterations = fulfilled.reduce((count, result) => (count + (result.value.lastRun ? 1 : 0)), 0);
                    broadcaster?.emitLoopEnd(startedIterations, 'cancelled');
                    void vscode.window.showInformationMessage(`Ralph multi-agent loop cancelled after ${startedIterations} iteration start(s).`);
                    return;
                }
                const summary = fulfilled
                    .map(({ value: { agentId, lastRun } }) => lastRun ? `${agentId}: ${lastRun.result.completionClassification}` : `${agentId}: no iterations`)
                    .join('; ');
                broadcaster?.emitLoopEnd(config.ralphIterationCap, null);
                void vscode.window.showInformationMessage(`Ralph multi-agent loop finished (${agentSlots.length} agent(s)). ${summary}`);
            }
            finally {
                stopHandle.dispose();
            }
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.runPipeline',
        label: 'Ralphdex: Run Pipeline',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const paths = (0, pathResolver_1.resolveRalphPaths)(workspaceFolder.uri.fsPath, config);
            progress.report({ message: 'Scaffolding pipeline: decomposing PRD into tasks' });
            const { artifact, artifactPath, rootTaskId, childTaskIds } = await (0, pipeline_1.scaffoldPipelineRun)({
                prdPath: paths.prdPath,
                taskFilePath: paths.taskFilePath,
                artifactDir: paths.artifactDir,
                ralphDir: paths.ralphDir
            });
            logger.info('Pipeline scaffold created.', { runId: artifact.runId, rootTaskId, childTaskIds, artifactPath });
            await runPipelineFromPhase('loop', artifact, workspaceFolder, config, paths, progress);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.testCurrentProviderConnection',
        label: 'Ralphdex: Test Current Provider Connection',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const providerLabel = (0, providers_1.getCliProviderLabel)(config.cliProvider);
            progress.report({ message: `Testing ${providerLabel} provider readiness` });
            const cliSupport = await (0, codexCliSupport_1.inspectCliSupport)(config.cliProvider, (0, providers_1.getCliCommandPath)(config));
            const diagnostics = await (0, preflight_1.inspectProviderReadinessDiagnostics)({
                config,
                codexCliSupport: cliSupport,
                authFailureSeverity: 'error'
            });
            const summary = summarizeProviderDiagnostics(diagnostics.map((diagnostic) => diagnostic.message));
            logger.info('Provider readiness test completed.', {
                provider: config.cliProvider,
                commandPath: cliSupport.commandPath,
                checks: diagnostics.map((diagnostic) => ({
                    severity: diagnostic.severity,
                    code: diagnostic.code,
                    message: diagnostic.message
                }))
            });
            if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
                void vscode.window.showErrorMessage(summary);
                return;
            }
            if (diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) {
                void vscode.window.showWarningMessage(summary);
                return;
            }
            void vscode.window.showInformationMessage(summary || `${providerLabel} provider readiness checks passed.`);
        }
    });
    // ---------- Regenerate PRD ----------
    registerCommand(context, logger, {
        commandId: 'ralphCodex.regeneratePrd',
        label: 'Ralphdex: Regenerate PRD',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const paths = (0, pathResolver_1.resolveRalphPaths)(workspaceFolder.uri.fsPath, config);
            if (!(await (0, fs_1.pathExists)(paths.prdPath))) {
                void vscode.window.showErrorMessage('No .ralph/prd.md found. Run "Ralphdex: Initialize Workspace" first.');
                return;
            }
            const currentPrdText = await fs.readFile(paths.prdPath, 'utf8');
            await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
                mode: 'regenerate',
                initialObjective: currentPrdText,
                initialPrdPreview: currentPrdText,
                initialStep: 3
            });
            return;
            progress.report({ message: 'Generating refined PRD — this may take a moment…' });
            let generated;
            try {
                generated = await (0, projectGenerator_1.generateProjectDraft)(currentPrdText, config, workspaceFolder.uri.fsPath);
            }
            catch (err) {
                const reason = err instanceof Error
                    ? err.message
                    : String(err);
                void vscode.window.showErrorMessage(`PRD regeneration failed: ${reason}`);
                return;
            }
            const tempPath = path.join(os.tmpdir(), `ralph-prd-proposed-${Date.now()}.md`);
            await fs.writeFile(tempPath, generated.prdText, 'utf8');
            await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(paths.prdPath), vscode.Uri.file(tempPath), 'Regenerate PRD: Current ↔ Proposed');
            const choice = await vscode.window.showInformationMessage('Apply the refined PRD to prd.md?', 'Apply', 'Discard');
            if (choice === 'Apply') {
                await fs.writeFile(paths.prdPath, generated.prdText, 'utf8');
                logger.info('Regenerated PRD applied.', { prdPath: paths.prdPath });
                void vscode.window.showInformationMessage('Refined PRD saved to prd.md.');
            }
            else {
                logger.info('Regenerated PRD discarded by operator.');
            }
            try {
                await fs.unlink(tempPath);
            }
            catch {
                // best-effort temp file cleanup
            }
        }
    });
    // Delegate artifact-inspection and maintenance commands to the extracted module.
    (0, artifactCommands_1.registerArtifactAndMaintenanceCommands)(context, logger, stateManager, registerCommand);
    registerCommand(context, logger, {
        commandId: 'ralphCodex.setProviderSecret',
        label: 'Ralphdex: Set Provider Secret',
        handler: async () => {
            if (!('secrets' in context) || !context.secrets) {
                throw new Error('VS Code SecretStorage is not available in this environment.');
            }
            const secretKey = (await vscode.window.showInputBox({
                title: 'Set Provider Secret',
                prompt: 'Secret storage key',
                placeHolder: 'e.g. copilotFoundry.primary'
            }))?.trim();
            if (!secretKey) {
                return;
            }
            const secretValue = await vscode.window.showInputBox({
                title: 'Set Provider Secret',
                prompt: `Secret value for ${secretKey}`,
                password: true,
                ignoreFocusOut: true
            });
            if (typeof secretValue !== 'string' || secretValue.length === 0) {
                return;
            }
            await context.secrets.store(secretKey, secretValue);
            void vscode.window.showInformationMessage(`Stored provider secret in VS Code SecretStorage: ${secretKey}.`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.clearProviderSecret',
        label: 'Ralphdex: Clear Provider Secret',
        handler: async () => {
            if (!('secrets' in context) || !context.secrets) {
                throw new Error('VS Code SecretStorage is not available in this environment.');
            }
            const secretKey = (await vscode.window.showInputBox({
                title: 'Clear Provider Secret',
                prompt: 'Secret storage key to delete',
                placeHolder: 'e.g. copilotFoundry.primary'
            }))?.trim();
            if (!secretKey) {
                return;
            }
            await context.secrets.delete(secretKey);
            void vscode.window.showInformationMessage(`Cleared provider secret from VS Code SecretStorage: ${secretKey}.`);
        }
    });
    // Open VS Code settings filtered to RalphDex settings.
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:s0l0m0n8und9.ralphdex');
    }));
    // Show the Ralphdex activity bar sidebar (focuses the dashboard view).
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.showSidebar', async () => {
        await vscode.commands.executeCommand('ralphCodex.dashboard.focus');
    }));
    // Focus the durable task tree view inside the Ralphdex activity bar.
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.showTasks', async () => {
        await vscode.commands.executeCommand('ralphCodex.tasks.focus');
    }));
}
//# sourceMappingURL=registerCommands.js.map