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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const artifactStore_1 = require("./artifactStore");
async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
function relativeFromRoot(rootPath, target) {
    if (!target) {
        return 'none';
    }
    return path.relative(rootPath, target) || '.';
}
function shortHash(hash) {
    if (!hash) {
        return 'none';
    }
    return hash.length > 19 ? `${hash.slice(0, 19)}...` : hash;
}
async function resolveLatestStatusArtifacts(paths) {
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(paths.artifactDir);
    return {
        latestSummaryPath: await pathExists(latestPaths.latestSummaryPath) ? latestPaths.latestSummaryPath : null,
        latestResultPath: await pathExists(latestPaths.latestResultPath) ? latestPaths.latestResultPath : null,
        latestPreflightReportPath: await pathExists(latestPaths.latestPreflightReportPath)
            ? latestPaths.latestPreflightReportPath
            : null,
        latestPreflightSummaryPath: await pathExists(latestPaths.latestPreflightSummaryPath)
            ? latestPaths.latestPreflightSummaryPath
            : null,
        latestPromptPath: await pathExists(latestPaths.latestPromptPath) ? latestPaths.latestPromptPath : null,
        latestPromptEvidencePath: await pathExists(latestPaths.latestPromptEvidencePath)
            ? latestPaths.latestPromptEvidencePath
            : null,
        latestExecutionPlanPath: await pathExists(latestPaths.latestExecutionPlanPath)
            ? latestPaths.latestExecutionPlanPath
            : null,
        latestCliInvocationPath: await pathExists(latestPaths.latestCliInvocationPath)
            ? latestPaths.latestCliInvocationPath
            : null
    };
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
    const preflightWorkspace = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'workspaceRuntime');
    const preflightAdapter = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'codexAdapter');
    const preflightVerifier = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'validationVerifier');
    const latestPlan = snapshot.latestExecutionPlan;
    const lastIntegrity = lastIteration?.executionIntegrity;
    const lastTaskLabel = lastIteration?.selectedTaskId
        ? `${lastIteration.selectedTaskId}${lastIteration.selectedTaskTitle ? ` - ${lastIteration.selectedTaskTitle}` : ''}`
        : 'none';
    const lastPromptLabel = lastIteration
        ? `${lastIteration.promptKind} (${lastIntegrity?.promptTarget ?? 'unknown'})`
        : 'none';
    const payloadMatched = lastIntegrity?.executionPayloadMatched === null || lastIntegrity?.executionPayloadMatched === undefined
        ? 'not recorded'
        : lastIntegrity.executionPayloadMatched ? 'yes' : 'no';
    return [
        `# Ralph Status: ${snapshot.workspaceName}`,
        '',
        '## Loop',
        `- Workspace trusted: ${snapshot.workspaceTrusted ? 'yes' : 'no'}`,
        `- Next iteration: ${snapshot.nextIteration}`,
        `- Current task: ${snapshot.selectedTask ? `${snapshot.selectedTask.id} - ${snapshot.selectedTask.title}` : 'none'}`,
        `- Current prompt kind: ${latestPlan?.promptKind ?? 'none'}`,
        `- Current target mode: ${latestPlan?.promptTarget ?? 'none'}`,
        `- Current template: ${relativeFromRoot(snapshot.rootPath, latestPlan?.templatePath ?? null)}`,
        `- Current prompt artifact: ${relativeFromRoot(snapshot.rootPath, latestPlan?.promptArtifactPath ?? null)}`,
        `- Current prompt hash: ${shortHash(latestPlan?.promptHash)}`,
        `- Task counts: ${snapshot.taskCounts
            ? `todo ${snapshot.taskCounts.todo}, in_progress ${snapshot.taskCounts.in_progress}, blocked ${snapshot.taskCounts.blocked}, done ${snapshot.taskCounts.done}`
            : 'unavailable'}`,
        `- Task file error: ${snapshot.taskFileError ?? 'none'}`,
        '',
        '## Preflight',
        `- Ready: ${snapshot.preflightReport.ready ? 'yes' : 'no'}`,
        `- Summary: ${snapshot.preflightReport.summary}`,
        '',
        '### Task Graph',
        preflightTaskGraph.length > 0 ? preflightTaskGraph.map(renderDiagnostic).join('\n') : '- ok',
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
        '## Latest Iteration',
        `- Last task: ${lastTaskLabel}`,
        `- Last prompt: ${lastPromptLabel}`,
        `- Last template: ${relativeFromRoot(snapshot.rootPath, lastIntegrity?.templatePath ?? null)}`,
        `- Payload matched rendered artifact: ${payloadMatched}`,
        `- Outcome: ${lastIteration ? `${lastIteration.completionClassification} (selected task)` : 'none'}`,
        `- Backlog remaining: ${lastIteration ? lastIteration.backlog.remainingTaskCount : 'none'}`,
        `- Next actionable task available: ${lastIteration ? (lastIteration.backlog.actionableTaskAvailable ? 'yes' : 'no') : 'none'}`,
        `- Execution: ${lastIteration?.executionStatus ?? 'none'}`,
        `- Verification: ${lastIteration?.verificationStatus ?? 'none'}`,
        `- Stop reason: ${lastIteration?.stopReason ?? 'none'}`,
        `- Summary: ${lastIteration?.summary ?? 'No recorded iteration.'}`,
        `- Prompt: ${relativeFromRoot(snapshot.rootPath, snapshot.promptPath)}`,
        '',
        '## Verifiers',
        `- Enabled: ${snapshot.verifierModes.join(', ') || 'none'}`,
        `- Validation override: ${snapshot.validationCommandOverride ?? 'none'}`,
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
        '- Direct command: Ralph Codex: Open Latest Ralph Summary',
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
//# sourceMappingURL=statusReport.js.map