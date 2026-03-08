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
exports.resolveIterationArtifactPaths = resolveIterationArtifactPaths;
exports.resolveProvenanceBundlePaths = resolveProvenanceBundlePaths;
exports.resolveLatestArtifactPaths = resolveLatestArtifactPaths;
exports.resolvePreflightArtifactPaths = resolvePreflightArtifactPaths;
exports.ensureIterationArtifactDirectory = ensureIterationArtifactDirectory;
exports.cleanupProvenanceBundles = cleanupProvenanceBundles;
exports.writePromptArtifacts = writePromptArtifacts;
exports.writeExecutionPlanArtifact = writeExecutionPlanArtifact;
exports.writeCliInvocationArtifact = writeCliInvocationArtifact;
exports.writePreflightArtifacts = writePreflightArtifacts;
exports.writeIterationArtifacts = writeIterationArtifacts;
exports.writeProvenanceBundle = writeProvenanceBundle;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
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
        `- Execution summary: ${paths.executionSummaryPath}`,
        `- Verifier summary: ${paths.verifierSummaryPath}`,
        `- Iteration result: ${paths.iterationResultPath}`,
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
    return [
        `# Ralph Preflight ${report.iteration}`,
        '',
        `- Provenance ID: ${report.provenanceId}`,
        `- Trust level: ${formatTrustLevel(report.trustLevel)}`,
        `- Ready: ${report.ready ? 'yes' : 'no'}`,
        `- Prompt kind: ${report.promptKind}`,
        `- Prompt target: ${report.promptTarget}`,
        `- Selected task: ${formatOptional(report.selectedTaskId)}${report.selectedTaskTitle ? ` - ${report.selectedTaskTitle}` : ''}`,
        `- Validation: ${formatOptional(report.validationCommand)}`,
        `- Summary: ${report.summary}`,
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
        `- Provenance ID: ${formatOptional(result.provenanceId)}`,
        `- Selected task: ${formatOptional(result.selectedTaskId)}${result.selectedTaskTitle ? ` - ${result.selectedTaskTitle}` : ''}`,
        `- Prompt kind: ${result.promptKind}`,
        `- Target mode: ${result.executionIntegrity?.promptTarget ?? 'unknown'}`,
        `- Template: ${result.executionIntegrity?.templatePath ?? 'unknown'}`,
        `- Execution: ${result.executionStatus}`,
        `- Execution message: ${result.execution.message ?? 'none'}`,
        `- Verification: ${result.verificationStatus}`,
        `- Classification: ${result.completionClassification} (selected task)`,
        `- Backlog remaining: ${result.backlog.remainingTaskCount}`,
        `- Next actionable task available: ${result.backlog.actionableTaskAvailable ? 'yes' : 'no'}`,
        `- Follow-up action: ${result.followUpAction}`,
        `- Stop reason: ${formatOptional(result.stopReason)}`,
        `- Summary: ${result.summary}`,
        '',
        '## Execution Integrity',
        `- Plan: ${result.executionIntegrity?.executionPlanPath ?? 'none'}`,
        `- Plan hash: ${result.executionIntegrity?.executionPlanHash ?? 'none'}`,
        `- Prompt artifact: ${result.executionIntegrity?.promptArtifactPath ?? 'none'}`,
        `- Prompt hash: ${result.executionIntegrity?.promptHash ?? 'none'}`,
        `- Payload matched rendered artifact: ${result.executionIntegrity?.executionPayloadMatched == null
            ? 'not executed'
            : result.executionIntegrity.executionPayloadMatched ? 'yes' : 'no'}`,
        `- CLI invocation: ${result.executionIntegrity?.cliInvocationPath ?? 'none'}`,
        `- Integrity issue: ${result.executionIntegrity?.mismatchReason ?? 'none'}`,
        '',
        '## Validation',
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
    return [
        `# Ralph Provenance ${bundle.provenanceId}`,
        '',
        `- Iteration: ${bundle.iteration}`,
        `- Status: ${bundle.status}`,
        `- Trust level: ${formatTrustLevel(bundle.trustLevel)}`,
        `- Prompt kind: ${bundle.promptKind}`,
        `- Prompt target: ${bundle.promptTarget}`,
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
        `- Provenance failure: ${bundle.provenanceFailurePath ?? 'none'}`,
        '',
        '## Canonical Iteration Artifacts',
        `- Iteration artifact dir: ${bundle.artifactDir}`
    ].join('\n');
}
function latestResultFromIteration(input) {
    return {
        provenanceId: input.result.provenanceId ?? null,
        iteration: input.result.iteration,
        selectedTaskId: input.result.selectedTaskId,
        selectedTaskTitle: input.result.selectedTaskTitle,
        promptKind: input.result.promptKind,
        promptTarget: input.result.executionIntegrity?.promptTarget ?? null,
        templatePath: input.result.executionIntegrity?.templatePath ?? null,
        executionStatus: input.result.executionStatus,
        executionMessage: input.result.execution.message ?? null,
        verificationStatus: input.result.verificationStatus,
        completionClassification: input.result.completionClassification,
        backlog: input.result.backlog,
        followUpAction: input.result.followUpAction,
        stopReason: input.result.stopReason,
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
        executionSummaryPath: input.paths.executionSummaryPath,
        verifierSummaryPath: input.paths.verifierSummaryPath,
        iterationResultPath: input.paths.iterationResultPath,
        diffSummaryPath: input.diffSummary ? input.paths.diffSummaryPath : null,
        stdoutPath: input.paths.stdoutPath,
        stderrPath: input.paths.stderrPath,
        warnings: input.result.warnings,
        errors: input.result.errors
    };
}
function resolveIterationArtifactPaths(artifactRootDir, iteration) {
    const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
    return {
        directory,
        promptPath: path.join(directory, 'prompt.md'),
        promptEvidencePath: path.join(directory, 'prompt-evidence.json'),
        executionPlanPath: path.join(directory, 'execution-plan.json'),
        cliInvocationPath: path.join(directory, 'cli-invocation.json'),
        stdoutPath: path.join(directory, 'stdout.log'),
        stderrPath: path.join(directory, 'stderr.log'),
        executionSummaryPath: path.join(directory, 'execution-summary.json'),
        verifierSummaryPath: path.join(directory, 'verifier-summary.json'),
        diffSummaryPath: path.join(directory, 'diff-summary.json'),
        iterationResultPath: path.join(directory, 'iteration-result.json'),
        summaryPath: path.join(directory, 'summary.md'),
        gitStatusBeforePath: path.join(directory, 'git-status-before.txt'),
        gitStatusAfterPath: path.join(directory, 'git-status-after.txt')
    };
}
function resolveProvenanceBundlePaths(artifactRootDir, provenanceId) {
    const directory = path.join(artifactRootDir, 'runs', provenanceId);
    return {
        directory,
        bundlePath: path.join(directory, 'provenance-bundle.json'),
        summaryPath: path.join(directory, 'summary.md'),
        preflightReportPath: path.join(directory, 'preflight-report.json'),
        preflightSummaryPath: path.join(directory, 'preflight-summary.md'),
        promptPath: path.join(directory, 'prompt.md'),
        promptEvidencePath: path.join(directory, 'prompt-evidence.json'),
        executionPlanPath: path.join(directory, 'execution-plan.json'),
        cliInvocationPath: path.join(directory, 'cli-invocation.json'),
        iterationResultPath: path.join(directory, 'iteration-result.json'),
        provenanceFailurePath: path.join(directory, 'provenance-failure.json'),
        provenanceFailureSummaryPath: path.join(directory, 'provenance-failure-summary.md')
    };
}
function resolveLatestArtifactPaths(artifactRootDir) {
    return {
        latestResultPath: path.join(artifactRootDir, 'latest-result.json'),
        latestSummaryPath: path.join(artifactRootDir, 'latest-summary.md'),
        latestPreflightReportPath: path.join(artifactRootDir, 'latest-preflight-report.json'),
        latestPreflightSummaryPath: path.join(artifactRootDir, 'latest-preflight-summary.md'),
        latestPromptPath: path.join(artifactRootDir, 'latest-prompt.md'),
        latestPromptEvidencePath: path.join(artifactRootDir, 'latest-prompt-evidence.json'),
        latestExecutionPlanPath: path.join(artifactRootDir, 'latest-execution-plan.json'),
        latestCliInvocationPath: path.join(artifactRootDir, 'latest-cli-invocation.json'),
        latestProvenanceBundlePath: path.join(artifactRootDir, 'latest-provenance-bundle.json'),
        latestProvenanceSummaryPath: path.join(artifactRootDir, 'latest-provenance-summary.md'),
        latestProvenanceFailurePath: path.join(artifactRootDir, 'latest-provenance-failure.json')
    };
}
function resolvePreflightArtifactPaths(artifactRootDir, iteration) {
    const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
    return {
        directory,
        reportPath: path.join(directory, 'preflight-report.json'),
        summaryPath: path.join(directory, 'preflight-summary.md')
    };
}
async function ensureIterationArtifactDirectory(paths) {
    await fs.mkdir(paths.directory, { recursive: true });
}
async function ensureProvenanceBundleDirectory(paths) {
    await fs.mkdir(paths.directory, { recursive: true });
}
async function readJsonRecord(target) {
    try {
        const raw = await fs.readFile(target, 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
    }
    catch {
        return null;
    }
}
function provenanceIdFromRecord(record) {
    return typeof record?.provenanceId === 'string' && record.provenanceId.trim().length > 0
        ? record.provenanceId
        : null;
}
async function resolveProtectedBundleIds(artifactRootDir) {
    const latestPaths = resolveLatestArtifactPaths(artifactRootDir);
    const records = await Promise.all([
        readJsonRecord(latestPaths.latestResultPath),
        readJsonRecord(latestPaths.latestPreflightReportPath),
        readJsonRecord(latestPaths.latestPromptEvidencePath),
        readJsonRecord(latestPaths.latestExecutionPlanPath),
        readJsonRecord(latestPaths.latestCliInvocationPath),
        readJsonRecord(latestPaths.latestProvenanceBundlePath),
        readJsonRecord(latestPaths.latestProvenanceFailurePath)
    ]);
    return new Set(records
        .map((record) => provenanceIdFromRecord(record))
        .filter((value) => Boolean(value)));
}
async function cleanupProvenanceBundles(input) {
    const runsDir = path.join(input.artifactRootDir, 'runs');
    if (input.retentionCount <= 0) {
        return {
            deletedBundleIds: [],
            retainedBundleIds: [],
            protectedBundleIds: []
        };
    }
    const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
    const bundleIds = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left));
    const protectedIds = await resolveProtectedBundleIds(input.artifactRootDir);
    const retainedIds = new Set(bundleIds.slice(0, input.retentionCount));
    protectedIds.forEach((bundleId) => retainedIds.add(bundleId));
    const deletedBundleIds = [];
    for (const bundleId of bundleIds.slice(input.retentionCount)) {
        if (retainedIds.has(bundleId)) {
            continue;
        }
        await fs.rm(path.join(runsDir, bundleId), { recursive: true, force: true });
        deletedBundleIds.push(bundleId);
    }
    return {
        deletedBundleIds,
        retainedBundleIds: bundleIds.filter((bundleId) => retainedIds.has(bundleId)),
        protectedBundleIds: Array.from(protectedIds).sort()
    };
}
async function writePromptArtifacts(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.promptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8'),
        fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8')
    ]);
    return latestPaths;
}
async function writeExecutionPlanArtifact(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.executionPlanPath, (0, integrity_1.stableJson)(input.plan), 'utf8'),
        fs.writeFile(latestPaths.latestExecutionPlanPath, (0, integrity_1.stableJson)(input.plan), 'utf8')
    ]);
    return latestPaths;
}
async function writeCliInvocationArtifact(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.cliInvocationPath, (0, integrity_1.stableJson)(input.invocation), 'utf8'),
        fs.writeFile(latestPaths.latestCliInvocationPath, (0, integrity_1.stableJson)(input.invocation), 'utf8')
    ]);
    return latestPaths;
}
async function writePreflightArtifacts(input) {
    await fs.mkdir(input.paths.directory, { recursive: true });
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const persistedReport = {
        schemaVersion: 1,
        kind: 'preflight',
        provenanceId: input.provenanceId,
        iteration: input.iteration,
        promptKind: input.promptKind,
        promptTarget: input.promptTarget,
        trustLevel: input.trustLevel,
        ready: input.report.ready,
        summary: input.report.summary,
        selectedTaskId: input.selectedTaskId,
        selectedTaskTitle: input.selectedTaskTitle,
        validationCommand: input.validationCommand,
        artifactDir: input.paths.directory,
        reportPath: input.paths.reportPath,
        summaryPath: input.paths.summaryPath,
        blocked: !input.report.ready,
        createdAt: new Date().toISOString(),
        diagnostics: input.report.diagnostics
    };
    const humanSummary = renderPreflightSummary(persistedReport);
    await Promise.all([
        fs.writeFile(input.paths.reportPath, (0, integrity_1.stableJson)(persistedReport), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPreflightReportPath, (0, integrity_1.stableJson)(persistedReport), 'utf8'),
        fs.writeFile(latestPaths.latestPreflightSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        input.report.ready
            ? Promise.resolve()
            : Promise.all([
                fs.writeFile(latestPaths.latestResultPath, (0, integrity_1.stableJson)(persistedReport), 'utf8'),
                fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8')
            ]).then(() => undefined)
    ]);
    return {
        latestPaths,
        persistedReport,
        humanSummary
    };
}
async function writeIterationArtifacts(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const humanSummary = renderIterationSummary({
        result: input.result,
        paths: input.paths,
        verifiers: input.verifierSummary,
        diffSummary: input.diffSummary
    });
    const latestResult = latestResultFromIteration({
        result: input.result,
        paths: input.paths,
        diffSummary: input.diffSummary
    });
    await Promise.all([
        fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.promptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8'),
        fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
        fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
        fs.writeFile(input.paths.executionSummaryPath, (0, integrity_1.stableJson)(input.executionSummary), 'utf8'),
        fs.writeFile(input.paths.verifierSummaryPath, (0, integrity_1.stableJson)(input.verifierSummary), 'utf8'),
        fs.writeFile(input.paths.iterationResultPath, (0, integrity_1.stableJson)(input.result), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestResultPath, (0, integrity_1.stableJson)(latestResult), 'utf8'),
        fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8'),
        input.diffSummary
            ? fs.writeFile(input.paths.diffSummaryPath, (0, integrity_1.stableJson)(input.diffSummary), 'utf8')
            : Promise.resolve(),
        input.gitStatusBefore !== undefined
            ? fs.writeFile(input.paths.gitStatusBeforePath, input.gitStatusBefore, 'utf8')
            : Promise.resolve(),
        input.gitStatusAfter !== undefined
            ? fs.writeFile(input.paths.gitStatusAfterPath, input.gitStatusAfter, 'utf8')
            : Promise.resolve()
    ]);
    return {
        latestPaths,
        humanSummary,
        latestResult
    };
}
async function writeProvenanceBundle(input) {
    await ensureProvenanceBundleDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const summary = renderProvenanceSummary(input.bundle);
    const writes = [
        fs.writeFile(input.paths.bundlePath, (0, integrity_1.stableJson)(input.bundle), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${summary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.preflightReportPath, (0, integrity_1.stableJson)(input.preflightReport), 'utf8'),
        fs.writeFile(input.paths.preflightSummaryPath, `${input.preflightSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestProvenanceBundlePath, (0, integrity_1.stableJson)(input.bundle), 'utf8'),
        fs.writeFile(latestPaths.latestProvenanceSummaryPath, `${summary.trimEnd()}\n`, 'utf8')
    ];
    if (input.prompt !== undefined) {
        writes.push(fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'));
    }
    if (input.promptEvidence) {
        writes.push(fs.writeFile(input.paths.promptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8'));
    }
    if (input.executionPlan) {
        writes.push(fs.writeFile(input.paths.executionPlanPath, (0, integrity_1.stableJson)(input.executionPlan), 'utf8'));
    }
    if (input.cliInvocation) {
        writes.push(fs.writeFile(input.paths.cliInvocationPath, (0, integrity_1.stableJson)(input.cliInvocation), 'utf8'));
    }
    if (input.result) {
        writes.push(fs.writeFile(input.paths.iterationResultPath, (0, integrity_1.stableJson)(input.result), 'utf8'));
    }
    if (input.failure) {
        const failureSummary = renderIntegrityFailureSummary(input.failure);
        writes.push(fs.writeFile(input.paths.provenanceFailurePath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(input.paths.provenanceFailureSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8'), fs.writeFile(latestPaths.latestProvenanceFailurePath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(latestPaths.latestResultPath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(latestPaths.latestSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8'));
    }
    await Promise.all(writes);
    const retention = await cleanupProvenanceBundles({
        artifactRootDir: input.artifactRootDir,
        retentionCount: input.retentionCount ?? 0
    });
    return {
        latestPaths,
        summary,
        retention
    };
}
//# sourceMappingURL=artifactStore.js.map