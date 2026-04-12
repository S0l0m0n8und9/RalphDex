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
exports.registerArtifactAndMaintenanceCommands = registerArtifactAndMaintenanceCommands;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const statusReport_1 = require("../ralph/statusReport");
const taskFile_1 = require("../ralph/taskFile");
const taskDecomposition_1 = require("../ralph/taskDecomposition");
const cliActivity_1 = require("../services/cliActivity");
const multiAgentStatus_1 = require("../ralph/multiAgentStatus");
const multiAgentStatusSnapshot_1 = require("../ralph/multiAgentStatusSnapshot");
const statusSnapshot_1 = require("./statusSnapshot");
const pipeline_1 = require("../ralph/pipeline");
const deadLetter_1 = require("../ralph/deadLetter");
// ---------------------------------------------------------------------------
// Small utilities duplicated from registerCommands.ts to avoid coupling
// ---------------------------------------------------------------------------
async function withWorkspaceFolder() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder before using Ralphdex.');
    }
    return folder;
}
async function openTextFile(target) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document, { preview: false });
}
function deletedCountSummary(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}
// ---------------------------------------------------------------------------
// Artifact opening helpers
// ---------------------------------------------------------------------------
async function openLatestRalphSummary(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    if (latestArtifacts.latestSummaryPath) {
        await openTextFile(latestArtifacts.latestSummaryPath);
        return true;
    }
    if (latestArtifacts.latestPreflightSummaryPath) {
        await openTextFile(latestArtifacts.latestPreflightSummaryPath);
        return true;
    }
    const reason = inspection.state.lastIteration
        ? 'The latest Ralph summary artifact is missing or stale and could not be repaired from persisted Ralph metadata.'
        : 'No Ralph summary exists yet because no CLI iteration has completed and no preflight has been persisted.';
    void vscode.window.showInformationMessage(`${reason} Run Ralphdex: Run CLI Iteration or Ralphdex: Run CLI Loop, then try again.`);
    return false;
}
async function openLatestProvenanceBundle(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    if (latestArtifacts.latestProvenanceSummaryPath) {
        await openTextFile(latestArtifacts.latestProvenanceSummaryPath);
        return true;
    }
    if (latestArtifacts.latestExecutionPlanPath) {
        await openTextFile(latestArtifacts.latestExecutionPlanPath);
        return true;
    }
    void vscode.window.showInformationMessage(latestArtifacts.latestProvenanceBundlePath
        ? 'The latest Ralph provenance summary artifact is missing or stale and could not be repaired from the persisted bundle manifest.'
        : 'No Ralph provenance bundle exists yet. Prepare a prompt or run a CLI iteration, then try again.');
    return false;
}
async function openLatestPromptEvidence(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    if (latestArtifacts.latestPromptEvidencePath) {
        await openTextFile(latestArtifacts.latestPromptEvidencePath);
        return true;
    }
    void vscode.window.showInformationMessage(inspection.state.lastPromptPath || latestArtifacts.latestPromptPath
        ? 'The latest Ralph prompt evidence artifact is missing. Prepare a prompt or run a CLI iteration to regenerate prompt evidence, then try again.'
        : 'No Ralph prompt evidence exists yet. Prepare a prompt or run a CLI iteration, then try again.');
    return false;
}
async function openLatestCliTranscriptOrLastMessage(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    const latestCliInvocation = await (0, statusSnapshot_1.readJsonArtifact)(latestArtifacts.latestCliInvocationPath).then(statusSnapshot_1.normalizeCliInvocation);
    const transcriptPath = await (0, statusSnapshot_1.firstExistingPath)([
        latestCliInvocation?.transcriptPath,
        inspection.state.lastIteration?.execution.transcriptPath,
        inspection.state.lastRun?.transcriptPath
    ]);
    const lastMessagePath = await (0, statusSnapshot_1.firstExistingPath)([
        latestCliInvocation?.lastMessagePath,
        inspection.state.lastIteration?.execution.lastMessagePath,
        inspection.state.lastRun?.lastMessagePath
    ]);
    if (transcriptPath) {
        await openTextFile(transcriptPath);
        return true;
    }
    if (lastMessagePath) {
        await openTextFile(lastMessagePath);
        return true;
    }
    void vscode.window.showInformationMessage(latestArtifacts.latestCliInvocationPath || inspection.state.lastRun || inspection.state.lastIteration
        ? 'The latest Ralph CLI transcript and last-message artifacts are missing. Run a CLI iteration to generate fresh execution output, then try again.'
        : 'No Ralph CLI transcript exists yet because no CLI iteration has completed. Run Ralphdex: Run CLI Iteration or Ralphdex: Run CLI Loop, then try again.');
    return false;
}
async function revealLatestProvenanceBundleDirectory(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    const latestBundle = await (0, statusSnapshot_1.readJsonArtifact)(latestArtifacts.latestProvenanceBundlePath).then(statusSnapshot_1.normalizeProvenanceBundle);
    if (!latestBundle?.bundleDir) {
        void vscode.window.showInformationMessage('No Ralph provenance bundle exists yet. Prepare a prompt or run a CLI iteration, then try again.');
        return false;
    }
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(latestBundle.bundleDir));
    const choice = await vscode.window.showInformationMessage(`Revealed the latest Ralph provenance bundle directory: ${latestBundle.bundleDir}`, latestArtifacts.latestProvenanceSummaryPath ? 'Open Bundle Summary' : 'Open Bundle Manifest');
    if (choice === 'Open Bundle Summary' && latestArtifacts.latestProvenanceSummaryPath) {
        await openTextFile(latestArtifacts.latestProvenanceSummaryPath);
    }
    else if (choice === 'Open Bundle Manifest') {
        await openTextFile(path.join(latestBundle.bundleDir, 'provenance-bundle.json'));
    }
    return true;
}
async function openLatestPipelineRun(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latest = await (0, pipeline_1.readLatestPipelineArtifact)(inspection.paths.artifactDir);
    if (latest) {
        await openTextFile(latest.artifactPath);
        return true;
    }
    void vscode.window.showInformationMessage('No pipeline run artifact found. Run "Ralphdex: Run Pipeline" first, then try again.');
    return false;
}
async function applyLatestTaskDecompositionProposal(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const latestArtifacts = await (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths);
    const remediationArtifact = await (0, statusSnapshot_1.readJsonArtifact)(latestArtifacts.latestRemediationPath).then(statusSnapshot_1.normalizeTaskRemediationArtifact);
    if (!remediationArtifact) {
        void vscode.window.showInformationMessage('No latest Ralph remediation proposal exists yet. Run enough CLI iterations to record a remediation artifact, then try again.');
        return false;
    }
    const proposal = (0, taskDecomposition_1.resolveApplicableTaskDecompositionProposal)(remediationArtifact);
    if (!proposal) {
        void vscode.window.showInformationMessage('The latest Ralph remediation artifact does not contain an applicable task-decomposition proposal.');
        return false;
    }
    const childTaskIds = proposal.suggestedChildTasks.map((task) => task.id);
    const confirmed = await vscode.window.showWarningMessage(`Apply the latest Ralph decomposition proposal for ${proposal.parentTaskId}? This updates .ralph/tasks.json by adding ${childTaskIds.length} child task(s) and making the parent task depend on them.`, { modal: true }, 'Apply Proposal');
    if (confirmed !== 'Apply Proposal') {
        return false;
    }
    await (0, taskDecomposition_1.applyTaskDecompositionProposalArtifact)(inspection.paths.taskFilePath, remediationArtifact);
    logger.info('Applied Ralph task decomposition proposal.', {
        rootPath: workspaceFolder.uri.fsPath,
        remediationPath: latestArtifacts.latestRemediationPath,
        parentTaskId: proposal.parentTaskId,
        childTaskIds
    });
    await openTextFile(inspection.paths.taskFilePath);
    const remediationLabel = latestArtifacts.latestRemediationPath
        ? path.relative(workspaceFolder.uri.fsPath, latestArtifacts.latestRemediationPath)
        : '.ralph/artifacts/latest-remediation.json';
    void vscode.window.showInformationMessage(`Applied the latest Ralph decomposition proposal from ${remediationLabel}. Added ${childTaskIds.join(', ')} under ${proposal.parentTaskId}.`);
    return true;
}
async function resolveStaleTaskClaim(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const status = await (0, statusSnapshot_1.collectStatusSnapshot)(workspaceFolder, stateManager, logger);
    const staleClaims = status.claimGraph?.tasks.filter((entry) => entry.canonicalClaim?.stale) ?? [];
    if (staleClaims.length === 0) {
        void vscode.window.showInformationMessage('No stale active task claim exists to resolve. Use Ralphdex: Show Status to inspect the current claim graph.');
        return false;
    }
    let targetClaim = staleClaims.find((entry) => entry.taskId === status.selectedTask?.id) ?? null;
    if (!targetClaim && staleClaims.length === 1) {
        targetClaim = staleClaims[0];
    }
    if (!targetClaim) {
        const requestedTaskId = (await vscode.window.showInputBox({
            prompt: `Multiple stale claims exist (${staleClaims.map((entry) => entry.taskId).join(', ')}). Enter the task id to resolve.`
        }))?.trim();
        if (!requestedTaskId) {
            return false;
        }
        targetClaim = staleClaims.find((entry) => entry.taskId === requestedTaskId) ?? null;
        if (!targetClaim) {
            void vscode.window.showWarningMessage(`Task ${requestedTaskId} does not currently have a stale canonical claim. Use Ralphdex: Show Status to inspect the current claim graph.`);
            return false;
        }
    }
    const canonicalClaim = targetClaim.canonicalClaim?.claim;
    if (!canonicalClaim) {
        void vscode.window.showWarningMessage(`Task ${targetClaim.taskId} no longer has a canonical active claim to resolve. Refresh Ralph status and try again.`);
        return false;
    }
    const activity = await (0, cliActivity_1.inspectCodexExecActivity)(workspaceFolder.uri.fsPath);
    if (activity.check !== 'clear') {
        void vscode.window.showWarningMessage(activity.check === 'active'
            ? `Cannot resolve stale claim for ${targetClaim.taskId} because a codex exec process is still running. Confirm the CLI iteration is gone before retrying.`
            : `Cannot resolve stale claim for ${targetClaim.taskId} because Ralph could not confirm whether codex exec is still running. ${activity.summary}`);
        return false;
    }
    const confirmed = await vscode.window.showWarningMessage(`Mark stale claim for ${targetClaim.taskId} held by ${canonicalClaim.agentId}/${canonicalClaim.provenanceId} as stale? This updates .ralph/claims.json and records the recovery reason durably.`, { modal: true }, 'Mark Claim Stale');
    if (confirmed !== 'Mark Claim Stale') {
        return false;
    }
    const resolutionReason = `eligible for operator recovery because the canonical claim was stale from ${canonicalClaim.claimedAt} and no running codex exec process was detected`;
    const resolved = await (0, taskFile_1.resolveStaleClaim)(inspection.paths.claimFilePath, {
        expectedClaim: canonicalClaim,
        resolutionReason,
        resolvedBy: 'operator',
        status: 'stale'
    });
    if (resolved.outcome !== 'resolved' || !resolved.resolvedClaim) {
        void vscode.window.showWarningMessage(`Task ${targetClaim.taskId} is no longer eligible for stale-claim resolution because its canonical claim changed. Refresh Ralph status and try again.`);
        return false;
    }
    logger.info('Resolved stale Ralph task claim.', {
        taskId: resolved.resolvedClaim.claim.taskId,
        agentId: resolved.resolvedClaim.claim.agentId,
        provenanceId: resolved.resolvedClaim.claim.provenanceId,
        status: resolved.resolvedClaim.claim.status,
        resolvedAt: resolved.resolvedClaim.claim.resolvedAt,
        resolutionReason: resolved.resolvedClaim.claim.resolutionReason
    });
    void vscode.window.showInformationMessage(`Marked stale claim for ${resolved.resolvedClaim.claim.taskId} held by ${resolved.resolvedClaim.claim.agentId}/${resolved.resolvedClaim.claim.provenanceId} as ${resolved.resolvedClaim.claim.status}.`);
    return true;
}
// ---------------------------------------------------------------------------
// Public registration entry point
// ---------------------------------------------------------------------------
function registerArtifactAndMaintenanceCommands(context, logger, stateManager, registerCommand) {
    registerCommand(context, logger, {
        commandId: 'ralphCodex.showRalphStatus',
        label: 'Ralphdex: Show Status',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Collecting workspace and Ralph status' });
            const workspaceFolder = await withWorkspaceFolder();
            const status = await (0, statusSnapshot_1.collectStatusSnapshot)(workspaceFolder, stateManager, logger);
            const report = (0, statusReport_1.buildStatusReport)(status);
            logger.appendText(report);
            logger.info('Ralph status snapshot generated.', {
                workspace: status.workspaceName,
                latestSummaryPath: status.latestSummaryPath,
                latestResultPath: status.latestResultPath,
                latestExecutionPlanPath: status.latestExecutionPlanPath,
                selectedTaskId: status.selectedTask?.id ?? null,
                stopReason: status.lastIteration?.stopReason ?? null
            });
            // Open or focus the dashboard and force a fresh snapshot load so the
            // operator sees current data even if the panel was already open.
            await vscode.commands.executeCommand('ralphCodex.showDashboard');
            await vscode.commands.executeCommand('ralphCodex.refreshDashboard');
            const primaryAction = status.latestSummaryPath ? 'Open Latest Summary' : 'Show Output';
            const choice = await vscode.window.showInformationMessage(vscode.workspace.isTrusted
                ? 'Ralph status is available in the dashboard. Raw report written to the output channel.'
                : 'Ralph status is available in the dashboard in limited mode. Raw report written to the output channel.', primaryAction, 'Show Output');
            if (choice === 'Open Latest Summary' && status.latestSummaryPath) {
                await openLatestRalphSummary(workspaceFolder, stateManager, logger);
            }
            else if (choice === 'Show Output') {
                logger.show(false);
            }
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openLatestRalphSummary',
        label: 'Ralphdex: Open Latest Ralph Summary',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Resolving latest Ralph summary artifact' });
            const workspaceFolder = await withWorkspaceFolder();
            await openLatestRalphSummary(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openLatestProvenanceBundle',
        label: 'Ralphdex: Open Latest Provenance Bundle',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Resolving latest Ralph provenance bundle' });
            const workspaceFolder = await withWorkspaceFolder();
            await openLatestProvenanceBundle(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openLatestPromptEvidence',
        label: 'Ralphdex: Open Latest Prompt Evidence',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Resolving latest Ralph prompt evidence' });
            const workspaceFolder = await withWorkspaceFolder();
            await openLatestPromptEvidence(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openLatestCliTranscript',
        label: 'Ralphdex: Open Latest CLI Transcript',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Resolving latest Ralph CLI transcript' });
            const workspaceFolder = await withWorkspaceFolder();
            await openLatestCliTranscriptOrLastMessage(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.openLatestPipelineRun',
        label: 'Ralphdex: Open Latest Pipeline Run',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Resolving latest Ralph pipeline run artifact' });
            const workspaceFolder = await withWorkspaceFolder();
            await openLatestPipelineRun(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.applyLatestTaskDecompositionProposal',
        label: 'Ralphdex: Apply Latest Task Decomposition Proposal',
        handler: async (progress) => {
            progress.report({ message: 'Applying the latest Ralph task decomposition proposal' });
            const workspaceFolder = await withWorkspaceFolder();
            await applyLatestTaskDecompositionProposal(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.resolveStaleTaskClaim',
        label: 'Ralphdex: Resolve Stale Task Claim',
        handler: async (progress) => {
            progress.report({ message: 'Resolving a stale Ralph task claim' });
            const workspaceFolder = await withWorkspaceFolder();
            await resolveStaleTaskClaim(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.revealLatestProvenanceBundleDirectory',
        label: 'Ralphdex: Reveal Latest Provenance Bundle Directory',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Revealing latest Ralph provenance bundle directory' });
            const workspaceFolder = await withWorkspaceFolder();
            await revealLatestProvenanceBundleDirectory(workspaceFolder, stateManager, logger);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.showMultiAgentStatus',
        label: 'Ralphdex: Show Multi-Agent Status',
        requiresTrustedWorkspace: false,
        handler: async (progress) => {
            progress.report({ message: 'Collecting per-agent status' });
            const workspaceFolder = await withWorkspaceFolder();
            const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');
            const claimFilePath = path.join(ralphDir, 'claims.json');
            const deadLetterPath = path.join(ralphDir, 'dead-letter.json');
            const [summaries, deadLetterQueue] = await Promise.all([
                (0, multiAgentStatusSnapshot_1.readMultiAgentStatusSummaries)(ralphDir, claimFilePath),
                (0, deadLetter_1.readDeadLetterQueue)(deadLetterPath)
            ]);
            const report = (0, multiAgentStatus_1.buildMultiAgentStatusReport)(summaries, deadLetterQueue.entries);
            logger.appendText(report);
            logger.info('Multi-agent status snapshot generated.', {
                workspace: workspaceFolder.name,
                agentCount: summaries.length
            });
            // Open or focus the dashboard and force a fresh snapshot load so the
            // operator sees current per-agent data even if the panel was already open.
            await vscode.commands.executeCommand('ralphCodex.showDashboard');
            await vscode.commands.executeCommand('ralphCodex.refreshDashboard');
            const choice = await vscode.window.showInformationMessage(summaries.length > 0
                ? `Multi-agent status for ${summaries.length} agent(s) is available in the dashboard. Raw report written to the output channel.`
                : 'No agent identity records found. Run at least one CLI iteration to populate agent state.', 'Show Output');
            if (choice === 'Show Output') {
                logger.show(false);
            }
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.cleanupRalphRuntimeArtifacts',
        label: 'Ralphdex: Cleanup Runtime Artifacts',
        handler: async (progress) => {
            const workspaceFolder = await withWorkspaceFolder();
            const confirmed = await vscode.window.showWarningMessage('Cleanup Ralph runtime artifacts? This preserves .ralph/state.json, the PRD, progress log, task file, and latest Ralph evidence while pruning older generated prompts, runs, iteration artifacts, provenance bundles, and extension logs.', { modal: true }, 'Cleanup');
            if (confirmed !== 'Cleanup') {
                return;
            }
            progress.report({ message: 'Pruning generated Ralph runtime artifacts' });
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const result = await stateManager.cleanupRuntimeArtifacts(workspaceFolder.uri.fsPath, config);
            await logger.setWorkspaceLogFile(result.snapshot.paths.logFilePath);
            logger.info('Pruned Ralph runtime artifacts.', {
                rootPath: workspaceFolder.uri.fsPath,
                deletedIterationDirectories: result.cleanup.generatedArtifacts.deletedIterationDirectories,
                deletedPromptFiles: result.cleanup.generatedArtifacts.deletedPromptFiles,
                deletedRunArtifactBaseNames: result.cleanup.generatedArtifacts.deletedRunArtifactBaseNames,
                deletedBundleIds: result.cleanup.provenanceBundles.deletedBundleIds,
                deletedLogFiles: result.cleanup.deletedLogFiles
            });
            const deletedArtifacts = [
                deletedCountSummary(result.cleanup.generatedArtifacts.deletedIterationDirectories.length, 'iteration directory', 'iteration directories'),
                deletedCountSummary(result.cleanup.generatedArtifacts.deletedPromptFiles.length, 'prompt file', 'prompt files'),
                deletedCountSummary(result.cleanup.generatedArtifacts.deletedRunArtifactBaseNames.length, 'run artifact set', 'run artifact sets'),
                deletedCountSummary(result.cleanup.provenanceBundles.deletedBundleIds.length, 'bundle', 'bundles'),
                deletedCountSummary(result.cleanup.deletedLogFiles.length, 'log file', 'log files')
            ].join(', ');
            void vscode.window.showInformationMessage(`Ralph runtime artifacts cleaned up. Preserved durable state and latest evidence while pruning ${deletedArtifacts}.`);
        }
    });
    registerCommand(context, logger, {
        commandId: 'ralphCodex.resetRalphWorkspaceState',
        label: 'Ralphdex: Reset Runtime State',
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
    registerCommand(context, logger, {
        commandId: 'ralphCodex.requeueDeadLetterTask',
        label: 'Ralphdex: Requeue Dead-Letter Task',
        handler: async (progress) => {
            progress.report({ message: 'Loading dead-letter queue' });
            const workspaceFolder = await withWorkspaceFolder();
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');
            const deadLetterPath = path.join(ralphDir, 'dead-letter.json');
            const queue = await (0, deadLetter_1.readDeadLetterQueue)(deadLetterPath);
            if (queue.entries.length === 0) {
                void vscode.window.showInformationMessage('No tasks are in the dead-letter queue. Use Ralphdex: Show Status to inspect task state.');
                return;
            }
            const items = queue.entries.map((entry) => ({
                label: entry.taskId,
                description: entry.taskTitle,
                detail: `Dead-lettered: ${entry.deadLetteredAt} | Attempts: ${entry.recoveryAttemptCount}`
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a dead-letter task to requeue',
                title: 'Ralphdex: Requeue Dead-Letter Task'
            });
            if (!picked) {
                return;
            }
            const taskId = picked.label;
            const confirmed = await vscode.window.showWarningMessage(`Requeue task ${taskId} (${picked.description})? This removes it from the dead-letter queue and resets its status to todo.`, { modal: true }, 'Requeue');
            if (confirmed !== 'Requeue') {
                return;
            }
            progress.report({ message: `Requeueing ${taskId}` });
            const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
            await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
            // Remove from dead-letter first (safest order — worst case: removed from
            // dead-letter but task still blocked, which is recoverable).
            const removed = await (0, deadLetter_1.removeDeadLetterEntry)(deadLetterPath, taskId);
            if (!removed) {
                void vscode.window.showWarningMessage(`Task ${taskId} was no longer in the dead-letter queue. Refresh status and try again.`);
                return;
            }
            // Reset task status to todo inside the task-file lock.
            const locked = await (0, taskFile_1.withTaskFileLock)(inspection.paths.taskFilePath, undefined, async () => {
                const raw = await fs.readFile(inspection.paths.taskFilePath, 'utf8');
                const taskFile = (0, taskFile_1.parseTaskFile)(raw);
                const task = taskFile.tasks.find((t) => t.id === taskId);
                if (!task) {
                    return;
                }
                task.status = 'todo';
                delete task.blocker;
                const next = (0, taskFile_1.bumpMutationCount)(taskFile);
                await fs.writeFile(inspection.paths.taskFilePath, (0, taskFile_1.stringifyTaskFile)(next), 'utf8');
            });
            if (locked.outcome === 'lock_timeout') {
                // Re-add to dead-letter so we don't lose it
                const entry = queue.entries.find((e) => e.taskId === taskId);
                if (entry) {
                    await (0, deadLetter_1.appendDeadLetterEntry)(deadLetterPath, entry);
                }
                throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s). Task ${taskId} has been re-added to the dead-letter queue.`);
            }
            logger.info('Requeued dead-letter task.', { taskId });
            void vscode.window.showInformationMessage(`Task ${taskId} has been removed from the dead-letter queue and reset to todo.`);
        }
    });
}
//# sourceMappingURL=artifactCommands.js.map