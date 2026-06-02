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
exports.readJsonArtifact = readJsonArtifact;
exports.firstExistingPath = firstExistingPath;
exports.normalizeExecutionPlan = normalizeExecutionPlan;
exports.normalizePromptEvidence = normalizePromptEvidence;
exports.normalizeCliInvocation = normalizeCliInvocation;
exports.normalizeProvenanceBundle = normalizeProvenanceBundle;
exports.normalizeLatestRemediation = normalizeLatestRemediation;
exports.normalizeTaskRemediationArtifact = normalizeTaskRemediationArtifact;
exports.normalizeCompletionReportArtifact = normalizeCompletionReportArtifact;
exports.normalizeDoctrineProposalArtifact = normalizeDoctrineProposalArtifact;
exports.collectStatusSnapshot = collectStatusSnapshot;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const providers_1 = require("../config/providers");
const readConfig_1 = require("../config/readConfig");
const preflight_1 = require("../ralph/preflight");
const rootPolicy_1 = require("../ralph/rootPolicy");
const statusReport_1 = require("../ralph/statusReport");
const complexityScorer_1 = require("../ralph/complexityScorer");
const taskFile_1 = require("../ralph/taskFile");
const handoffManager_1 = require("../ralph/handoffManager");
const artifactStore_1 = require("../ralph/artifactStore");
const verifier_1 = require("../ralph/verifier");
const pipeline_1 = require("../ralph/pipeline");
const orchestrationSupervisor_1 = require("../ralph/orchestrationSupervisor");
const deadLetter_1 = require("../ralph/deadLetter");
const failureDiagnostics_1 = require("../ralph/failureDiagnostics");
const recoveryOrchestrator_1 = require("../ralph/recoveryOrchestrator");
const codexCliSupport_1 = require("../services/codexCliSupport");
const fs_1 = require("../util/fs");
const validate_1 = require("../util/validate");
const workspaceScanner_1 = require("../services/workspaceScanner");
const rolePolicy_1 = require("../ralph/rolePolicy");
const doctrine_1 = require("../ralph/doctrine");
const prdReconciliation_1 = require("../ralph/prdReconciliation");
async function readJsonArtifact(target) {
    if (!target) {
        return null;
    }
    try {
        return JSON.parse(await fs.readFile(target, 'utf8'));
    }
    catch {
        return null;
    }
}
async function firstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (await (0, fs_1.pathExists)(candidate)) {
            return candidate ?? null;
        }
    }
    return null;
}
function normalizeExecutionPlan(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'executionPlan'],
        iteration: 'number',
        promptKind: 'string',
        promptTarget: 'string',
        templatePath: 'string',
        promptArtifactPath: 'string',
        promptHash: 'string'
    });
}
function normalizePromptEvidence(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        iteration: 'number',
        kind: 'string',
        target: 'string',
        templatePath: 'string',
        selectionReason: 'string'
    });
}
function normalizeCliInvocation(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'cliInvocation'],
        iteration: 'number',
        commandPath: 'string',
        args: 'array',
        promptArtifactPath: 'string',
        stdinHash: 'string'
    });
}
function normalizeProvenanceBundle(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'provenanceBundle'],
        provenanceId: 'string',
        iteration: 'number',
        promptKind: 'string',
        promptTarget: 'string',
        trustLevel: 'string',
        bundleDir: 'string',
        status: 'string',
        summary: 'string'
    });
}
function normalizeLatestRemediation(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (typeof record.trigger !== 'string'
        || typeof record.attemptCount !== 'number'
        || typeof record.action !== 'string'
        || typeof record.humanReviewRecommended !== 'boolean'
        || typeof record.summary !== 'string'
        || !Array.isArray(record.evidence)
        || record.evidence.some((entry) => typeof entry !== 'string')) {
        return null;
    }
    return {
        trigger: record.trigger,
        attemptCount: record.attemptCount,
        action: record.action,
        humanReviewRecommended: record.humanReviewRecommended,
        summary: record.summary,
        evidence: record.evidence,
        suggestedChildTasks: Array.isArray(record.suggestedChildTasks)
            ? record.suggestedChildTasks
                .filter((entry) => {
                if (typeof entry !== 'object' || entry === null) {
                    return false;
                }
                const child = entry;
                return typeof child.id === 'string'
                    && typeof child.title === 'string'
                    && typeof child.parentId === 'string'
                    && (child.validation === null || typeof child.validation === 'string')
                    && typeof child.rationale === 'string'
                    && Array.isArray(child.dependsOn)
                    && child.dependsOn.every((dependency) => {
                        if (typeof dependency !== 'object' || dependency === null) {
                            return false;
                        }
                        const record = dependency;
                        return typeof record.taskId === 'string' && typeof record.reason === 'string';
                    });
            })
            : []
    };
}
function normalizeTaskRemediationArtifact(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'taskRemediation'
        || typeof record.iteration !== 'number'
        || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
        || typeof record.action !== 'string'
        || !Array.isArray(record.suggestedChildTasks)) {
        return null;
    }
    const latestRemediation = normalizeLatestRemediation(candidate);
    if (!latestRemediation) {
        return null;
    }
    return {
        schemaVersion: 1,
        kind: 'taskRemediation',
        provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : null,
        iteration: record.iteration,
        selectedTaskId: record.selectedTaskId,
        selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
        trigger: latestRemediation.trigger,
        attemptCount: latestRemediation.attemptCount,
        action: latestRemediation.action,
        humanReviewRecommended: latestRemediation.humanReviewRecommended,
        summary: latestRemediation.summary,
        rationale: typeof record.rationale === 'string' ? record.rationale : '',
        proposedAction: typeof record.proposedAction === 'string' ? record.proposedAction : latestRemediation.summary,
        evidence: latestRemediation.evidence,
        triggeringHistory: Array.isArray(record.triggeringHistory)
            ? record.triggeringHistory
            : [],
        suggestedChildTasks: latestRemediation.suggestedChildTasks ?? [],
        artifactDir: typeof record.artifactDir === 'string' ? record.artifactDir : '',
        iterationResultPath: typeof record.iterationResultPath === 'string' ? record.iterationResultPath : '',
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : ''
    };
}
function normalizeCompletionReportArtifact(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'completionReport'
        || typeof record.status !== 'string'
        || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
        || !Array.isArray(record.warnings)) {
        return null;
    }
    const report = record.report;
    const normalizedReport = typeof report === 'object' && report !== null
        ? report
        : null;
    return {
        schemaVersion: 1,
        kind: 'completionReport',
        status: record.status,
        rejectionReason: typeof record.rejectionReason === 'string'
            ? record.rejectionReason
            : null,
        selectedTaskId: record.selectedTaskId,
        report: normalizedReport,
        rawBlock: typeof record.rawBlock === 'string' ? record.rawBlock : null,
        parseError: typeof record.parseError === 'string' ? record.parseError : null,
        warnings: record.warnings.filter((warning) => typeof warning === 'string')
    };
}
const VALID_PROPOSAL_STATUSES = new Set(['proposed', 'applied', 'rejected', 'partiallyApplied']);
const VALID_OPERATIONS = new Set(['append', 'replaceSection', 'addSectionItem']);
const VALID_RISKS = new Set(['low', 'medium', 'high']);
function normalizeDoctrineProposedUpdate(candidate) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return null;
    }
    const u = candidate;
    if (typeof u.targetFile !== 'string'
        || !u.targetFile.trim()
        || typeof u.operation !== 'string'
        || !VALID_OPERATIONS.has(u.operation)
        || typeof u.proposedText !== 'string'
        || !u.proposedText.trim()
        || typeof u.rationale !== 'string'
        || !u.rationale.trim()
        || !Array.isArray(u.evidence)
        || u.evidence.length === 0
        || !u.evidence.every((e) => typeof e === 'string' && e.trim() !== '')
        || typeof u.requiresApproval !== 'boolean'
        || typeof u.protectedTarget !== 'boolean'
        || typeof u.risk !== 'string'
        || !VALID_RISKS.has(u.risk)) {
        return null;
    }
    const operation = u.operation;
    const needsSection = operation === 'addSectionItem' || operation === 'replaceSection';
    const section = needsSection
        ? (typeof u.section === 'string' && u.section.trim() ? u.section : null)
        : (typeof u.section === 'string' ? u.section : null);
    if (needsSection && section === null) {
        return null;
    }
    return {
        targetFile: u.targetFile,
        operation,
        section,
        proposedText: u.proposedText,
        rationale: u.rationale,
        evidence: u.evidence,
        requiresApproval: u.requiresApproval,
        protectedTarget: u.protectedTarget,
        risk: u.risk
    };
}
async function countPendingDoctrineProposalsByRisk(artifactRootDir) {
    const counts = { low: 0, medium: 0, high: 0 };
    const directory = path.join(artifactRootDir, 'doctrine-proposals');
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    }
    catch {
        return counts;
    }
    await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.review.json'))
        .map(async (entry) => {
        const artifact = normalizeDoctrineProposalArtifact(await readJsonArtifact(path.join(directory, entry.name)));
        if (artifact?.status === 'proposed') {
            counts[artifact.risk] += 1;
        }
    }));
    return counts;
}
async function readPendingDoctrineProposals(artifactRootDir) {
    const directory = path.join(artifactRootDir, 'doctrine-proposals');
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const proposals = [];
    for (const entry of entries
        .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.json') && !candidate.name.endsWith('.review.json'))
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const proposalPath = path.join(directory, entry.name);
        const proposal = normalizeDoctrineProposalArtifact(await readJsonArtifact(proposalPath));
        if (proposal?.status === 'proposed') {
            proposals.push({ path: proposalPath, proposal });
        }
    }
    proposals.sort((left, right) => {
        const byId = left.proposal.proposalId.localeCompare(right.proposal.proposalId);
        return byId !== 0 ? byId : left.path.localeCompare(right.path);
    });
    return proposals;
}
function normalizeDoctrineProposalArtifact(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'doctrineUpdateProposal'
        || typeof record.proposalId !== 'string'
        || !record.proposalId.trim()
        || !Array.isArray(record.updates)
        || record.updates.length === 0
        || !Array.isArray(record.warnings)
        || !record.warnings.every((w) => typeof w === 'string')
        || typeof record.status !== 'string'
        || !VALID_PROPOSAL_STATUSES.has(record.status)
        || typeof record.risk !== 'string'
        || !VALID_RISKS.has(record.risk)) {
        return null;
    }
    const normalizedUpdates = [];
    for (const update of record.updates) {
        const normalized = normalizeDoctrineProposedUpdate(update);
        if (!normalized) {
            return null;
        }
        normalizedUpdates.push(normalized);
    }
    return {
        schemaVersion: 1,
        kind: 'doctrineUpdateProposal',
        proposalId: record.proposalId,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
        provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : null,
        iteration: typeof record.iteration === 'number' ? record.iteration : null,
        selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
        selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
        source: record.source === 'completionReport'
            || record.source === 'manual'
            || record.source === 'diagnostic'
            ? record.source
            : 'unknown',
        status: record.status,
        risk: record.risk,
        summary: typeof record.summary === 'string' ? record.summary : '',
        updates: normalizedUpdates,
        warnings: record.warnings,
        ...(typeof record.reviewedAt === 'string' ? { reviewedAt: record.reviewedAt } : {}),
        ...(record.reviewedBy === 'operator' ? { reviewedBy: 'operator' } : {}),
        ...(record.reviewAction === 'applied' || record.reviewAction === 'rejected' || record.reviewAction === 'partiallyApplied'
            ? { reviewAction: record.reviewAction }
            : {}),
        ...(Array.isArray(record.appliedUpdateIndexes)
            ? { appliedUpdateIndexes: record.appliedUpdateIndexes.filter((i) => typeof i === 'number') }
            : {}),
        ...(Array.isArray(record.rejectedUpdateIndexes)
            ? { rejectedUpdateIndexes: record.rejectedUpdateIndexes.filter((i) => typeof i === 'number') }
            : {}),
        ...(typeof record.reviewNotes === 'string' || record.reviewNotes === null
            ? { reviewNotes: record.reviewNotes }
            : {}),
        ...(Array.isArray(record.applicationWarnings)
            ? { applicationWarnings: record.applicationWarnings.filter((w) => typeof w === 'string') }
            : {})
    };
}
function normalizePrdReconciliationProposal(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'prdReconciliation'
        || record.schemaVersion !== 1
        || typeof record.generatedAt !== 'string'
        || typeof record.findingCount !== 'number'
        || !Array.isArray(record.findings)) {
        return null;
    }
    const findings = [];
    for (const candidateFinding of record.findings) {
        if (typeof candidateFinding !== 'object' || candidateFinding === null) {
            return null;
        }
        const finding = candidateFinding;
        if ((finding.type !== 'stale_prd_task_reference'
            && finding.type !== 'orphan_active_task'
            && finding.type !== 'duplicate_active_task')
            || (finding.severity !== 'info' && finding.severity !== 'warning')
            || typeof finding.message !== 'string'
            || (finding.taskIds !== undefined
                && (!Array.isArray(finding.taskIds) || finding.taskIds.some((taskId) => typeof taskId !== 'string')))) {
            return null;
        }
        findings.push({
            type: finding.type,
            severity: finding.severity,
            message: finding.message,
            ...(Array.isArray(finding.taskIds) ? { taskIds: finding.taskIds } : {})
        });
    }
    return {
        schemaVersion: 1,
        kind: 'prdReconciliation',
        generatedAt: record.generatedAt,
        findingCount: record.findingCount,
        findings
    };
}
async function collectPrdReconciliationStatus(input) {
    const paths = (0, artifactStore_1.resolvePrdReconciliationPaths)(input.artifactDir);
    const [prdExists, taskFileExists] = await Promise.all([
        (0, fs_1.pathExists)(input.prdPath),
        (0, fs_1.pathExists)(input.taskFilePath)
    ]);
    if (!prdExists) {
        return {
            status: 'missing',
            proposal: null,
            jsonPath: paths.jsonPath,
            markdownPath: paths.markdownPath,
            message: 'PRD file is missing; create .ralph/prd.md or regenerate the PRD.'
        };
    }
    if (!taskFileExists || !input.taskFileText) {
        return {
            status: 'missing',
            proposal: null,
            jsonPath: paths.jsonPath,
            markdownPath: paths.markdownPath,
            message: 'Task file is missing or unreadable; restore .ralph/tasks.json before reconciling PRD scope.'
        };
    }
    let proposal;
    try {
        proposal = (0, prdReconciliation_1.analyzePrdBacklogReconciliation)({
            prdText: await fs.readFile(input.prdPath, 'utf8'),
            taskFile: (0, taskFile_1.parseTaskFile)(input.taskFileText),
            generatedAt: new Date().toISOString()
        });
    }
    catch (error) {
        const existing = normalizePrdReconciliationProposal(await readJsonArtifact(paths.jsonPath));
        return {
            status: existing ? 'stale' : 'unreadable',
            proposal: null,
            jsonPath: paths.jsonPath,
            markdownPath: paths.markdownPath,
            message: existing
                ? 'Latest reconciliation proposal is stale; refresh the dashboard or run Show Status.'
                : `Unable to analyze PRD/backlog reconciliation: ${error instanceof Error ? error.message : String(error)}`
        };
    }
    try {
        await (0, artifactStore_1.writePrdReconciliationProposal)(input.artifactDir, proposal);
    }
    catch (error) {
        input.logger.warn('Failed to persist PRD/backlog reconciliation proposal for dashboard.', {
            error: error instanceof Error ? error.message : String(error)
        });
        return {
            status: 'unreadable',
            proposal: null,
            jsonPath: paths.jsonPath,
            markdownPath: paths.markdownPath,
            message: `Unable to write PRD/backlog reconciliation proposal: ${error instanceof Error ? error.message : String(error)}`
        };
    }
    return {
        status: 'available',
        proposal,
        jsonPath: paths.jsonPath,
        markdownPath: paths.markdownPath,
        message: null
    };
}
async function collectStatusSnapshot(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const rawConfig = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    const planningPassInspect = rawConfig.inspect('planningPass');
    const planningPassExplicit = planningPassInspect?.workspaceValue !== undefined
        || planningPassInspect?.globalValue !== undefined;
    const planningPassEnabledSource = planningPassExplicit ? 'explicit' : 'manifest-default';
    const budgetProfileInspect = rawConfig.inspect('promptBudgetProfile');
    const budgetProfileExplicit = budgetProfileInspect?.workspaceValue !== undefined
        || budgetProfileInspect?.globalValue !== undefined;
    const promptBudgetProfileSource = budgetProfileExplicit ? 'explicit' : 'manifest-default';
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const taskInspection = inspection.fileStatus.taskFilePath
        ? await stateManager.inspectTaskFile(inspection.paths)
        : {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics: []
        };
    const taskCounts = taskInspection.taskFile
        ? await stateManager.taskCounts(inspection.paths).catch((err) => {
            logger.warn('Failed to read task counts for status snapshot.', { error: err });
            return null;
        })
        : null;
    let taskFileError = null;
    let selectedTask = null;
    if (taskInspection.taskFile) {
        selectedTask = (0, taskFile_1.selectNextTask)(taskInspection.taskFile);
    }
    else if (taskInspection.diagnostics.length > 0) {
        taskFileError = taskInspection.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
    }
    const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
        ? vscode.window.activeTextEditor.document.uri.fsPath
        : null;
    const availableCommands = await vscode.commands.getCommands(true);
    const [workspaceScan, latestArtifacts, codexCliSupport] = await Promise.all([
        (0, workspaceScanner_1.scanWorkspaceCached)(workspaceFolder.uri.fsPath, workspaceFolder.name, {
            focusPath,
            inspectionRootOverride: config.inspectionRootOverride
        }),
        (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths),
        (0, codexCliSupport_1.inspectCodexCliSupport)((0, providers_1.getCliCommandPath)(config))
    ]);
    const rootPolicy = (0, rootPolicy_1.deriveRootPolicy)(workspaceScan);
    const gitStatus = await (0, verifier_1.captureGitStatus)(rootPolicy.verificationRootPath);
    const ideCommandSupport = (0, codexCliSupport_1.inspectIdeCommandSupport)({
        preferredHandoffMode: config.preferredHandoffMode,
        openSidebarCommandId: config.openSidebarCommandId,
        newChatCommandId: config.newChatCommandId,
        availableCommands
    });
    const validationCommand = (0, verifier_1.normalizeValidationCommand)({
        command: (0, verifier_1.chooseValidationCommand)(workspaceScan, selectedTask, config.validationCommandOverride),
        workspaceRootPath: workspaceFolder.uri.fsPath,
        verificationRootPath: rootPolicy.verificationRootPath
    });
    const taskValidationHint = selectedTask?.validation?.trim() || null;
    const rawSelectedValidationCommand = (0, verifier_1.chooseValidationCommand)(workspaceScan, selectedTask, config.validationCommandOverride);
    const normalizedValidationCommandFrom = rawSelectedValidationCommand
        && validationCommand
        && rawSelectedValidationCommand !== validationCommand
        ? rawSelectedValidationCommand
        : null;
    const validationCommandReadiness = await (0, verifier_1.inspectValidationCommandReadiness)({
        command: validationCommand,
        rootPath: rootPolicy.verificationRootPath
    });
    const [artifactReadinessDiagnostics, staleStateDiagnostics, handoffHealthDiagnostics, doctrineInspection, doctrineContext, pendingDoctrineProposalCountsByRisk, pendingDoctrineProposals, prdReconciliation] = await Promise.all([
        (0, preflight_1.inspectPreflightArtifactReadiness)({
            rootPath: workspaceFolder.uri.fsPath,
            artifactRootDir: inspection.paths.artifactDir,
            promptDir: inspection.paths.promptDir,
            runDir: inspection.paths.runDir,
            stateFilePath: inspection.paths.stateFilePath,
            generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
            provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
        }),
        (0, preflight_1.checkStaleState)({
            stateFilePath: inspection.paths.stateFilePath,
            taskFilePath: inspection.paths.taskFilePath,
            claimFilePath: inspection.paths.claimFilePath,
            artifactDir: inspection.paths.artifactDir,
            staleClaimTtlMs: config.watchdogStaleTtlMs
        }),
        (0, preflight_1.checkHandoffHealth)({ ralphRoot: inspection.paths.ralphDir }),
        (0, doctrine_1.inspectDoctrinePack)(workspaceFolder.uri.fsPath),
        (0, doctrine_1.collectDoctrineContext)(workspaceFolder.uri.fsPath),
        countPendingDoctrineProposalsByRisk(inspection.paths.artifactDir),
        readPendingDoctrineProposals(inspection.paths.artifactDir),
        collectPrdReconciliationStatus({
            prdPath: inspection.paths.prdPath,
            taskFilePath: inspection.paths.taskFilePath,
            artifactDir: inspection.paths.artifactDir,
            taskFileText: taskInspection.text,
            logger
        })
    ]);
    const agentHealthDiagnostics = [...staleStateDiagnostics, ...handoffHealthDiagnostics];
    const claimGraph = await (0, taskFile_1.inspectTaskClaimGraph)(inspection.paths.claimFilePath);
    const [latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestRemediation, latestDoctrineProposal, latestProvenanceBundle] = await Promise.all([
        readJsonArtifact(latestArtifacts.latestPromptEvidencePath).then(normalizePromptEvidence),
        readJsonArtifact(latestArtifacts.latestExecutionPlanPath).then(normalizeExecutionPlan),
        readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation),
        readJsonArtifact(latestArtifacts.latestRemediationPath).then(normalizeLatestRemediation),
        readJsonArtifact(latestArtifacts.latestDoctrineProposalPath).then(normalizeDoctrineProposalArtifact),
        readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle)
    ]);
    const currentProvenanceId = latestExecutionPlan?.provenanceId
        ?? latestProvenanceBundle?.provenanceId
        ?? inspection.state.lastIteration?.provenanceId
        ?? null;
    let latestDoctrineReviewJsonPath = null;
    let latestDoctrineReviewMdPath = null;
    if (latestDoctrineProposal?.proposalId) {
        try {
            const reviewPaths = (0, artifactStore_1.resolveDoctrineProposalReviewPaths)(inspection.paths.artifactDir, latestDoctrineProposal.proposalId);
            const [reviewJsonExists, reviewMdExists] = await Promise.all([
                (0, fs_1.pathExists)(reviewPaths.reviewJsonPath),
                (0, fs_1.pathExists)(reviewPaths.reviewMdPath)
            ]);
            if (reviewJsonExists) {
                latestDoctrineReviewJsonPath = reviewPaths.reviewJsonPath;
            }
            if (reviewMdExists) {
                latestDoctrineReviewMdPath = reviewPaths.reviewMdPath;
            }
        }
        catch {
            // unsafe proposalId — skip review path resolution
        }
    }
    // Derive rolePolicySource from the most recent context-envelope artifact (iteration - 1).
    let rolePolicySource = 'preset';
    const prevIteration = inspection.state.nextIteration - 1;
    if (prevIteration >= 1) {
        const envelopePath = (0, artifactStore_1.contextEnvelopePath)(inspection.paths.artifactDir, String(prevIteration).padStart(3, '0'));
        try {
            const raw = await fs.readFile(envelopePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed.policySource === 'crew' || parsed.policySource === 'explicit') {
                rolePolicySource = parsed.policySource;
            }
        }
        catch {
            // file absent or unreadable — default 'preset' stands
        }
    }
    const effectiveRolePolicy = (0, rolePolicy_1.getEffectivePolicy)(config.agentRole);
    const providerReadinessDiagnostics = await (0, preflight_1.inspectProviderReadinessDiagnostics)({
        config,
        codexCliSupport,
        ideCommandSupport
    });
    const preflightReport = (0, preflight_1.buildPreflightReport)({
        rootPath: workspaceFolder.uri.fsPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        config,
        taskInspection,
        taskCounts,
        selectedTask,
        currentProvenanceId,
        claimGraph,
        taskValidationHint,
        validationCommand,
        normalizedValidationCommandFrom,
        validationCommandReadiness,
        fileStatus: inspection.fileStatus,
        codexCliSupport,
        ideCommandSupport,
        providerReadinessDiagnostics,
        artifactReadinessDiagnostics,
        doctrineDiagnostics: doctrineInspection.diagnostics,
        agentHealthDiagnostics,
        rolePolicySource
    });
    const [generatedArtifactRetention, provenanceBundleRetention, latestPipelineEntry, deadLetterQueue] = await Promise.all([
        (0, artifactStore_1.inspectGeneratedArtifactRetention)({
            artifactRootDir: inspection.paths.artifactDir,
            promptDir: inspection.paths.promptDir,
            runDir: inspection.paths.runDir,
            stateFilePath: inspection.paths.stateFilePath,
            retentionCount: config.generatedArtifactRetentionCount
        }),
        (0, artifactStore_1.inspectProvenanceBundleRetention)({
            artifactRootDir: inspection.paths.artifactDir,
            retentionCount: config.provenanceBundleRetentionCount
        }),
        (0, pipeline_1.readLatestPipelineArtifact)(inspection.paths.artifactDir),
        (0, deadLetter_1.readDeadLetterQueue)(inspection.paths.deadLetterPath)
    ]);
    let orchestration = null;
    if (latestPipelineEntry?.artifact) {
        const runId = latestPipelineEntry.artifact.runId;
        const orchestrationPaths = (0, orchestrationSupervisor_1.resolveOrchestrationPaths)(inspection.paths.ralphDir, runId);
        try {
            const [graph, state] = await Promise.all([
                (0, orchestrationSupervisor_1.readOrchestrationGraph)(orchestrationPaths),
                (0, orchestrationSupervisor_1.readOrchestrationState)(orchestrationPaths)
            ]);
            const activeNode = graph.nodes.find((n) => n.id === state.cursor);
            const completedNodes = state.nodeStates
                .filter((ns) => ns.outcome === 'completed')
                .map((ns) => {
                const node = graph.nodes.find((n) => n.id === ns.nodeId);
                return {
                    nodeId: ns.nodeId,
                    label: node?.label ?? ns.nodeId,
                    outcome: ns.outcome,
                    finishedAt: ns.finishedAt
                };
            });
            const pendingBranchNodes = state.cursor
                ? graph.edges
                    .filter((e) => e.from === state.cursor)
                    .map((e) => {
                    const node = graph.nodes.find((n) => n.id === e.to);
                    return {
                        nodeId: e.to,
                        label: node?.label ?? e.to
                    };
                })
                : [];
            orchestration = {
                activeNodeId: state.cursor,
                activeNodeLabel: activeNode?.label ?? null,
                completedNodes,
                pendingBranchNodes
            };
        }
        catch {
            // no orchestration state for this run, or malformed — leave as null
        }
    }
    const deadLetterEntries = deadLetterQueue.entries;
    // Read replan decision artifacts for the latest pipeline run's root task.
    const replanArtifacts = [];
    const rootTaskId = latestPipelineEntry?.artifact.rootTaskId;
    if (rootTaskId) {
        const rootTaskArtifactDir = path.join(inspection.paths.artifactDir, rootTaskId);
        const replanFilePattern = /^replan-(\d+)\.json$/;
        try {
            const dirEntries = await fs.readdir(rootTaskArtifactDir, { withFileTypes: true });
            const replanFiles = dirEntries
                .filter((e) => e.isFile() && replanFilePattern.test(e.name))
                .sort((a, b) => {
                const aIndex = Number.parseInt(replanFilePattern.exec(a.name)[1], 10);
                const bIndex = Number.parseInt(replanFilePattern.exec(b.name)[1], 10);
                return aIndex - bIndex;
            });
            for (const entry of replanFiles) {
                try {
                    const raw = await fs.readFile(path.join(rootTaskArtifactDir, entry.name), 'utf8');
                    const parsed = JSON.parse(raw);
                    if (parsed.kind === 'replanDecision') {
                        replanArtifacts.push(parsed);
                    }
                }
                catch {
                    // malformed or unreadable — skip
                }
            }
        }
        catch {
            // directory absent or unreadable — leave empty
        }
    }
    // Extract fanInRecord from the plan graph for the latest pipeline root task.
    let fanInRecord = null;
    if (rootTaskId) {
        const graphPath = (0, artifactStore_1.planGraphPath)(inspection.paths.artifactDir, rootTaskId);
        try {
            const raw = await fs.readFile(graphPath, 'utf8');
            const parsed = JSON.parse(raw);
            fanInRecord = parsed.fanInRecord ?? null;
        }
        catch {
            // plan graph absent or unreadable — leave null
        }
    }
    // Collect per-node execution spans from the latest orchestration run.
    const nodeSpans = [];
    if (latestPipelineEntry?.artifact?.runId) {
        const runId = latestPipelineEntry.artifact.runId;
        const orchDir = path.join(inspection.paths.ralphDir, 'orchestration', runId);
        const spanPattern = /^node-.+-span\.json$/;
        try {
            const entries = await fs.readdir(orchDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile() || !spanPattern.test(entry.name)) {
                    continue;
                }
                try {
                    const raw = await fs.readFile(path.join(orchDir, entry.name), 'utf8');
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.nodeId) {
                        nodeSpans.push(parsed);
                    }
                }
                catch {
                    // malformed span — skip
                }
            }
        }
        catch {
            // orchestration dir absent — leave empty
        }
    }
    let latestHandoff = null;
    try {
        const raw = await fs.readFile((0, handoffManager_1.resolveLatestHandoffPath)(inspection.paths.ralphDir), 'utf8');
        latestHandoff = JSON.parse(raw);
    }
    catch {
        // no latest-handoff.json yet — leave as null
    }
    let lastFailureCategory = null;
    let recoveryAttemptCount = null;
    let latestFailureAnalysis = null;
    let latestFailureAnalysisPath = null;
    let recoveryStatePath = null;
    if (selectedTask) {
        const selectedFailureAnalysisPath = (0, failureDiagnostics_1.getFailureAnalysisPath)(inspection.paths.artifactDir, selectedTask.id);
        const selectedRecoveryStatePath = (0, recoveryOrchestrator_1.getRecoveryStatePath)(inspection.paths.artifactDir, selectedTask.id);
        const [failureAnalysisRaw, recoveryStateRaw] = await Promise.all([
            fs.readFile(selectedFailureAnalysisPath, 'utf8').catch(() => null),
            fs.readFile(selectedRecoveryStatePath, 'utf8').catch(() => null)
        ]);
        if (failureAnalysisRaw) {
            const parsed = (0, failureDiagnostics_1.parseFailureDiagnosticResponse)(failureAnalysisRaw);
            latestFailureAnalysis = parsed;
            lastFailureCategory = parsed?.rootCauseCategory ?? null;
            latestFailureAnalysisPath = selectedFailureAnalysisPath;
        }
        if (recoveryStateRaw) {
            try {
                const parsed = JSON.parse(recoveryStateRaw);
                recoveryAttemptCount = typeof parsed.attemptCount === 'number' ? parsed.attemptCount : null;
                recoveryStatePath = selectedRecoveryStatePath;
            }
            catch {
                // malformed JSON — leave null
            }
        }
    }
    const tierThresholds = {
        simpleThreshold: config.modelTiering.simpleThreshold,
        complexThreshold: config.modelTiering.complexThreshold
    };
    const taskFile = taskInspection.taskFile;
    const iterationHistory = inspection.state.iterationHistory;
    const effectiveTierInfo = selectedTask && taskFile
        ? (0, complexityScorer_1.deriveEffectiveTier)({ task: selectedTask, taskFile, iterationHistory, ...tierThresholds })
        : null;
    const lastTaskId = inspection.state.lastIteration?.selectedTaskId ?? null;
    const lastTask = lastTaskId && taskFile
        ? taskFile.tasks.find((task) => task.id === lastTaskId) ?? null
        : null;
    const lastTaskTierInfo = lastTask && taskFile
        ? (0, complexityScorer_1.deriveEffectiveTier)({ task: lastTask, taskFile, iterationHistory, ...tierThresholds })
        : null;
    return {
        workspaceName: workspaceFolder.name,
        rootPath: workspaceFolder.uri.fsPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        nextIteration: inspection.state.nextIteration,
        lastIteration: inspection.state.lastIteration,
        runHistory: inspection.state.runHistory,
        iterationHistory,
        taskCounts,
        taskFileError,
        selectedTask,
        latestSummaryPath: latestArtifacts.latestSummaryPath,
        latestResultPath: latestArtifacts.latestResultPath,
        latestPreflightReportPath: latestArtifacts.latestPreflightReportPath,
        latestPreflightSummaryPath: latestArtifacts.latestPreflightSummaryPath,
        latestPromptPath: latestArtifacts.latestPromptPath,
        latestPromptEvidencePath: latestArtifacts.latestPromptEvidencePath,
        latestExecutionPlanPath: latestArtifacts.latestExecutionPlanPath,
        latestCliInvocationPath: latestArtifacts.latestCliInvocationPath,
        latestRemediationPath: latestArtifacts.latestRemediationPath,
        latestDoctrineProposalPath: latestArtifacts.latestDoctrineProposalPath,
        latestDoctrineProposalMdPath: latestArtifacts.latestDoctrineProposalMdPath,
        latestDoctrineReviewJsonPath,
        latestDoctrineReviewMdPath,
        latestProvenanceBundlePath: latestArtifacts.latestProvenanceBundlePath,
        latestProvenanceSummaryPath: latestArtifacts.latestProvenanceSummaryPath,
        latestProvenanceFailurePath: latestArtifacts.latestProvenanceFailurePath,
        latestOfflineEvaluationReportPath: latestArtifacts.latestOfflineEvaluationReportPath,
        latestOfflineEvaluationSummary: latestArtifacts.latestOfflineEvaluationSummary,
        artifactDir: inspection.paths.artifactDir,
        stateFilePath: inspection.paths.stateFilePath,
        progressPath: inspection.paths.progressPath,
        taskFilePath: inspection.paths.taskFilePath,
        promptPath: inspection.state.lastIteration?.promptPath ?? inspection.state.lastPromptPath,
        latestPromptEvidence,
        latestExecutionPlan,
        latestCliInvocation,
        latestRemediation,
        latestDoctrineProposal,
        prdReconciliation,
        doctrineInspection,
        doctrineContext,
        pendingDoctrineProposalCountsByRisk,
        pendingDoctrineProposals,
        latestProvenanceBundle,
        latestArtifactRepair: latestArtifacts.repair,
        generatedArtifactRetention,
        provenanceBundleRetention,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
        verifierModes: config.verifierModes,
        gitCheckpointMode: config.gitCheckpointMode,
        validationCommandOverride: config.validationCommandOverride || null,
        agentCount: config.agentCount,
        workspaceScan,
        gitStatus,
        preflightReport,
        claimGraph,
        currentProvenanceId,
        latestPipelineRunPath: latestPipelineEntry?.artifactPath ?? null,
        latestPipelineRun: latestPipelineEntry?.artifact ?? null,
        effectiveTierInfo,
        lastTaskTierInfo,
        planningPassEnabled: config.planningPass.enabled,
        planningPassEnabledSource,
        promptBudgetProfile: config.promptBudgetProfile,
        promptBudgetProfileSource,
        deadLetterEntries,
        lastFailureCategory,
        recoveryAttemptCount,
        latestFailureAnalysis,
        latestFailureAnalysisPath,
        recoveryStatePath,
        orchestration,
        latestHandoff,
        effectiveRolePolicy,
        rolePolicySource,
        replanArtifacts: replanArtifacts.length > 0 ? replanArtifacts : undefined,
        fanInRecord: fanInRecord ?? undefined,
        nodeSpans: nodeSpans.length > 0 ? nodeSpans : undefined
    };
}
//# sourceMappingURL=statusSnapshot.js.map