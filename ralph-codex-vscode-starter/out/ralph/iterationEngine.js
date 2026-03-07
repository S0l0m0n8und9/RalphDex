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
exports.RalphIterationEngine = void 0;
const fs = __importStar(require("fs/promises"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const promptBuilder_1 = require("../prompt/promptBuilder");
const workspaceScanner_1 = require("../services/workspaceScanner");
const codexCliSupport_1 = require("../services/codexCliSupport");
const integrity_1 = require("./integrity");
const taskFile_1 = require("./taskFile");
const loopLogic_1 = require("./loopLogic");
const preflight_1 = require("./preflight");
const verifier_1 = require("./verifier");
const artifactStore_1 = require("./artifactStore");
const EMPTY_GIT_STATUS = {
    available: false,
    raw: '',
    entries: []
};
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function summarizeLastMessage(lastMessage, exitCode) {
    return lastMessage
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
        ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}
async function readVerifiedPromptArtifact(plan) {
    const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error) => {
        throw new Error(`Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${toErrorMessage(error)}`);
    });
    const artifactHash = (0, integrity_1.hashText)(promptArtifactText);
    if (artifactHash !== plan.promptHash) {
        throw new Error(`Execution integrity check failed before launch: prompt artifact hash ${artifactHash} did not match planned prompt hash ${plan.promptHash}.`);
    }
    return promptArtifactText;
}
function runRecordFromIteration(mode, prepared, startedAt, result) {
    if (result.executionStatus === 'skipped') {
        return undefined;
    }
    return {
        iteration: prepared.iteration,
        mode,
        promptKind: prepared.promptKind,
        startedAt,
        finishedAt: result.finishedAt,
        status: result.executionStatus === 'succeeded' ? 'succeeded' : 'failed',
        exitCode: result.execution.exitCode,
        promptPath: prepared.promptPath,
        transcriptPath: result.execution.transcriptPath,
        lastMessagePath: result.execution.lastMessagePath,
        summary: result.summary
    };
}
class RalphIterationEngine {
    stateManager;
    strategies;
    logger;
    constructor(stateManager, strategies, logger) {
        this.stateManager = stateManager;
        this.strategies = strategies;
        this.logger = logger;
    }
    async preparePrompt(workspaceFolder, progress) {
        const prepared = await this.prepareIterationContext(workspaceFolder, progress, false);
        return {
            ...prepared
        };
    }
    async runCliIteration(workspaceFolder, mode, progress, options) {
        const prepared = await this.prepareIterationContext(workspaceFolder, progress, true);
        const artifactPaths = (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration);
        const startedAt = prepared.phaseSeed.inspectStartedAt;
        const phaseTimestamps = {
            inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
            inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
            taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
            promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
            resultCollectedAt: startedAt,
            verificationFinishedAt: startedAt,
            classifiedAt: startedAt
        };
        progress.report({
            message: `Executing Ralph iteration ${prepared.iteration}`
        });
        const execStrategy = this.strategies.getCliExecStrategy();
        if (!execStrategy.runExec) {
            throw new Error('The configured Codex CLI strategy does not support codex exec.');
        }
        let executionStatus = 'skipped';
        let executionWarnings = [];
        let executionErrors = [];
        let execStdout = '';
        let execStderr = '';
        let execExitCode = null;
        let execStdinHash = null;
        let transcriptPath;
        let lastMessagePath;
        let lastMessage = '';
        if (prepared.selectedTask) {
            const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
            const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
            this.logger.info('Running Ralph iteration.', {
                iteration: prepared.iteration,
                mode,
                promptPath: prepared.promptPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                selectedTaskId: prepared.selectedTask.id,
                validationCommand: prepared.validationCommand
            });
            const promptArtifactText = await readVerifiedPromptArtifact(prepared.executionPlan);
            phaseTimestamps.executionStartedAt = new Date().toISOString();
            const execResult = await execStrategy.runExec({
                commandPath: prepared.config.codexCommandPath,
                workspaceRoot: prepared.rootPath,
                prompt: promptArtifactText,
                promptPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                promptByteLength: prepared.executionPlan.promptByteLength,
                transcriptPath: runArtifacts.transcriptPath,
                lastMessagePath: runArtifacts.lastMessagePath,
                model: prepared.config.model,
                sandboxMode: prepared.config.sandboxMode,
                approvalMode: prepared.config.approvalMode,
                onStdoutChunk: (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
                onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
            });
            phaseTimestamps.executionFinishedAt = new Date().toISOString();
            executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
            executionWarnings = execResult.warnings;
            executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
            execStdout = execResult.stdout;
            execStderr = execResult.stderr;
            execExitCode = execResult.exitCode;
            execStdinHash = execResult.stdinHash;
            transcriptPath = execResult.transcriptPath;
            lastMessagePath = execResult.lastMessagePath;
            lastMessage = execResult.lastMessage;
            const invocation = {
                schemaVersion: 1,
                kind: 'cliInvocation',
                iteration: prepared.iteration,
                commandPath: prepared.config.codexCommandPath,
                args: execResult.args,
                workspaceRoot: prepared.rootPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                promptByteLength: prepared.executionPlan.promptByteLength,
                stdinHash: execResult.stdinHash,
                transcriptPath: execResult.transcriptPath,
                lastMessagePath: execResult.lastMessagePath,
                createdAt: new Date().toISOString()
            };
            await (0, artifactStore_1.writeCliInvocationArtifact)({
                paths: artifactPaths,
                artifactRootDir: prepared.paths.artifactDir,
                invocation
            });
        }
        else {
            executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
            phaseTimestamps.executionStartedAt = new Date().toISOString();
            phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
        }
        phaseTimestamps.resultCollectedAt = new Date().toISOString();
        const afterCoreState = await (0, verifier_1.captureCoreState)(prepared.paths);
        const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
        const afterGit = shouldCaptureGit ? await (0, verifier_1.captureGitStatus)(prepared.rootPath) : EMPTY_GIT_STATUS;
        progress.report({ message: 'Running Ralph verifiers' });
        const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
            ? await (0, verifier_1.runValidationCommandVerifier)({
                command: prepared.validationCommand,
                rootPath: prepared.rootPath,
                artifactDir: artifactPaths.directory
            })
            : {
                command: prepared.validationCommand,
                stdout: '',
                stderr: '',
                exitCode: null,
                result: {
                    verifier: 'validationCommand',
                    status: 'skipped',
                    summary: executionStatus === 'succeeded'
                        ? 'Validation-command verifier disabled for this iteration.'
                        : 'Validation-command verifier skipped because Codex execution did not succeed.',
                    warnings: [],
                    errors: [],
                    command: prepared.validationCommand ?? undefined
                }
            };
        const taskStateVerification = prepared.config.verifierModes.includes('taskState')
            ? await (0, verifier_1.runTaskStateVerifier)({
                selectedTaskId: prepared.selectedTask?.id ?? null,
                before: prepared.beforeCoreState,
                after: afterCoreState,
                artifactDir: artifactPaths.directory
            })
            : {
                selectedTaskAfter: prepared.selectedTask,
                selectedTaskCompleted: false,
                selectedTaskBlocked: false,
                humanReviewNeeded: false,
                progressChanged: false,
                taskFileChanged: false,
                result: {
                    verifier: 'taskState',
                    status: 'skipped',
                    summary: 'Task-state verifier disabled for this iteration.',
                    warnings: [],
                    errors: []
                }
            };
        const shouldRunFileChangeVerifier = prepared.config.verifierModes.includes('gitDiff')
            || prepared.config.gitCheckpointMode === 'snapshotAndDiff';
        const fileChangeVerification = shouldRunFileChangeVerifier
            ? await (0, verifier_1.runFileChangeVerifier)({
                rootPath: prepared.rootPath,
                artifactDir: artifactPaths.directory,
                beforeGit: prepared.beforeGit,
                afterGit,
                before: prepared.beforeCoreState,
                after: afterCoreState
            })
            : {
                diffSummary: null,
                result: {
                    verifier: 'gitDiff',
                    status: 'skipped',
                    summary: 'Git-diff/file-change verifier disabled for this iteration.',
                    warnings: [],
                    errors: []
                }
            };
        phaseTimestamps.verificationFinishedAt = new Date().toISOString();
        const verifierResults = [
            validationVerification.result,
            fileChangeVerification.result,
            taskStateVerification.result
        ];
        const verificationStatus = (0, loopLogic_1.classifyVerificationStatus)(verifierResults.map((item) => item.status));
        const selectedTaskAfter = taskStateVerification.selectedTaskAfter ?? prepared.selectedTask;
        const remainingSubtaskList = (0, taskFile_1.remainingSubtasks)(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
        const afterTaskCounts = (0, taskFile_1.countTaskStatuses)(afterCoreState.taskFile);
        const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
        const nextActionableTask = (0, taskFile_1.selectNextTask)(afterCoreState.taskFile);
        const outcome = (0, loopLogic_1.classifyIterationOutcome)({
            selectedTaskId: prepared.selectedTask?.id ?? null,
            selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
            selectedTaskBlocked: taskStateVerification.selectedTaskBlocked,
            humanReviewNeeded: taskStateVerification.humanReviewNeeded,
            remainingSubtaskCount: remainingSubtaskList.length,
            remainingTaskCount,
            executionStatus,
            verificationStatus,
            validationFailureSignature: validationVerification.result.failureSignature ?? null,
            relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
            progressChanged: taskStateVerification.progressChanged,
            taskFileChanged: taskStateVerification.taskFileChanged,
            previousIterations: prepared.state.iterationHistory
        });
        let completionClassification = outcome.classification;
        let followUpAction = outcome.followUpAction;
        if (!prepared.selectedTask) {
            if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked === 0) {
                completionClassification = 'complete';
                followUpAction = 'stop';
            }
            else if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked > 0) {
                completionClassification = 'blocked';
                followUpAction = 'request_human_review';
            }
        }
        phaseTimestamps.classifiedAt = new Date().toISOString();
        const summary = [
            prepared.selectedTask
                ? `Selected ${prepared.selectedTask.id}: ${prepared.selectedTask.title}`
                : 'No actionable Ralph task selected.',
            `Execution: ${executionStatus}`,
            `Verification: ${verificationStatus}`,
            `Outcome: ${completionClassification}`,
            `Backlog remaining: ${remainingTaskCount}`
        ].join(' | ');
        const warnings = [
            ...executionWarnings,
            ...verifierResults.flatMap((item) => item.warnings)
        ];
        const errors = [
            ...executionErrors,
            ...verifierResults.flatMap((item) => item.errors)
        ];
        const result = {
            schemaVersion: 1,
            iteration: prepared.iteration,
            selectedTaskId: prepared.selectedTask?.id ?? null,
            selectedTaskTitle: prepared.selectedTask?.title ?? null,
            promptKind: prepared.promptKind,
            promptPath: prepared.promptPath,
            artifactDir: artifactPaths.directory,
            adapterUsed: 'cliExec',
            executionIntegrity: {
                promptTarget: prepared.executionPlan.promptTarget,
                templatePath: prepared.executionPlan.templatePath,
                executionPlanPath: prepared.executionPlanPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                promptByteLength: prepared.executionPlan.promptByteLength,
                executionPayloadHash: execStdinHash,
                executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
                mismatchReason: execStdinHash === null
                    ? null
                    : execStdinHash === prepared.executionPlan.promptHash
                        ? null
                        : `Executed stdin hash ${execStdinHash} did not match planned prompt hash ${prepared.executionPlan.promptHash}.`,
                cliInvocationPath: prepared.selectedTask ? artifactPaths.cliInvocationPath : null
            },
            executionStatus,
            verificationStatus,
            completionClassification,
            followUpAction,
            startedAt,
            finishedAt: new Date().toISOString(),
            phaseTimestamps,
            summary,
            warnings,
            errors,
            execution: {
                exitCode: execExitCode,
                transcriptPath,
                lastMessagePath,
                stdoutPath: artifactPaths.stdoutPath,
                stderrPath: artifactPaths.stderrPath
            },
            verification: {
                primaryCommand: validationVerification.command ?? null,
                validationFailureSignature: validationVerification.result.failureSignature ?? null,
                verifiers: verifierResults
            },
            backlog: {
                remainingTaskCount,
                actionableTaskAvailable: Boolean(nextActionableTask)
            },
            diffSummary: fileChangeVerification.diffSummary,
            noProgressSignals: outcome.noProgressSignals,
            stopReason: null
        };
        const loopDecision = (0, loopLogic_1.decideLoopContinuation)({
            currentResult: result,
            selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
            remainingSubtaskCount: remainingSubtaskList.length,
            remainingTaskCount,
            hasActionableTask: Boolean(nextActionableTask),
            noProgressThreshold: prepared.config.noProgressThreshold,
            repeatedFailureThreshold: prepared.config.repeatedFailureThreshold,
            stopOnHumanReviewNeeded: prepared.config.stopOnHumanReviewNeeded,
            reachedIterationCap: options.reachedIterationCap,
            previousIterations: prepared.state.iterationHistory
        });
        if (!loopDecision.shouldContinue) {
            result.stopReason = loopDecision.stopReason;
            result.followUpAction = 'stop';
        }
        phaseTimestamps.persistedAt = new Date().toISOString();
        await (0, artifactStore_1.writeIterationArtifacts)({
            paths: artifactPaths,
            artifactRootDir: prepared.paths.artifactDir,
            prompt: prepared.prompt,
            promptEvidence: prepared.promptEvidence,
            stdout: execStdout,
            stderr: execStderr,
            executionSummary: {
                iteration: prepared.iteration,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                promptKind: prepared.promptKind,
                promptTarget: prepared.executionPlan.promptTarget,
                templatePath: prepared.executionPlan.templatePath,
                executionPlanPath: prepared.executionPlanPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                executionPayloadHash: execStdinHash,
                executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
                cliInvocationPath: prepared.selectedTask ? artifactPaths.cliInvocationPath : null,
                executionStatus,
                exitCode: execExitCode,
                transcriptPath,
                lastMessagePath,
                lastMessage: summarizeLastMessage(lastMessage, execExitCode)
            },
            verifierSummary: verifierResults,
            diffSummary: fileChangeVerification.diffSummary,
            result,
            gitStatusBefore: prepared.beforeGit.available ? prepared.beforeGit.raw : undefined,
            gitStatusAfter: afterGit.available ? afterGit.raw : undefined
        });
        const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
        await this.stateManager.recordIteration(prepared.rootPath, prepared.paths, prepared.state, result, prepared.objectiveText, runRecord);
        this.logger.info('Completed Ralph iteration.', {
            iteration: prepared.iteration,
            selectedTaskId: prepared.selectedTask?.id ?? null,
            executionStatus,
            verificationStatus,
            completionClassification,
            stopReason: result.stopReason,
            promptPath: prepared.promptPath,
            promptArtifactPath: prepared.executionPlan.promptArtifactPath,
            promptHash: prepared.executionPlan.promptHash,
            executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
            artifactDir: artifactPaths.directory,
            selectedTaskAfterStatus: selectedTaskAfter?.status ?? null
        });
        return {
            prepared,
            result,
            loopDecision,
            createdPaths: prepared.createdPaths
        };
    }
    async maybeSeedObjective(paths) {
        const objectiveText = await this.stateManager.readObjectiveText(paths);
        if (!this.stateManager.isDefaultObjective(objectiveText)) {
            return objectiveText;
        }
        const seededObjective = await vscode.window.showInputBox({
            prompt: 'Seed the PRD with a short objective for this workspace',
            placeHolder: 'Example: Harden the VS Code extension starter into a reliable v2 iteration engine'
        });
        if (!seededObjective?.trim()) {
            return objectiveText;
        }
        const nextText = [
            '# Product / project brief',
            '',
            seededObjective.trim()
        ].join('\n');
        await this.stateManager.writeObjectiveText(paths, nextText);
        return `${nextText}\n`;
    }
    async prepareIterationContext(workspaceFolder, progress, includeVerifierContext) {
        const inspectStartedAt = new Date().toISOString();
        progress.report({ message: 'Inspecting Ralph workspace' });
        const config = (0, readConfig_1.readConfig)(workspaceFolder);
        const rootPath = workspaceFolder.uri.fsPath;
        const snapshot = await this.stateManager.ensureWorkspace(rootPath, config);
        await this.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
        if (snapshot.createdPaths.length > 0) {
            this.logger.warn('Initialized or repaired Ralph workspace paths.', {
                rootPath,
                createdPaths: snapshot.createdPaths
            });
        }
        const objectiveText = await this.maybeSeedObjective(snapshot.paths);
        const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
            this.stateManager.readProgressText(snapshot.paths),
            this.stateManager.inspectTaskFile(snapshot.paths),
            this.stateManager.taskCounts(snapshot.paths).catch(() => null),
            (0, workspaceScanner_1.scanWorkspace)(rootPath, workspaceFolder.name),
            (0, verifier_1.captureCoreState)(snapshot.paths)
        ]);
        const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
        const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
        const effectiveTaskCounts = taskCounts ?? (0, taskFile_1.countTaskStatuses)(taskFile);
        const selectedTask = (0, taskFile_1.selectNextTask)(taskFile);
        const taskSelectedAt = new Date().toISOString();
        const validationCommand = (0, verifier_1.chooseValidationCommand)(summary, selectedTask, config.validationCommandOverride);
        const validationCommandReadiness = await (0, verifier_1.inspectValidationCommandReadiness)({
            command: validationCommand,
            rootPath
        });
        const promptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
        const promptDecision = (0, promptBuilder_1.decidePromptKind)(snapshot.state, promptTarget);
        const promptKind = promptDecision.kind;
        const iteration = snapshot.state.nextIteration;
        const [availableCommands, codexCliSupport] = await Promise.all([
            vscode.commands.getCommands(true),
            (0, codexCliSupport_1.inspectCodexCliSupport)(config.codexCommandPath)
        ]);
        const ideCommandSupport = (0, codexCliSupport_1.inspectIdeCommandSupport)({
            preferredHandoffMode: config.preferredHandoffMode,
            openSidebarCommandId: config.openSidebarCommandId,
            newChatCommandId: config.newChatCommandId,
            availableCommands
        });
        const preflightReport = (0, preflight_1.buildPreflightReport)({
            rootPath,
            workspaceTrusted: vscode.workspace.isTrusted,
            config,
            taskInspection,
            taskCounts: effectiveTaskCounts,
            selectedTask,
            validationCommand,
            validationCommandReadiness,
            fileStatus: snapshot.fileStatus,
            createdPaths: snapshot.createdPaths,
            codexCliSupport,
            ideCommandSupport
        });
        const preflightArtifactPaths = (0, artifactStore_1.resolvePreflightArtifactPaths)(snapshot.paths.artifactDir, iteration);
        await (0, artifactStore_1.writePreflightArtifacts)({
            paths: preflightArtifactPaths,
            artifactRootDir: snapshot.paths.artifactDir,
            iteration,
            promptKind,
            report: preflightReport,
            selectedTaskId: selectedTask?.id ?? null,
            selectedTaskTitle: selectedTask?.title ?? null,
            validationCommand
        });
        progress.report({ message: preflightReport.summary });
        this.logger.appendText((0, preflight_1.renderPreflightReport)(preflightReport));
        this.logger.info('Prepared Ralph preflight report.', {
            rootPath,
            iteration,
            ready: preflightReport.ready,
            preflightReportPath: preflightArtifactPaths.reportPath,
            preflightSummaryPath: preflightArtifactPaths.summaryPath,
            diagnostics: preflightReport.diagnostics
        });
        if (includeVerifierContext && !preflightReport.ready) {
            throw new Error((0, preflight_1.buildBlockingPreflightMessage)(preflightReport));
        }
        progress.report({ message: 'Generating Ralph prompt' });
        const artifactPaths = (0, artifactStore_1.resolveIterationArtifactPaths)(snapshot.paths.artifactDir, iteration);
        const promptRender = await (0, promptBuilder_1.buildPrompt)({
            kind: promptKind,
            target: promptTarget,
            iteration,
            selectionReason: promptDecision.reason,
            objectiveText,
            progressText,
            taskCounts: effectiveTaskCounts,
            summary,
            state: snapshot.state,
            paths: snapshot.paths,
            taskFile,
            selectedTask,
            validationCommand,
            preflightReport,
            config
        });
        const prompt = promptRender.prompt;
        const promptPath = await this.stateManager.writePrompt(snapshot.paths, (0, promptBuilder_1.createPromptFileName)(promptKind, iteration), prompt);
        await (0, artifactStore_1.writePromptArtifacts)({
            paths: artifactPaths,
            artifactRootDir: snapshot.paths.artifactDir,
            prompt,
            promptEvidence: promptRender.evidence
        });
        const executionPlan = {
            schemaVersion: 1,
            kind: 'executionPlan',
            iteration,
            selectedTaskId: selectedTask?.id ?? null,
            selectedTaskTitle: selectedTask?.title ?? null,
            promptKind,
            promptTarget,
            selectionReason: promptDecision.reason,
            templatePath: promptRender.templatePath,
            promptPath,
            promptArtifactPath: artifactPaths.promptPath,
            promptEvidencePath: artifactPaths.promptEvidencePath,
            promptHash: (0, integrity_1.hashText)(prompt),
            promptByteLength: (0, integrity_1.utf8ByteLength)(prompt),
            artifactDir: artifactPaths.directory,
            createdAt: new Date().toISOString()
        };
        await (0, artifactStore_1.writeExecutionPlanArtifact)({
            paths: artifactPaths,
            artifactRootDir: snapshot.paths.artifactDir,
            plan: executionPlan
        });
        const promptGeneratedAt = new Date().toISOString();
        const beforeGit = includeVerifierContext
            && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
            ? await (0, verifier_1.captureGitStatus)(rootPath)
            : EMPTY_GIT_STATUS;
        this.logger.info('Prepared Ralph prompt context.', {
            rootPath,
            promptKind,
            promptTarget,
            promptSelectionReason: promptDecision.reason,
            iteration,
            promptPath,
            promptTemplatePath: promptRender.templatePath,
            promptArtifactPath: executionPlan.promptArtifactPath,
            promptHash: executionPlan.promptHash,
            executionPlanPath: artifactPaths.executionPlanPath,
            promptEvidence: promptRender.evidence,
            selectedTaskId: selectedTask?.id ?? null,
            validationCommand
        });
        return {
            config,
            rootPath,
            state: snapshot.state,
            paths: snapshot.paths,
            promptKind,
            promptTarget,
            promptSelectionReason: promptDecision.reason,
            promptPath,
            promptTemplatePath: promptRender.templatePath,
            promptEvidence: promptRender.evidence,
            executionPlan,
            executionPlanPath: artifactPaths.executionPlanPath,
            prompt,
            iteration,
            objectiveText,
            progressText,
            tasksText,
            taskFile,
            taskCounts: effectiveTaskCounts,
            summary,
            selectedTask,
            validationCommand,
            preflightReport,
            createdPaths: snapshot.createdPaths,
            beforeCoreState,
            beforeGit,
            phaseSeed: {
                inspectStartedAt,
                inspectFinishedAt: taskSelectedAt,
                taskSelectedAt,
                promptGeneratedAt
            }
        };
    }
}
exports.RalphIterationEngine = RalphIterationEngine;
//# sourceMappingURL=iterationEngine.js.map