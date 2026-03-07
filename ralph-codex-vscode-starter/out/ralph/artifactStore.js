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
exports.resolveLatestArtifactPaths = resolveLatestArtifactPaths;
exports.resolvePreflightArtifactPaths = resolvePreflightArtifactPaths;
exports.ensureIterationArtifactDirectory = ensureIterationArtifactDirectory;
exports.writePromptArtifacts = writePromptArtifacts;
exports.writeExecutionPlanArtifact = writeExecutionPlanArtifact;
exports.writeCliInvocationArtifact = writeCliInvocationArtifact;
exports.writePreflightArtifacts = writePreflightArtifacts;
exports.writeIterationArtifacts = writeIterationArtifacts;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
function stringifyJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function formatOptional(value) {
    return value && value.trim().length > 0 ? value : 'none';
}
function bulletList(values) {
    return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- none';
}
function formatDiagnosticLine(diagnostic) {
    return `- ${diagnostic.severity}: ${diagnostic.message}`;
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
        `- Stderr: ${paths.stderrPath}`
    ];
    lines.push(`- CLI invocation: ${paths.cliInvocationPath}`);
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
        `- Ready: ${report.ready ? 'yes' : 'no'}`,
        `- Prompt kind: ${report.promptKind}`,
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
        `- Selected task: ${formatOptional(result.selectedTaskId)}${result.selectedTaskTitle ? ` - ${result.selectedTaskTitle}` : ''}`,
        `- Prompt kind: ${result.promptKind}`,
        `- Target mode: ${result.executionIntegrity?.promptTarget ?? 'unknown'}`,
        `- Template: ${result.executionIntegrity?.templatePath ?? 'unknown'}`,
        `- Execution: ${result.executionStatus}`,
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
        `- Prompt artifact: ${result.executionIntegrity?.promptArtifactPath ?? 'none'}`,
        `- Prompt hash: ${result.executionIntegrity?.promptHash ?? 'none'}`,
        `- Payload matched rendered artifact: ${result.executionIntegrity?.executionPayloadMatched == null
            ? 'not executed'
            : result.executionIntegrity?.executionPayloadMatched ? 'yes' : 'no'}`,
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
function resolveLatestArtifactPaths(artifactRootDir) {
    return {
        latestResultPath: path.join(artifactRootDir, 'latest-result.json'),
        latestSummaryPath: path.join(artifactRootDir, 'latest-summary.md'),
        latestPreflightReportPath: path.join(artifactRootDir, 'latest-preflight-report.json'),
        latestPreflightSummaryPath: path.join(artifactRootDir, 'latest-preflight-summary.md'),
        latestPromptPath: path.join(artifactRootDir, 'latest-prompt.md'),
        latestPromptEvidencePath: path.join(artifactRootDir, 'latest-prompt-evidence.json'),
        latestExecutionPlanPath: path.join(artifactRootDir, 'latest-execution-plan.json'),
        latestCliInvocationPath: path.join(artifactRootDir, 'latest-cli-invocation.json')
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
async function writePromptArtifacts(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.promptEvidencePath, stringifyJson(input.promptEvidence), 'utf8'),
        fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptEvidencePath, stringifyJson(input.promptEvidence), 'utf8')
    ]);
    return latestPaths;
}
async function writeExecutionPlanArtifact(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.executionPlanPath, stringifyJson(input.plan), 'utf8'),
        fs.writeFile(latestPaths.latestExecutionPlanPath, stringifyJson(input.plan), 'utf8')
    ]);
    return latestPaths;
}
async function writeCliInvocationArtifact(input) {
    await ensureIterationArtifactDirectory(input.paths);
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    await Promise.all([
        fs.writeFile(input.paths.cliInvocationPath, stringifyJson(input.invocation), 'utf8'),
        fs.writeFile(latestPaths.latestCliInvocationPath, stringifyJson(input.invocation), 'utf8')
    ]);
    return latestPaths;
}
async function writePreflightArtifacts(input) {
    await fs.mkdir(input.paths.directory, { recursive: true });
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const persistedReport = {
        schemaVersion: 1,
        kind: 'preflight',
        iteration: input.iteration,
        promptKind: input.promptKind,
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
        fs.writeFile(input.paths.reportPath, stringifyJson(persistedReport), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPreflightReportPath, stringifyJson(persistedReport), 'utf8'),
        fs.writeFile(latestPaths.latestPreflightSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        input.report.ready
            ? Promise.resolve()
            : Promise.all([
                fs.writeFile(latestPaths.latestResultPath, stringifyJson(persistedReport), 'utf8'),
                fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8')
            ]).then(() => undefined)
    ]);
    return latestPaths;
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
    const latestResult = {
        iteration: input.result.iteration,
        selectedTaskId: input.result.selectedTaskId,
        selectedTaskTitle: input.result.selectedTaskTitle,
        promptKind: input.result.promptKind,
        promptTarget: input.result.executionIntegrity?.promptTarget ?? null,
        templatePath: input.result.executionIntegrity?.templatePath ?? null,
        executionStatus: input.result.executionStatus,
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
        executionPayloadMatched: input.result.executionIntegrity?.executionPayloadMatched ?? null,
        executionSummaryPath: input.paths.executionSummaryPath,
        verifierSummaryPath: input.paths.verifierSummaryPath,
        iterationResultPath: input.paths.iterationResultPath,
        diffSummaryPath: input.diffSummary ? input.paths.diffSummaryPath : null,
        stdoutPath: input.paths.stdoutPath,
        stderrPath: input.paths.stderrPath
    };
    await Promise.all([
        fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.promptEvidencePath, stringifyJson(input.promptEvidence), 'utf8'),
        fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
        fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
        fs.writeFile(input.paths.executionSummaryPath, stringifyJson(input.executionSummary), 'utf8'),
        fs.writeFile(input.paths.verifierSummaryPath, stringifyJson(input.verifierSummary), 'utf8'),
        fs.writeFile(input.paths.iterationResultPath, stringifyJson(input.result), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestResultPath, stringifyJson(latestResult), 'utf8'),
        fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptEvidencePath, stringifyJson(input.promptEvidence), 'utf8'),
        input.diffSummary
            ? fs.writeFile(input.paths.diffSummaryPath, stringifyJson(input.diffSummary), 'utf8')
            : Promise.resolve(),
        input.gitStatusBefore !== undefined
            ? fs.writeFile(input.paths.gitStatusBeforePath, input.gitStatusBefore, 'utf8')
            : Promise.resolve(),
        input.gitStatusAfter !== undefined
            ? fs.writeFile(input.paths.gitStatusAfterPath, input.gitStatusAfter, 'utf8')
            : Promise.resolve()
    ]);
    return latestPaths;
}
//# sourceMappingURL=artifactStore.js.map