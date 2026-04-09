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
exports.resolveLatestStatusArtifacts = resolveLatestStatusArtifacts;
exports.buildStatusReport = buildStatusReport;
const path = __importStar(require("path"));
const fs_1 = require("../util/fs");
const rootPolicy_1 = require("./rootPolicy");
const artifactStore_1 = require("./artifactStore");
function relativeFromRoot(rootPath, target) {
    if (!target) {
        return 'none';
    }
    return (path.relative(rootPath, target) || '.').replace(/\\/g, '/');
}
function shortHash(hash) {
    if (!hash) {
        return 'none';
    }
    return hash.length > 19 ? `${hash.slice(0, 19)}...` : hash;
}
function compactList(values, limit) {
    if (values.length === 0) {
        return 'none';
    }
    const visible = values.slice(0, limit);
    const remaining = values.length - visible.length;
    return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}
function formatPromptBudgetSummary(promptEvidence) {
    const budget = promptEvidence?.promptBudget;
    if (!budget) {
        return 'none';
    }
    const budgetOutcome = budget.withinTarget
        ? `within target (${budget.budgetDeltaTokens >= 0 ? '+' : ''}${budget.budgetDeltaTokens})`
        : `over target (+${budget.budgetDeltaTokens})`;
    return `${budget.policyName} | ${budget.budgetMode} | target ${budget.targetTokens} | est ${budget.estimatedTokens} (${budget.estimatedTokenRange.min}-${budget.estimatedTokenRange.max}) | ${budgetOutcome}`;
}
function formatProvenanceTrustLevel(trustLevel) {
    if (trustLevel === 'verifiedCliExecution') {
        return 'verified CLI execution';
    }
    if (trustLevel === 'preparedPromptOnly') {
        return 'prepared prompt only';
    }
    return 'none';
}
function describeProvenanceAssurance(bundle) {
    if (!bundle) {
        return 'No persisted provenance bundle yet.';
    }
    if (bundle.trustLevel === 'verifiedCliExecution') {
        return 'CLI run with plan, prompt artifact, and stdin payload provenance verification.';
    }
    return 'Prepared prompt provenance only; later IDE execution may differ.';
}
function taskLedgerDriftSummary(snapshot) {
    const taskGraphErrors = snapshot.preflightReport.diagnostics.filter((diagnostic) => (diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'));
    if (taskGraphErrors.length === 0) {
        return 'none';
    }
    return compactList(taskGraphErrors.map((diagnostic) => diagnostic.message), 2);
}
function claimGraphSummary(snapshot) {
    return snapshot.preflightReport.activeClaimSummary ?? 'none';
}
function currentClaimHolderSummary(snapshot) {
    if (!snapshot.selectedTask) {
        return 'none';
    }
    const claimEntry = snapshot.claimGraph?.tasks.find((task) => task.taskId === snapshot.selectedTask?.id);
    if (!claimEntry?.canonicalClaim) {
        return 'none';
    }
    const canonicalClaim = claimEntry.canonicalClaim;
    const tags = [
        canonicalClaim.stale ? 'stale' : null,
        claimEntry.contested ? 'contested' : null,
        snapshot.currentProvenanceId && canonicalClaim.claim.provenanceId !== snapshot.currentProvenanceId
            ? 'different provenance'
            : null
    ].filter((value) => value !== null);
    return `${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
}
function latestClaimResolutionSummary(snapshot) {
    const resolvedClaim = snapshot.claimGraph?.latestResolvedClaim?.claim;
    if (!resolvedClaim?.resolvedAt || !resolvedClaim.resolutionReason) {
        return 'none';
    }
    return `${resolvedClaim.taskId} ${resolvedClaim.agentId}/${resolvedClaim.provenanceId} -> ${resolvedClaim.status} at ${resolvedClaim.resolvedAt} because ${resolvedClaim.resolutionReason}`;
}
async function resolveLatestStatusArtifacts(paths) {
    const repair = await (0, artifactStore_1.repairLatestArtifactSurfaces)(paths.artifactDir);
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(paths.artifactDir);
    return {
        latestSummaryPath: await (0, fs_1.pathExists)(latestPaths.latestSummaryPath) ? latestPaths.latestSummaryPath : null,
        latestResultPath: await (0, fs_1.pathExists)(latestPaths.latestResultPath) ? latestPaths.latestResultPath : null,
        latestPreflightReportPath: await (0, fs_1.pathExists)(latestPaths.latestPreflightReportPath)
            ? latestPaths.latestPreflightReportPath
            : null,
        latestPreflightSummaryPath: await (0, fs_1.pathExists)(latestPaths.latestPreflightSummaryPath)
            ? latestPaths.latestPreflightSummaryPath
            : null,
        latestPromptPath: await (0, fs_1.pathExists)(latestPaths.latestPromptPath) ? latestPaths.latestPromptPath : null,
        latestPromptEvidencePath: await (0, fs_1.pathExists)(latestPaths.latestPromptEvidencePath)
            ? latestPaths.latestPromptEvidencePath
            : null,
        latestExecutionPlanPath: await (0, fs_1.pathExists)(latestPaths.latestExecutionPlanPath)
            ? latestPaths.latestExecutionPlanPath
            : null,
        latestCliInvocationPath: await (0, fs_1.pathExists)(latestPaths.latestCliInvocationPath)
            ? latestPaths.latestCliInvocationPath
            : null,
        latestRemediationPath: await (0, fs_1.pathExists)(latestPaths.latestRemediationPath)
            ? latestPaths.latestRemediationPath
            : null,
        latestProvenanceBundlePath: await (0, fs_1.pathExists)(latestPaths.latestProvenanceBundlePath)
            ? latestPaths.latestProvenanceBundlePath
            : null,
        latestProvenanceSummaryPath: await (0, fs_1.pathExists)(latestPaths.latestProvenanceSummaryPath)
            ? latestPaths.latestProvenanceSummaryPath
            : null,
        latestProvenanceFailurePath: await (0, fs_1.pathExists)(latestPaths.latestProvenanceFailurePath)
            ? latestPaths.latestProvenanceFailurePath
            : null,
        repair
    };
}
function summarizeRetentionNames(names, protectedNames, limit) {
    if (names.length === 0) {
        return 'none';
    }
    const protectedSet = new Set(protectedNames);
    const labeled = names.map((name) => protectedSet.has(name) ? `${name} (protected)` : name);
    return compactList(labeled, limit);
}
function formatRecentIteration(entry) {
    const taskLabel = entry.selectedTaskId
        ? `${entry.selectedTaskId}${entry.selectedTaskTitle ? ` - ${entry.selectedTaskTitle}` : ''}`
        : 'none';
    return `- #${entry.iteration}: ${taskLabel} | ${entry.executionStatus} / ${entry.verificationStatus} / ${entry.completionClassification}${entry.stopReason ? ` | stop ${entry.stopReason}` : ''}`;
}
function formatRecentRun(entry) {
    return `- #${entry.iteration}: ${entry.mode} ${entry.promptKind} | ${entry.status} | exit ${entry.exitCode ?? 'none'}`;
}
function buildStatusReport(snapshot) {
    const renderDiagnostic = (diagnostic) => `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
    const lastIteration = snapshot.lastIteration;
    const verifierSummaries = lastIteration?.verification.verifiers.map((verifier) => {
        const location = verifier.artifactPath ? ` (${relativeFromRoot(snapshot.rootPath, verifier.artifactPath)})` : '';
        return `- ${verifier.verifier}: ${verifier.status} - ${verifier.summary}${location}`;
    }) ?? [];
    const gitEntryLines = snapshot.gitStatus.entries.slice(0, 10).map((entry) => `- ${entry.status} ${entry.path}`);
    const preflightTaskGraph = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'taskGraph');
    const preflightClaimGraph = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'claimGraph');
    const preflightWorkspace = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'workspaceRuntime');
    const preflightAdapter = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'codexAdapter');
    const preflightVerifier = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'validationVerifier');
    const preflightAgentHealth = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'agentHealth');
    const latestPlan = snapshot.latestExecutionPlan;
    const latestPromptEvidence = snapshot.latestPromptEvidence;
    const latestRemediation = snapshot.latestRemediation ?? (lastIteration?.remediation
        ? {
            trigger: lastIteration.remediation.trigger,
            attemptCount: lastIteration.remediation.attemptCount,
            action: lastIteration.remediation.action,
            humanReviewRecommended: lastIteration.remediation.humanReviewRecommended,
            summary: lastIteration.remediation.summary,
            evidence: lastIteration.remediation.evidence,
            suggestedChildTasks: []
        }
        : null);
    const latestProvenance = snapshot.latestProvenanceBundle;
    const lastIntegrity = lastIteration?.executionIntegrity;
    const currentRootPolicy = latestPlan?.rootPolicy ?? (0, rootPolicy_1.deriveRootPolicy)(snapshot.workspaceScan);
    const lastRootPolicy = lastIntegrity?.rootPolicy ?? snapshot.latestCliInvocation?.rootPolicy ?? null;
    const lastTaskLabel = lastIteration?.selectedTaskId
        ? `${lastIteration.selectedTaskId}${lastIteration.selectedTaskTitle ? ` - ${lastIteration.selectedTaskTitle}` : ''}`
        : 'none';
    const lastPromptLabel = lastIteration
        ? `${lastIteration.promptKind} (${lastIntegrity?.promptTarget ?? 'unknown'})`
        : 'none';
    const payloadMatched = lastIntegrity?.executionPayloadMatched === null || lastIntegrity?.executionPayloadMatched === undefined
        ? 'not recorded'
        : lastIntegrity.executionPayloadMatched ? 'yes' : 'no';
    const currentReasoningEffort = snapshot.latestCliInvocation?.reasoningEffort ?? 'n/a';
    const lastReasoningEffort = lastIntegrity?.reasoningEffort ?? 'unknown';
    const scan = snapshot.workspaceScan;
    const recentIterations = snapshot.iterationHistory.slice(-3).reverse().map(formatRecentIteration);
    const recentRuns = snapshot.runHistory.slice(-3).reverse().map(formatRecentRun);
    return [
        `# Ralph Status: ${snapshot.workspaceName}`,
        '',
        '## Loop',
        `- Workspace trusted: ${snapshot.workspaceTrusted ? 'yes' : 'no'}`,
        `- Configured agent count: ${snapshot.agentCount}${snapshot.agentCount > 1 ? ` (parallel mode)` : ' (single-agent)'}`,
        `- Next iteration: ${snapshot.nextIteration}`,
        `- Current task: ${snapshot.selectedTask ? `${snapshot.selectedTask.id} - ${snapshot.selectedTask.title}` : 'none'}`,
        `- Current prompt kind: ${latestPlan?.promptKind ?? 'none'}`,
        `- Current target mode: ${latestPlan?.promptTarget ?? 'none'}`,
        `- Current template: ${relativeFromRoot(snapshot.rootPath, latestPlan?.templatePath ?? null)}`,
        `- Current prompt artifact: ${relativeFromRoot(snapshot.rootPath, latestPlan?.promptArtifactPath ?? null)}`,
        `- Current prompt hash: ${shortHash(latestPlan?.promptHash)}`,
        `- Current prompt bytes: ${latestPlan?.promptByteLength ?? latestPromptEvidence?.promptByteLength ?? 'none'}`,
        `- Current prompt budget: ${formatPromptBudgetSummary(latestPromptEvidence)}`,
        `- Current prompt minimum-context bias: ${latestPromptEvidence?.promptBudget?.minimumContextBias ?? 'none'}`,
        `- Current prompt required sections: ${compactList(latestPromptEvidence?.promptBudget?.requiredSections ?? [], 6)}`,
        `- Current prompt optional sections: ${compactList(latestPromptEvidence?.promptBudget?.optionalSections ?? [], 6)}`,
        `- Current prompt omission order: ${compactList(latestPromptEvidence?.promptBudget?.omissionOrder ?? [], 6)}`,
        `- Current prompt selected sections: ${compactList(latestPromptEvidence?.promptBudget?.selectedSections ?? [], 6)}`,
        `- Current prompt omitted sections: ${compactList(latestPromptEvidence?.promptBudget?.omittedSections ?? [], 6)}`,
        `- Current reasoning effort: ${currentReasoningEffort}`,
        `- Task validation hint: ${latestPlan?.taskValidationHint ?? 'none'}`,
        `- Effective validation command: ${latestPlan?.effectiveValidationCommand ?? 'none'}`,
        `- Validation normalized from: ${latestPlan?.normalizedValidationCommandFrom ?? 'none'}`,
        `- Current provenance ID: ${snapshot.currentProvenanceId ?? 'none'}`,
        `- Claim holder for current task: ${currentClaimHolderSummary(snapshot)}`,
        '- Claim lifecycle: CLI iterations acquire and release durable active claims for the selected task; Prepare Prompt and Open Codex IDE do not create blocking claims.',
        '- Claim recovery: Use Ralph Codex: Resolve Stale Task Claim when Show Status reports a stale canonical holder and no codex exec process is active.',
        `- Latest claim resolution: ${latestClaimResolutionSummary(snapshot)}`,
        `- Task counts: ${snapshot.taskCounts
            ? `todo ${snapshot.taskCounts.todo}, in_progress ${snapshot.taskCounts.in_progress}, blocked ${snapshot.taskCounts.blocked}, done ${snapshot.taskCounts.done}`
            : 'unavailable'}`,
        `- Task file error: ${snapshot.taskFileError ?? 'none'}`,
        `- Task-ledger drift: ${taskLedgerDriftSummary(snapshot)}`,
        `- Claim state: ${claimGraphSummary(snapshot)}`,
        '',
        '## Preflight',
        `- Ready: ${snapshot.preflightReport.ready ? 'yes' : 'no'}`,
        `- Summary: ${snapshot.preflightReport.summary}`,
        `- Active claim state: ${snapshot.preflightReport.activeClaimSummary ?? 'none'}`,
        '',
        '### Task Graph',
        preflightTaskGraph.length > 0 ? preflightTaskGraph.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '### Claim Graph',
        preflightClaimGraph.length > 0 ? preflightClaimGraph.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '### Workspace/Runtime',
        preflightWorkspace.length > 0 ? preflightWorkspace.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '### Codex Adapter',
        preflightAdapter.length > 0 ? preflightAdapter.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '### Validation/Verifier',
        preflightVerifier.length > 0 ? preflightVerifier.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '### Agent Health',
        preflightAgentHealth.length > 0 ? preflightAgentHealth.map(renderDiagnostic).join('\n') : '- ok',
        '',
        '## Repo Context',
        `- Workspace root: ${relativeFromRoot(snapshot.rootPath, currentRootPolicy.workspaceRootPath)}`,
        `- Inspected root: ${relativeFromRoot(snapshot.rootPath, currentRootPolicy.inspectionRootPath)}`,
        `- Execution root: ${relativeFromRoot(snapshot.rootPath, currentRootPolicy.executionRootPath)}`,
        `- Verifier root: ${relativeFromRoot(snapshot.rootPath, currentRootPolicy.verificationRootPath)}`,
        `- Inspection override: ${formatInspectionRootOverride(snapshot.rootPath, scan.rootSelection.override)}`,
        `- Root selection: ${scan.rootSelection.summary}`,
        `- Root policy: ${currentRootPolicy.policySummary}`,
        `- Manifests: ${compactList(scan.manifests, 5)}`,
        `- Source roots: ${compactList(scan.sourceRoots, 5)}`,
        `- Test roots: ${compactList(scan.tests, 5)}`,
        `- Docs: ${compactList(scan.docs, 5)}`,
        `- Package managers: ${compactList(scan.packageManagers, 4)}`,
        `- Package manager indicators: ${compactList(scan.packageManagerIndicators, 5)}`,
        `- Validation commands: ${compactList(scan.validationCommands, 5)}`,
        `- Lifecycle commands: ${compactList(scan.lifecycleCommands, 5)}`,
        `- CI files: ${compactList(scan.ciFiles, 4)}`,
        `- CI commands: ${compactList(scan.ciCommands, 4)}`,
        `- Test signals: ${compactList(scan.testSignals, 4)}`,
        `- Latest prompt evidence: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptEvidencePath)}`,
        '',
        '## Provenance',
        `- Trust level: ${formatProvenanceTrustLevel(latestProvenance?.trustLevel)}`,
        `- Assurance: ${describeProvenanceAssurance(latestProvenance)}`,
        `- Bundle status: ${latestProvenance?.status ?? 'none'}`,
        `- Bundle summary: ${latestProvenance?.summary ?? 'none'}`,
        `- Bundle path: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundlePath)}`,
        `- Bundle summary path: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceSummaryPath)}`,
        `- Bundle directory: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundle?.bundleDir ?? null)}`,
        `- Latest provenance failure: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceFailurePath)}`,
        `- Generated artifact retention on write: ${snapshot.generatedArtifactRetentionCount <= 0
            ? 'disabled'
            : `keep newest ${snapshot.generatedArtifactRetentionCount} prompts, runs, and iterations first; then add older protected references without evicting them`}`,
        `- Generated artifacts currently retained: iterations ${snapshot.generatedArtifactRetention.retainedIterationDirectories.length}, prompts ${snapshot.generatedArtifactRetention.retainedPromptFiles.length}, runs ${snapshot.generatedArtifactRetention.retainedRunArtifactBaseNames.length}`,
        `- Generated iteration directories: ${summarizeRetentionNames(snapshot.generatedArtifactRetention.retainedIterationDirectories, snapshot.generatedArtifactRetention.protectedRetainedIterationDirectories, 4)}`,
        `- Generated prompt files: ${summarizeRetentionNames(snapshot.generatedArtifactRetention.retainedPromptFiles, snapshot.generatedArtifactRetention.protectedRetainedPromptFiles, 4)}`,
        `- Generated run artifacts: ${summarizeRetentionNames(snapshot.generatedArtifactRetention.retainedRunArtifactBaseNames, snapshot.generatedArtifactRetention.protectedRetainedRunArtifactBaseNames, 4)}`,
        `- Bundle retention on write: ${snapshot.provenanceBundleRetentionCount <= 0
            ? 'disabled'
            : `keep newest ${snapshot.provenanceBundleRetentionCount} bundles first; then add older protected references without evicting them`}`,
        `- Provenance bundles currently retained: ${summarizeRetentionNames(snapshot.provenanceBundleRetention.retainedBundleIds, snapshot.provenanceBundleRetention.protectedBundleIds, 4)}`,
        '',
        '## Latest Pipeline',
        `- Run ID: ${snapshot.latestPipelineRun?.runId ?? 'none'}`,
        `- Status: ${snapshot.latestPipelineRun?.status ?? 'none'}`,
        `- Root task: ${snapshot.latestPipelineRun?.rootTaskId ?? 'none'}`,
        `- Child tasks: ${snapshot.latestPipelineRun ? snapshot.latestPipelineRun.decomposedTaskIds.length : 'none'}`,
        `- PR URL: ${snapshot.latestPipelineRun?.prUrl ?? 'none'}`,
        `- Artifact: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPipelineRunPath)}`,
        '- Direct command: Ralph Codex: Open Latest Pipeline Run',
        ...(snapshot.recommendedSkills.length > 0
            ? [
                '',
                '## Recommended Skills',
                ...snapshot.recommendedSkills.map((skill) => `- ${skill.name}: ${skill.rationale}`)
            ]
            : []),
        '',
        '## Latest Iteration',
        `- Last task: ${lastTaskLabel}`,
        `- Last prompt: ${lastPromptLabel}`,
        `- Last template: ${relativeFromRoot(snapshot.rootPath, lastIntegrity?.templatePath ?? null)}`,
        `- Last execution root: ${relativeFromRoot(snapshot.rootPath, lastRootPolicy?.executionRootPath ?? null)}`,
        `- Last verifier root: ${relativeFromRoot(snapshot.rootPath, lastRootPolicy?.verificationRootPath ?? null)}`,
        `- Last prompt bytes: ${lastIntegrity?.promptByteLength ?? 'none'}`,
        `- Last reasoning effort: ${lastReasoningEffort}`,
        `- Payload matched rendered artifact: ${payloadMatched}`,
        `- Outcome: ${lastIteration ? `${lastIteration.completionClassification} (selected task)` : 'none'}`,
        `- Backlog remaining: ${lastIteration ? lastIteration.backlog.remainingTaskCount : 'none'}`,
        `- Next actionable task available: ${lastIteration ? (lastIteration.backlog.actionableTaskAvailable ? 'yes' : 'no') : 'none'}`,
        `- Execution: ${lastIteration?.executionStatus ?? 'none'}`,
        `- Execution message: ${lastIteration?.execution.message ?? lastIteration?.errors[0] ?? 'none'}`,
        `- Verification: ${lastIteration?.verificationStatus ?? 'none'}`,
        `- Completion report status: ${lastIteration?.completionReportStatus ?? 'none'}`,
        `- Reconciliation warnings: ${lastIteration?.reconciliationWarnings?.join(' | ') || 'none'}`,
        `- Stop reason: ${lastIteration?.stopReason ?? 'none'}`,
        `- Remediation: ${latestRemediation?.summary ?? 'none'}`,
        `- Remediation action: ${latestRemediation?.action ?? 'none'}`,
        `- Remediation attempts: ${latestRemediation?.attemptCount ?? 'none'}`,
        `- Remediation human review: ${latestRemediation === null ? 'none' : latestRemediation.humanReviewRecommended ? 'yes' : 'no'}`,
        `- Remediation artifact: ${relativeFromRoot(snapshot.rootPath, snapshot.latestRemediationPath)}`,
        `- Remediation proposed child tasks: ${latestRemediation?.suggestedChildTasks?.length ?? 0}`,
        ...(latestRemediation?.suggestedChildTasks ?? []).map((task) => `- Proposed child ${task.id}: ${task.title} | depends on ${task.dependsOn.length > 0 ? task.dependsOn.map((dependency) => dependency.taskId).join(', ') : 'none'}`),
        `- Summary: ${lastIteration?.summary ?? 'No recorded iteration.'}`,
        `- Prompt: ${relativeFromRoot(snapshot.rootPath, snapshot.promptPath)}`,
        '',
        '## Recent History',
        `- Iteration history entries: ${snapshot.iterationHistory.length}`,
        recentIterations.length > 0 ? recentIterations.join('\n') : '- No recorded iterations yet.',
        `- Run history entries: ${snapshot.runHistory.length}`,
        recentRuns.length > 0 ? recentRuns.join('\n') : '- No recorded runs yet.',
        '',
        '## Verifiers',
        `- Enabled: ${snapshot.verifierModes.join(', ') || 'none'}`,
        `- Validation override: ${snapshot.validationCommandOverride ?? 'none'}`,
        `- Last task validation hint: ${lastIteration?.verification.taskValidationHint ?? 'none'}`,
        `- Last effective validation command: ${lastIteration?.verification.effectiveValidationCommand ?? 'none'}`,
        `- Last validation normalized from: ${lastIteration?.verification.normalizedValidationCommandFrom ?? 'none'}`,
        verifierSummaries.length > 0 ? verifierSummaries.join('\n') : '- none',
        '',
        '## Artifacts',
        `- Artifact root: ${relativeFromRoot(snapshot.rootPath, snapshot.artifactDir)}`,
        `- Latest summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestSummaryPath)}`,
        `- Latest result/report: ${relativeFromRoot(snapshot.rootPath, snapshot.latestResultPath)}`,
        `- Latest preflight report: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPreflightReportPath)}`,
        `- Latest preflight summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPreflightSummaryPath)}`,
        `- Latest prompt: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptPath)}`,
        `- Latest prompt evidence: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptEvidencePath)}`,
        `- Latest execution plan: ${relativeFromRoot(snapshot.rootPath, snapshot.latestExecutionPlanPath)}`,
        `- Latest CLI invocation: ${relativeFromRoot(snapshot.rootPath, snapshot.latestCliInvocationPath)}`,
        `- Latest remediation proposal: ${relativeFromRoot(snapshot.rootPath, snapshot.latestRemediationPath)}`,
        `- Latest provenance bundle: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundlePath)}`,
        `- Latest provenance summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceSummaryPath)}`,
        `- Latest provenance failure: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceFailurePath)}`,
        `- Latest artifact repairs this status run: ${compactList(snapshot.latestArtifactRepair.repairedLatestArtifactPaths.map((target) => relativeFromRoot(snapshot.rootPath, target)), 4)}`,
        `- Latest artifact paths still stale: ${compactList(snapshot.latestArtifactRepair.staleLatestArtifactPaths.map((target) => relativeFromRoot(snapshot.rootPath, target)), 4)}`,
        '- Direct command: Ralph Codex: Open Latest Ralph Summary',
        '- Direct command: Ralph Codex: Open Latest Provenance Bundle',
        '- Direct command: Ralph Codex: Reveal Latest Provenance Bundle Directory',
        `- State file: ${relativeFromRoot(snapshot.rootPath, snapshot.stateFilePath)}`,
        `- Progress file: ${relativeFromRoot(snapshot.rootPath, snapshot.progressPath)}`,
        `- Task file: ${relativeFromRoot(snapshot.rootPath, snapshot.taskFilePath)}`,
        '',
        '## Git',
        `- Checkpoint mode: ${snapshot.gitCheckpointMode}`,
        `- Repository detected: ${snapshot.gitStatus.available ? 'yes' : 'no'}`,
        `- Working tree changes: ${snapshot.gitStatus.entries.length}`,
        gitEntryLines.length > 0 ? gitEntryLines.join('\n') : '- working tree clean or git unavailable'
    ].join('\n');
}
function formatInspectionRootOverride(rootPath, override) {
    if (!override) {
        return 'none';
    }
    const location = relativeFromRoot(rootPath, override.resolvedPath);
    return `${override.requestedPath} (${override.status}${location !== 'none' ? `: ${location}` : ''})`;
}
//# sourceMappingURL=statusReport.js.map