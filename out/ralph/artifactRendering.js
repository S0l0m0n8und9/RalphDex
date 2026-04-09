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
exports.formatTrustLevel = formatTrustLevel;
exports.artifactReferenceLines = artifactReferenceLines;
exports.renderPreflightSummary = renderPreflightSummary;
exports.renderIterationSummary = renderIterationSummary;
exports.renderIntegrityFailureSummary = renderIntegrityFailureSummary;
exports.renderProvenanceSummary = renderProvenanceSummary;
exports.renderLatestResultSummary = renderLatestResultSummary;
exports.latestResultFromIteration = latestResultFromIteration;
exports.looksLikePreflightRecord = looksLikePreflightRecord;
exports.looksLikeIntegrityFailure = looksLikeIntegrityFailure;
exports.looksLikeProvenanceBundle = looksLikeProvenanceBundle;
exports.provenanceIdFromRecord = provenanceIdFromRecord;
const path = __importStar(require("path"));
function formatOptional(value) {
    return value && value.trim().length > 0 ? value : 'none';
}
function bulletList(values) {
    return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- none';
}
function formatDiagnosticLine(diagnostic) {
    return `- ${diagnostic.severity}: ${diagnostic.message}`;
}
function formatTrustLevel(value) {
    return value === 'verifiedCliExecution'
        ? 'verified CLI execution'
        : 'prepared prompt only';
}
function artifactReferenceLines(paths, diffSummary) {
    const lines = [
        `- Prompt: ${paths.promptPath}`,
        `- Prompt evidence: ${paths.promptEvidencePath}`,
        `- Execution plan: ${paths.executionPlanPath}`,
        `- Completion report: ${paths.completionReportPath}`,
        `- Execution summary: ${paths.executionSummaryPath}`,
        `- Verifier summary: ${paths.verifierSummaryPath}`,
        `- Iteration result: ${paths.iterationResultPath}`,
        `- Remediation proposal: ${paths.remediationPath}`,
        `- Stdout: ${paths.stdoutPath}`,
        `- Stderr: ${paths.stderrPath}`,
        `- CLI invocation: ${paths.cliInvocationPath}`
    ];
    if (diffSummary) {
        lines.push(`- Diff summary: ${paths.diffSummaryPath}`);
    }
    if (diffSummary?.beforeStatusPath) {
        lines.push(`- Git status before: ${paths.gitStatusBeforePath}`);
    }
    if (diffSummary?.afterStatusPath) {
        lines.push(`- Git status after: ${paths.gitStatusAfterPath}`);
    }
    return lines;
}
function renderPreflightSummary(report) {
    const headline = report.ready
        ? 'Preflight completed without blocking errors.'
        : 'Preflight blocked before Codex execution started.';
    const diagnostics = report.diagnostics.length > 0
        ? report.diagnostics.map(formatDiagnosticLine)
        : ['- ok'];
    const handoffLine = report.sessionHandoff
        ? `- Session handoff: ${report.sessionHandoff.agentId}-${String(report.sessionHandoff.iteration).padStart(3, '0')}.json | ${report.sessionHandoff.humanSummary}`
        : '- Session handoff: none';
    return [
        `# Ralph Preflight ${report.iteration}`,
        '',
        `- Agent ID: ${formatOptional(report.agentId)}`,
        `- Provenance ID: ${report.provenanceId}`,
        `- Trust level: ${formatTrustLevel(report.trustLevel)}`,
        `- Ready: ${report.ready ? 'yes' : 'no'}`,
        `- Prompt kind: ${report.promptKind}`,
        `- Prompt target: ${report.promptTarget}`,
        `- Selected task: ${formatOptional(report.selectedTaskId)}${report.selectedTaskTitle ? ` - ${report.selectedTaskTitle}` : ''}`,
        `- Task validation hint: ${formatOptional(report.taskValidationHint)}`,
        `- Effective validation command: ${formatOptional(report.effectiveValidationCommand)}`,
        `- Validation normalized from: ${formatOptional(report.normalizedValidationCommandFrom)}`,
        `- Validation: ${formatOptional(report.validationCommand)}`,
        `- Summary: ${report.summary}`,
        `- Active claim state: ${report.activeClaimSummary ?? 'none'}`,
        handoffLine,
        `- Report: ${report.reportPath}`,
        '',
        headline,
        '',
        '## Diagnostics',
        ...diagnostics
    ].join('\n');
}
function renderIterationSummary(input) {
    const { result, paths, diffSummary, verifiers } = input;
    const verifierLines = verifiers.map((verifier) => {
        const location = verifier.artifactPath ? ` (${verifier.artifactPath})` : '';
        return `${verifier.verifier}: ${verifier.status} - ${verifier.summary}${location}`;
    });
    const diffLines = diffSummary
        ? [
            `- Summary: ${diffSummary.summary}`,
            `- Git available: ${diffSummary.gitAvailable ? 'yes' : 'no'}`,
            `- Changed files: ${diffSummary.changedFileCount}`,
            `- Relevant changed files: ${diffSummary.relevantChangedFileCount}`,
            `- Suggested checkpoint ref: ${diffSummary.suggestedCheckpointRef ?? 'none'}`
        ]
        : ['- none'];
    return [
        `# Ralph Iteration ${result.iteration}`,
        '',
        '## Outcome',
        `- Agent ID: ${formatOptional(result.agentId)}`,
        `- Provenance ID: ${formatOptional(result.provenanceId)}`,
        `- Selected task: ${formatOptional(result.selectedTaskId)}${result.selectedTaskTitle ? ` - ${result.selectedTaskTitle}` : ''}`,
        `- Prompt kind: ${result.promptKind}`,
        `- Target mode: ${result.executionIntegrity?.promptTarget ?? 'unknown'}`,
        `- Template: ${result.executionIntegrity?.templatePath ?? 'unknown'}`,
        `- Reasoning effort: ${result.executionIntegrity?.reasoningEffort ?? 'unknown'}`,
        `- Execution: ${result.executionStatus}`,
        `- Execution message: ${result.execution.message ?? 'none'}`,
        `- Verification: ${result.verificationStatus}`,
        `- Classification: ${result.completionClassification} (selected task)`,
        `- Backlog remaining: ${result.backlog.remainingTaskCount}`,
        `- Next actionable task available: ${result.backlog.actionableTaskAvailable ? 'yes' : 'no'}`,
        `- Follow-up action: ${result.followUpAction}`,
        `- Stop reason: ${formatOptional(result.stopReason)}`,
        `- Remediation: ${result.remediation?.summary ?? 'none'}`,
        `- Summary: ${result.summary}`,
        '',
        '## Execution Integrity',
        `- Plan: ${result.executionIntegrity?.executionPlanPath ?? 'none'}`,
        `- Plan hash: ${result.executionIntegrity?.executionPlanHash ?? 'none'}`,
        `- Prompt artifact: ${result.executionIntegrity?.promptArtifactPath ?? 'none'}`,
        `- Prompt hash: ${result.executionIntegrity?.promptHash ?? 'none'}`,
        `- Workspace root: ${result.executionIntegrity?.rootPolicy?.workspaceRootPath ?? 'none'}`,
        `- Execution root: ${result.executionIntegrity?.rootPolicy?.executionRootPath ?? 'none'}`,
        `- Verifier root: ${result.executionIntegrity?.rootPolicy?.verificationRootPath ?? 'none'}`,
        `- Payload matched rendered artifact: ${result.executionIntegrity?.executionPayloadMatched == null
            ? 'not executed'
            : result.executionIntegrity.executionPayloadMatched ? 'yes' : 'no'}`,
        `- CLI invocation: ${result.executionIntegrity?.cliInvocationPath ?? 'none'}`,
        `- Integrity issue: ${result.executionIntegrity?.mismatchReason ?? 'none'}`,
        '',
        '## Validation',
        `- Task validation hint: ${formatOptional(result.verification.taskValidationHint)}`,
        `- Effective validation command: ${formatOptional(result.verification.effectiveValidationCommand)}`,
        `- Validation command normalized from: ${formatOptional(result.verification.normalizedValidationCommandFrom)}`,
        `- Primary command: ${formatOptional(result.verification.primaryCommand)}`,
        `- Failure signature: ${formatOptional(result.verification.validationFailureSignature)}`,
        verifierLines.length > 0 ? bulletList(verifierLines) : '- none',
        '',
        '## Diff',
        ...diffLines,
        '',
        '## Artifact Paths',
        ...artifactReferenceLines(paths, diffSummary),
        '',
        '## Signals',
        `- No-progress signals: ${result.noProgressSignals.join(', ') || 'none'}`,
        `- Remediation action: ${result.remediation?.action ?? 'none'}`,
        `- Remediation evidence: ${result.remediation?.evidence.join(' | ') || 'none'}`,
        `- Remediation proposal artifact: ${result.remediation ? paths.remediationPath : 'none'}`,
        `- Completion report status: ${result.completionReportStatus ?? 'none'}`,
        `- Reconciliation warnings: ${result.reconciliationWarnings?.join(' | ') || 'none'}`,
        `- Warnings: ${result.warnings.join(' | ') || 'none'}`,
        `- Errors: ${result.errors.join(' | ') || 'none'}`
    ].join('\n');
}
function renderIntegrityFailureSummary(failure) {
    return [
        `# Ralph Provenance Failure ${failure.iteration}`,
        '',
        `- Provenance ID: ${failure.provenanceId}`,
        `- Stage: ${failure.stage}`,
        `- Prompt kind: ${failure.promptKind}`,
        `- Prompt target: ${failure.promptTarget}`,
        `- Trust level: ${formatTrustLevel(failure.trustLevel)}`,
        `- Summary: ${failure.summary}`,
        `- Message: ${failure.message}`,
        '',
        '## Expected vs Actual',
        `- Expected execution plan hash: ${failure.expectedExecutionPlanHash ?? 'none'}`,
        `- Actual execution plan hash: ${failure.actualExecutionPlanHash ?? 'none'}`,
        `- Expected prompt hash: ${failure.expectedPromptHash ?? 'none'}`,
        `- Actual prompt hash: ${failure.actualPromptHash ?? 'none'}`,
        `- Expected payload hash: ${failure.expectedPayloadHash ?? 'none'}`,
        `- Actual payload hash: ${failure.actualPayloadHash ?? 'none'}`,
        '',
        '## Artifact Paths',
        `- Iteration artifact dir: ${failure.artifactDir}`,
        `- Execution plan: ${failure.executionPlanPath ?? 'none'}`,
        `- Prompt artifact: ${failure.promptArtifactPath ?? 'none'}`,
        `- CLI invocation: ${failure.cliInvocationPath ?? 'none'}`
    ].join('\n');
}
function renderProvenanceSummary(bundle) {
    const reconciliationWarnings = bundle.reconciliationWarnings ?? [];
    const epistemicGap = bundle.epistemicGap ?? {
        trustBoundary: 'The provenance chain stops at the codex exec boundary; model-internal reasoning is not directly observable.',
        bundleProves: 'The persisted Ralph artifacts and any verifier-observed run outputs recorded in this bundle.',
        bundleDoesNotProve: 'That the model reasoned correctly internally or that an unverified completion report is true.',
        modelClaimsPath: bundle.completionReportPath ?? null,
        modelClaimsStatus: bundle.completionReportStatus ?? null,
        modelClaimsAreUnverified: (bundle.completionReportPath ?? null) !== null,
        verifierEvidencePaths: [bundle.executionSummaryPath, bundle.verifierSummaryPath, bundle.iterationResultPath]
            .filter((item) => typeof item === 'string' && item.length > 0),
        verifierEvidenceIsAuthoritative: true,
        reconciliationWarnings,
        noWarningsMeans: 'No reconciliation warnings means the model claim matched the observable verifier signals, not that the model reasoning was correct.'
    };
    const verifierEvidencePaths = epistemicGap.verifierEvidencePaths;
    return [
        `# Ralph Provenance ${bundle.provenanceId}`,
        '',
        `- Agent ID: ${formatOptional(bundle.agentId)}`,
        `- Iteration: ${bundle.iteration}`,
        `- Status: ${bundle.status}`,
        `- Trust level: ${formatTrustLevel(bundle.trustLevel)}`,
        `- Prompt kind: ${bundle.promptKind}`,
        `- Prompt target: ${bundle.promptTarget}`,
        `- Workspace root: ${bundle.rootPolicy.workspaceRootPath}`,
        `- Inspection root: ${bundle.rootPolicy.inspectionRootPath}`,
        `- Execution root: ${bundle.rootPolicy.executionRootPath}`,
        `- Verifier root: ${bundle.rootPolicy.verificationRootPath}`,
        `- Selected task: ${formatOptional(bundle.selectedTaskId)}${bundle.selectedTaskTitle ? ` - ${bundle.selectedTaskTitle}` : ''}`,
        `- Summary: ${bundle.summary}`,
        '',
        '## Integrity',
        `- Execution plan hash: ${bundle.executionPlanHash ?? 'none'}`,
        `- Prompt hash: ${bundle.promptHash ?? 'none'}`,
        `- Payload matched rendered artifact: ${bundle.executionPayloadMatched == null
            ? 'not executed'
            : bundle.executionPayloadMatched ? 'yes' : 'no'}`,
        `- Integrity issue: ${bundle.mismatchReason ?? 'none'}`,
        '',
        '## Bundle Files',
        `- Bundle manifest: ${bundle.bundleDir ? path.join(bundle.bundleDir, 'provenance-bundle.json') : 'none'}`,
        `- Preflight report: ${bundle.preflightReportPath}`,
        `- Preflight summary: ${bundle.preflightSummaryPath}`,
        `- Prompt artifact: ${bundle.promptArtifactPath ?? 'none'}`,
        `- Prompt evidence: ${bundle.promptEvidencePath ?? 'none'}`,
        `- Execution plan: ${bundle.executionPlanPath ?? 'none'}`,
        `- CLI invocation: ${bundle.cliInvocationPath ?? 'none'}`,
        `- Iteration result: ${bundle.iterationResultPath ?? 'none'}`,
        `- Execution summary: ${bundle.executionSummaryPath ?? 'none'}`,
        `- Verifier summary: ${bundle.verifierSummaryPath ?? 'none'}`,
        `- Completion report: ${bundle.completionReportPath ?? 'none'}`,
        `- Provenance failure: ${bundle.provenanceFailurePath ?? 'none'}`,
        '',
        '## Model Claims',
        `- Completion report path: ${epistemicGap.modelClaimsPath ?? 'none'}`,
        `- Model self-report status: ${epistemicGap.modelClaimsStatus ?? 'none'}`,
        `- Unverified model claim: ${epistemicGap.modelClaimsAreUnverified ? 'yes' : 'no'}`,
        `- Reconciliation warnings: ${reconciliationWarnings.join(' | ') || 'none'}`,
        '',
        '## Verifier Evidence',
        ...(verifierEvidencePaths.length > 0
            ? verifierEvidencePaths.map((evidencePath) => `- ${evidencePath}`)
            : ['- none']),
        `- Verifier evidence is authoritative: ${epistemicGap.verifierEvidenceIsAuthoritative ? 'yes' : 'no'}`,
        '',
        '## Epistemic Gap',
        `- Trust boundary: ${epistemicGap.trustBoundary}`,
        `- This bundle proves: ${epistemicGap.bundleProves}`,
        `- This bundle does not prove: ${epistemicGap.bundleDoesNotProve}`,
        `- No-warning interpretation: ${epistemicGap.noWarningsMeans}`,
        '',
        '## Canonical Iteration Artifacts',
        `- Iteration artifact dir: ${bundle.artifactDir}`
    ].join('\n');
}
function renderLatestResultSummary(record) {
    if (typeof record.iteration !== 'number'
        || typeof record.promptKind !== 'string'
        || typeof record.executionStatus !== 'string'
        || typeof record.verificationStatus !== 'string'
        || typeof record.completionClassification !== 'string'
        || typeof record.followUpAction !== 'string'
        || typeof record.summary !== 'string') {
        return null;
    }
    const selectedTaskId = typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null;
    const selectedTaskTitle = typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null;
    const agentId = typeof record.agentId === 'string' ? record.agentId : 'none';
    const promptTarget = typeof record.promptTarget === 'string' ? record.promptTarget : 'unknown';
    const templatePath = typeof record.templatePath === 'string' ? record.templatePath : 'unknown';
    const executionMessage = typeof record.executionMessage === 'string' ? record.executionMessage : 'none';
    const stopReason = typeof record.stopReason === 'string' ? record.stopReason : 'none';
    const taskValidationHint = typeof record.taskValidationHint === 'string' ? record.taskValidationHint : 'none';
    const effectiveValidationCommand = typeof record.effectiveValidationCommand === 'string'
        ? record.effectiveValidationCommand
        : 'none';
    const normalizedValidationCommandFrom = typeof record.normalizedValidationCommandFrom === 'string'
        ? record.normalizedValidationCommandFrom
        : 'none';
    const promptArtifactPath = typeof record.promptArtifactPath === 'string' ? record.promptArtifactPath : 'none';
    const executionPlanPath = typeof record.executionPlanPath === 'string' ? record.executionPlanPath : 'none';
    const cliInvocationPath = typeof record.cliInvocationPath === 'string' ? record.cliInvocationPath : 'none';
    const remediationSummary = typeof record.remediation?.summary === 'string'
        ? record.remediation.summary
        : 'none';
    const summaryPath = typeof record.summaryPath === 'string' ? record.summaryPath : 'none';
    const transcriptPath = typeof record.transcriptPath === 'string' ? record.transcriptPath : 'none';
    const lastMessagePath = typeof record.lastMessagePath === 'string' ? record.lastMessagePath : 'none';
    const executionSummaryPath = typeof record.executionSummaryPath === 'string' ? record.executionSummaryPath : 'none';
    const verifierSummaryPath = typeof record.verifierSummaryPath === 'string' ? record.verifierSummaryPath : 'none';
    const iterationResultPath = typeof record.iterationResultPath === 'string' ? record.iterationResultPath : 'none';
    const stdoutPath = typeof record.stdoutPath === 'string' ? record.stdoutPath : 'none';
    const stderrPath = typeof record.stderrPath === 'string' ? record.stderrPath : 'none';
    const diffSummaryPath = typeof record.diffSummaryPath === 'string' ? record.diffSummaryPath : 'none';
    const remediationPath = typeof record.remediationPath === 'string' ? record.remediationPath : 'none';
    const completionReportStatus = typeof record.completionReportStatus === 'string' ? record.completionReportStatus : 'none';
    const promptHash = typeof record.promptHash === 'string' ? record.promptHash : 'none';
    const executionPlanHash = typeof record.executionPlanHash === 'string' ? record.executionPlanHash : 'none';
    const artifactDir = typeof record.artifactDir === 'string' ? record.artifactDir : 'none';
    const backlog = typeof record.backlog === 'object' && record.backlog !== null
        ? record.backlog
        : null;
    const remainingTaskCount = typeof backlog?.remainingTaskCount === 'number' ? Math.max(0, Math.floor(backlog.remainingTaskCount)) : 0;
    const actionableTaskAvailable = Boolean(backlog?.actionableTaskAvailable);
    const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item) => typeof item === 'string') : [];
    const errors = Array.isArray(record.errors) ? record.errors.filter((item) => typeof item === 'string') : [];
    const reconciliationWarnings = Array.isArray(record.reconciliationWarnings)
        ? record.reconciliationWarnings.filter((item) => typeof item === 'string')
        : [];
    return [
        `# Ralph Iteration ${Math.floor(record.iteration)}`,
        '',
        '## Outcome',
        `- Agent ID: ${agentId}`,
        `- Provenance ID: ${typeof record.provenanceId === 'string' ? record.provenanceId : 'none'}`,
        `- Selected task: ${selectedTaskId ?? 'none'}${selectedTaskTitle ? ` - ${selectedTaskTitle}` : ''}`,
        `- Prompt kind: ${record.promptKind}`,
        `- Target mode: ${promptTarget}`,
        `- Template: ${templatePath}`,
        `- Execution: ${record.executionStatus}`,
        `- Execution message: ${executionMessage}`,
        `- Verification: ${record.verificationStatus}`,
        `- Classification: ${record.completionClassification} (selected task)`,
        `- Backlog remaining: ${remainingTaskCount}`,
        `- Next actionable task available: ${actionableTaskAvailable ? 'yes' : 'no'}`,
        `- Follow-up action: ${record.followUpAction}`,
        `- Stop reason: ${stopReason}`,
        `- Remediation: ${remediationSummary}`,
        `- Summary: ${record.summary}`,
        '',
        '## Execution Integrity',
        `- Plan: ${executionPlanPath}`,
        `- Plan hash: ${executionPlanHash}`,
        `- Prompt artifact: ${promptArtifactPath}`,
        `- Prompt hash: ${promptHash}`,
        `- Payload matched rendered artifact: ${record.executionPayloadMatched == null
            ? 'not recorded'
            : record.executionPayloadMatched ? 'yes' : 'no'}`,
        `- CLI invocation: ${cliInvocationPath}`,
        '',
        '## Validation',
        `- Task validation hint: ${taskValidationHint}`,
        `- Effective validation command: ${effectiveValidationCommand}`,
        `- Validation command normalized from: ${normalizedValidationCommandFrom}`,
        '',
        '## Artifact Paths',
        `- Prompt: ${typeof record.promptPath === 'string' ? record.promptPath : 'none'}`,
        `- Prompt evidence: ${typeof record.promptEvidencePath === 'string' ? record.promptEvidencePath : 'none'}`,
        `- Execution plan: ${executionPlanPath}`,
        `- Execution summary: ${executionSummaryPath}`,
        `- Verifier summary: ${verifierSummaryPath}`,
        `- Iteration result: ${iterationResultPath}`,
        `- Remediation proposal: ${remediationPath}`,
        `- Summary: ${summaryPath}`,
        `- Transcript: ${transcriptPath}`,
        `- Last message: ${lastMessagePath}`,
        `- Stdout: ${stdoutPath}`,
        `- Stderr: ${stderrPath}`,
        `- Diff summary: ${diffSummaryPath}`,
        `- Iteration artifact dir: ${artifactDir}`,
        '',
        '## Signals',
        `- Completion report status: ${completionReportStatus}`,
        `- Reconciliation warnings: ${reconciliationWarnings.join(' | ') || 'none'}`,
        `- Warnings: ${warnings.join(' | ') || 'none'}`,
        `- Errors: ${errors.join(' | ') || 'none'}`
    ].join('\n');
}
function latestResultFromIteration(input) {
    return {
        agentId: input.result.agentId ?? null,
        provenanceId: input.result.provenanceId ?? null,
        iteration: input.result.iteration,
        selectedTaskId: input.result.selectedTaskId,
        selectedTaskTitle: input.result.selectedTaskTitle,
        promptKind: input.result.promptKind,
        promptTarget: input.result.executionIntegrity?.promptTarget ?? null,
        rootPolicy: input.result.executionIntegrity?.rootPolicy ?? null,
        templatePath: input.result.executionIntegrity?.templatePath ?? null,
        taskValidationHint: input.result.verification.taskValidationHint,
        effectiveValidationCommand: input.result.verification.effectiveValidationCommand,
        normalizedValidationCommandFrom: input.result.verification.normalizedValidationCommandFrom,
        executionStatus: input.result.executionStatus,
        executionMessage: input.result.execution.message ?? null,
        verificationStatus: input.result.verificationStatus,
        completionClassification: input.result.completionClassification,
        backlog: input.result.backlog,
        followUpAction: input.result.followUpAction,
        stopReason: input.result.stopReason,
        remediation: input.result.remediation,
        summary: input.result.summary,
        artifactDir: input.result.artifactDir,
        summaryPath: input.paths.summaryPath,
        promptPath: input.paths.promptPath,
        promptEvidencePath: input.paths.promptEvidencePath,
        executionPlanPath: input.result.executionIntegrity?.executionPlanPath ?? input.paths.executionPlanPath,
        cliInvocationPath: input.result.executionIntegrity?.cliInvocationPath,
        promptArtifactPath: input.result.executionIntegrity?.promptArtifactPath ?? input.paths.promptPath,
        promptHash: input.result.executionIntegrity?.promptHash ?? null,
        executionPlanHash: input.result.executionIntegrity?.executionPlanHash ?? null,
        executionPayloadMatched: input.result.executionIntegrity?.executionPayloadMatched ?? null,
        transcriptPath: input.result.execution.transcriptPath ?? null,
        lastMessagePath: input.result.execution.lastMessagePath ?? null,
        executionSummaryPath: input.paths.executionSummaryPath,
        verifierSummaryPath: input.paths.verifierSummaryPath,
        iterationResultPath: input.paths.iterationResultPath,
        remediationPath: input.result.remediation ? input.paths.remediationPath : null,
        diffSummaryPath: input.diffSummary ? input.paths.diffSummaryPath : null,
        stdoutPath: input.paths.stdoutPath,
        stderrPath: input.paths.stderrPath,
        completionReportStatus: input.result.completionReportStatus ?? null,
        reconciliationWarnings: input.result.reconciliationWarnings ?? [],
        warnings: input.result.warnings,
        errors: input.result.errors
    };
}
function looksLikePreflightRecord(record) {
    return record?.kind === 'preflight'
        && typeof record.provenanceId === 'string'
        && typeof record.iteration === 'number'
        && typeof record.promptKind === 'string'
        && typeof record.promptTarget === 'string'
        && typeof record.trustLevel === 'string'
        && typeof record.ready === 'boolean'
        && typeof record.summary === 'string'
        && typeof record.artifactDir === 'string'
        && typeof record.reportPath === 'string'
        && typeof record.createdAt === 'string'
        && Array.isArray(record.diagnostics);
}
function looksLikeIntegrityFailure(record) {
    return record?.kind === 'integrityFailure'
        && typeof record.provenanceId === 'string'
        && typeof record.iteration === 'number'
        && typeof record.promptKind === 'string'
        && typeof record.promptTarget === 'string'
        && typeof record.trustLevel === 'string'
        && typeof record.stage === 'string'
        && record.blocked === true
        && typeof record.summary === 'string'
        && typeof record.message === 'string'
        && typeof record.artifactDir === 'string'
        && typeof record.createdAt === 'string';
}
function looksLikeProvenanceBundle(record) {
    return record?.kind === 'provenanceBundle'
        && typeof record.provenanceId === 'string'
        && typeof record.iteration === 'number'
        && typeof record.promptKind === 'string'
        && typeof record.promptTarget === 'string'
        && typeof record.trustLevel === 'string'
        && typeof record.status === 'string'
        && typeof record.summary === 'string'
        && typeof record.artifactDir === 'string'
        && typeof record.bundleDir === 'string'
        && typeof record.preflightReportPath === 'string'
        && typeof record.preflightSummaryPath === 'string'
        && typeof record.createdAt === 'string'
        && typeof record.updatedAt === 'string'
        && typeof record.rootPolicy === 'object'
        && record.rootPolicy !== null;
}
function provenanceIdFromRecord(record) {
    return typeof record?.provenanceId === 'string' && record.provenanceId.trim().length > 0
        ? record.provenanceId
        : null;
}
//# sourceMappingURL=artifactRendering.js.map