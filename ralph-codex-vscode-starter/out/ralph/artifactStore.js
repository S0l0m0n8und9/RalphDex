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
exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES = exports.PROTECTED_GENERATED_LATEST_POINTER_FILES = exports.PROTECTED_GENERATED_STATE_ROOT_REFERENCES = void 0;
exports.resolveIterationArtifactPaths = resolveIterationArtifactPaths;
exports.resolveProvenanceBundlePaths = resolveProvenanceBundlePaths;
exports.resolveLatestArtifactPaths = resolveLatestArtifactPaths;
exports.resolvePreflightArtifactPaths = resolvePreflightArtifactPaths;
exports.ensureIterationArtifactDirectory = ensureIterationArtifactDirectory;
exports.cleanupProvenanceBundles = cleanupProvenanceBundles;
exports.cleanupGeneratedArtifacts = cleanupGeneratedArtifacts;
exports.writePromptArtifacts = writePromptArtifacts;
exports.writeExecutionPlanArtifact = writeExecutionPlanArtifact;
exports.writeCliInvocationArtifact = writeCliInvocationArtifact;
exports.writePreflightArtifacts = writePreflightArtifacts;
exports.writeIterationArtifacts = writeIterationArtifacts;
exports.writeProvenanceBundle = writeProvenanceBundle;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
exports.PROTECTED_GENERATED_STATE_ROOT_REFERENCES = [
    'lastPromptPath',
    'lastRun.promptPath',
    'lastRun.transcriptPath',
    'lastRun.lastMessagePath',
    'lastIteration.artifactDir',
    'lastIteration.promptPath',
    'lastIteration.execution.transcriptPath',
    'lastIteration.execution.lastMessagePath',
    'runHistory[].promptPath',
    'runHistory[].transcriptPath',
    'runHistory[].lastMessagePath',
    'iterationHistory[].artifactDir',
    'iterationHistory[].promptPath',
    'iterationHistory[].execution.transcriptPath',
    'iterationHistory[].execution.lastMessagePath'
];
exports.PROTECTED_GENERATED_LATEST_POINTER_FILES = [
    'latest-result.json',
    'latest-preflight-report.json',
    'latest-prompt-evidence.json',
    'latest-execution-plan.json',
    'latest-cli-invocation.json',
    'latest-provenance-bundle.json',
    'latest-provenance-failure.json'
];
exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES = {
    'latest-result.json': [
        'artifactDir',
        'summaryPath',
        'promptPath',
        'promptEvidencePath',
        'executionPlanPath',
        'cliInvocationPath',
        'promptArtifactPath',
        'transcriptPath',
        'lastMessagePath'
    ],
    'latest-preflight-report.json': [
        'artifactDir',
        'reportPath',
        'summaryPath'
    ],
    'latest-prompt-evidence.json': [
        'kind+iteration (derived iteration directory and prompt file)'
    ],
    'latest-execution-plan.json': [
        'artifactDir',
        'promptPath',
        'promptArtifactPath',
        'promptEvidencePath',
        'executionPlanPath'
    ],
    'latest-cli-invocation.json': [
        'promptArtifactPath',
        'transcriptPath',
        'lastMessagePath',
        'cliInvocationPath'
    ],
    'latest-provenance-bundle.json': [
        'artifactDir',
        'preflightReportPath',
        'preflightSummaryPath',
        'promptArtifactPath',
        'promptEvidencePath',
        'executionPlanPath',
        'cliInvocationPath',
        'iterationResultPath',
        'provenanceFailurePath',
        'provenanceFailureSummaryPath'
    ],
    'latest-provenance-failure.json': [
        'artifactDir',
        'executionPlanPath',
        'promptArtifactPath',
        'cliInvocationPath',
        'provenanceFailurePath',
        'provenanceFailureSummaryPath'
    ]
};
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
function sortByIterationDesc(left, right) {
    return right.iteration - left.iteration || right.name.localeCompare(left.name);
}
function retainedNamesByNewestAndProtected(entries, retentionCount, protectedNames, getName) {
    // Protection augments the newest-N retention window; it never displaces newer entries.
    const retained = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
    for (const name of protectedNames) {
        retained.add(name);
    }
    return retained;
}
function retentionDecisionByNewestAndProtected(entries, retentionCount, protectedNames, getName) {
    const newestWindowNames = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
    const retainedNames = retainedNamesByNewestAndProtected(entries, retentionCount, protectedNames, getName);
    const protectedRetainedNames = entries
        .filter((entry) => {
        const name = getName(entry);
        return retainedNames.has(name) && !newestWindowNames.has(name);
    })
        .map((entry) => getName(entry));
    return {
        retainedNames,
        protectedRetainedNames
    };
}
function parseIterationDirectoryName(name) {
    const match = /^iteration-(\d+)$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
}
function parsePromptFileName(name) {
    const match = /^.+-(\d+)\.prompt\.md$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
}
function parseRunArtifactFileName(name) {
    const match = /^(.+)-(\d+)\.(transcript|last-message)\.md$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        baseName: `${match[1]}-${match[2]}`,
        iteration: Number.parseInt(match[2], 10)
    };
}
function createProtectedGeneratedArtifacts() {
    return {
        iterationDirectories: new Set(),
        promptFiles: new Set(),
        runArtifactBaseNames: new Set()
    };
}
function isPathWithin(rootDir, targetPath) {
    if (!path.isAbsolute(targetPath)) {
        return false;
    }
    const relative = path.relative(rootDir, targetPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}
function readPathReference(record, key) {
    const value = record?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function readRecordReference(record, key) {
    const value = record?.[key];
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function compactPathReferences(references) {
    return references.filter((value) => Boolean(value));
}
function parsePromptEvidenceIdentity(record) {
    if (!record) {
        return null;
    }
    const kind = record.kind;
    const iteration = record.iteration;
    if ((kind !== 'bootstrap'
        && kind !== 'iteration'
        && kind !== 'replenish-backlog'
        && kind !== 'fix-failure'
        && kind !== 'continue-progress'
        && kind !== 'human-review-handoff')
        || typeof iteration !== 'number'
        || !Number.isFinite(iteration)
        || iteration < 1) {
        return null;
    }
    return {
        kind,
        iteration: Math.floor(iteration)
    };
}
function derivedLatestPromptEvidenceReferences(record, dirs) {
    const identity = parsePromptEvidenceIdentity(record);
    if (!identity) {
        return [];
    }
    const paddedIteration = String(identity.iteration).padStart(3, '0');
    return [
        path.join(dirs.artifactRootDir, `iteration-${paddedIteration}`),
        path.join(dirs.promptDir, `${identity.kind}-${paddedIteration}.prompt.md`)
    ];
}
function readRecordArray(record, key) {
    const value = record?.[key];
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((candidate) => typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate));
}
function addProtectedGeneratedArtifactPath(protectedArtifacts, input) {
    const normalizedPath = path.normalize(input.targetPath);
    if (isPathWithin(input.artifactRootDir, normalizedPath)) {
        const relative = path.relative(input.artifactRootDir, normalizedPath);
        const [firstSegment] = relative.split(path.sep);
        if (firstSegment && parseIterationDirectoryName(firstSegment)) {
            protectedArtifacts.iterationDirectories.add(firstSegment);
        }
    }
    const baseName = path.basename(normalizedPath);
    if (isPathWithin(input.promptDir, normalizedPath)) {
        const parsedPrompt = parsePromptFileName(baseName);
        if (parsedPrompt) {
            protectedArtifacts.promptFiles.add(parsedPrompt.name);
        }
    }
    if (isPathWithin(input.runDir, normalizedPath)) {
        const parsedRunArtifact = parseRunArtifactFileName(baseName);
        if (parsedRunArtifact) {
            protectedArtifacts.runArtifactBaseNames.add(parsedRunArtifact.baseName);
        }
    }
}
function addProtectedGeneratedArtifactPaths(protectedArtifacts, input, targetPaths) {
    for (const targetPath of targetPaths) {
        addProtectedGeneratedArtifactPath(protectedArtifacts, {
            ...input,
            targetPath
        });
    }
}
function readStateRunReference(candidate) {
    if (!candidate) {
        return null;
    }
    const iteration = typeof candidate.iteration === 'number'
        && Number.isFinite(candidate.iteration)
        && candidate.iteration >= 1
        ? Math.floor(candidate.iteration)
        : null;
    const promptPath = readPathReference(candidate, 'promptPath');
    const transcriptPath = readPathReference(candidate, 'transcriptPath');
    const lastMessagePath = readPathReference(candidate, 'lastMessagePath');
    if (!promptPath && !transcriptPath && !lastMessagePath && iteration === null) {
        return null;
    }
    return {
        iteration,
        promptPath,
        transcriptPath,
        lastMessagePath
    };
}
function derivedIterationDirectoryPath(artifactRootDir, iteration) {
    return path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
}
function currentStateArtifactReferences(input) {
    if (!input.stateRecord) {
        return [];
    }
    const runHistory = readRecordArray(input.stateRecord, 'runHistory')
        .map((record) => readStateRunReference(record))
        .filter((record) => record !== null);
    const lastRun = readStateRunReference(readRecordReference(input.stateRecord, 'lastRun')) ?? runHistory.at(-1) ?? null;
    const effectiveRunHistory = lastRun ? [...runHistory, lastRun] : runHistory;
    const iterationHistory = readRecordArray(input.stateRecord, 'iterationHistory');
    const effectiveIterationHistory = iterationHistory.length > 0
        ? iterationHistory
        : effectiveRunHistory.flatMap((runRecord) => {
            if (runRecord.iteration === null) {
                return [];
            }
            return [{
                    artifactDir: derivedIterationDirectoryPath(input.artifactRootDir, runRecord.iteration),
                    promptPath: runRecord.promptPath,
                    execution: {
                        transcriptPath: runRecord.transcriptPath,
                        lastMessagePath: runRecord.lastMessagePath
                    }
                }];
        });
    const lastIteration = readRecordReference(input.stateRecord, 'lastIteration') ?? effectiveIterationHistory.at(-1) ?? null;
    const lastIterationExecution = readRecordReference(lastIteration, 'execution');
    const references = compactPathReferences([
        readPathReference(input.stateRecord, 'lastPromptPath'),
        readPathReference(lastRun, 'promptPath'),
        readPathReference(lastRun, 'transcriptPath'),
        readPathReference(lastRun, 'lastMessagePath'),
        readPathReference(lastIteration, 'artifactDir'),
        readPathReference(lastIteration, 'promptPath'),
        readPathReference(lastIterationExecution, 'transcriptPath'),
        readPathReference(lastIterationExecution, 'lastMessagePath')
    ]);
    for (const runRecord of runHistory) {
        references.push(...compactPathReferences([
            readPathReference(runRecord, 'promptPath'),
            readPathReference(runRecord, 'transcriptPath'),
            readPathReference(runRecord, 'lastMessagePath')
        ]));
    }
    for (const iterationRecord of effectiveIterationHistory) {
        const executionRecord = readRecordReference(iterationRecord, 'execution');
        references.push(...compactPathReferences([
            readPathReference(iterationRecord, 'artifactDir'),
            readPathReference(iterationRecord, 'promptPath'),
            readPathReference(executionRecord, 'transcriptPath'),
            readPathReference(executionRecord, 'lastMessagePath')
        ]));
    }
    return references;
}
function latestArtifactReferences(records, dirs) {
    const latestResultReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json'];
    const latestPreflightReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json'];
    const latestExecutionPlanReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json'];
    const latestCliInvocationReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json'];
    const latestProvenanceBundleReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json'];
    const latestProvenanceFailureReferenceFields = exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json'];
    return compactPathReferences([
        ...latestResultReferenceFields.map((field) => readPathReference(records.latestResult, field)),
        ...latestPreflightReferenceFields.map((field) => readPathReference(records.latestPreflightReport, field)),
        ...latestExecutionPlanReferenceFields.map((field) => readPathReference(records.latestExecutionPlan, field)),
        ...latestCliInvocationReferenceFields.map((field) => readPathReference(records.latestCliInvocation, field)),
        ...latestProvenanceBundleReferenceFields.map((field) => readPathReference(records.latestProvenanceBundle, field)),
        ...latestProvenanceFailureReferenceFields.map((field) => readPathReference(records.latestProvenanceFailure, field)),
        ...derivedLatestPromptEvidenceReferences(records.latestPromptEvidence, dirs),
        ...derivedLatestSurfaceReferences({
            artifactRootDir: dirs.artifactRootDir,
            latestSummaryText: records.latestSummaryText,
            latestPreflightSummaryText: records.latestPreflightSummaryText,
            latestProvenanceSummaryText: records.latestProvenanceSummaryText
        })
    ]);
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
        `- Task validation hint: ${formatOptional(report.taskValidationHint)}`,
        `- Effective validation command: ${formatOptional(report.effectiveValidationCommand)}`,
        `- Validation normalized from: ${formatOptional(report.normalizedValidationCommandFrom)}`,
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
    return [
        `# Ralph Provenance ${bundle.provenanceId}`,
        '',
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
        diffSummaryPath: input.diffSummary ? input.paths.diffSummaryPath : null,
        stdoutPath: input.paths.stdoutPath,
        stderrPath: input.paths.stderrPath,
        completionReportStatus: input.result.completionReportStatus ?? null,
        reconciliationWarnings: input.result.reconciliationWarnings ?? [],
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
        completionReportPath: path.join(directory, 'completion-report.json'),
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
async function readTextRecord(target) {
    try {
        return await fs.readFile(target, 'utf8');
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
function parseIterationFromLatestSurface(raw) {
    if (!raw) {
        return null;
    }
    const headingMatch = /^# Ralph (?:Iteration|Preflight|Provenance Failure) (\d+)\s*$/m.exec(raw);
    if (headingMatch) {
        return Number.parseInt(headingMatch[1], 10);
    }
    const bulletMatch = /^- Iteration:\s+(\d+)\s*$/m.exec(raw);
    if (bulletMatch) {
        return Number.parseInt(bulletMatch[1], 10);
    }
    return null;
}
function parseArtifactPathsFromLatestSurface(raw) {
    if (!raw) {
        return [];
    }
    const pathLabels = new Set([
        'Prompt',
        'Report',
        'Preflight report',
        'Preflight summary',
        'Iteration artifact dir'
    ]);
    const extractedPaths = [];
    for (const line of raw.split(/\r?\n/u)) {
        const match = /^- ([^:]+):\s+(.+?)\s*$/.exec(line);
        if (!match || !pathLabels.has(match[1])) {
            continue;
        }
        extractedPaths.push(match[2].trim());
    }
    return extractedPaths;
}
function derivedLatestSurfaceReferences(input) {
    const surfaces = [
        input.latestSummaryText,
        input.latestPreflightSummaryText,
        input.latestProvenanceSummaryText
    ];
    const iterations = surfaces
        .map((surface) => parseIterationFromLatestSurface(surface))
        .filter((value) => value !== null);
    const artifactPaths = surfaces.flatMap((surface) => parseArtifactPathsFromLatestSurface(surface));
    return [
        ...artifactPaths,
        ...iterations.map((iteration) => derivedIterationDirectoryPath(input.artifactRootDir, iteration))
    ];
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
async function resolveProtectedGeneratedArtifacts(input) {
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const [stateRecord, latestResult, latestPreflightReport, latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestProvenanceBundle, latestProvenanceFailure, latestSummaryText, latestPreflightSummaryText, latestProvenanceSummaryText] = await Promise.all([
        readJsonRecord(input.stateFilePath),
        readJsonRecord(latestPaths.latestResultPath),
        readJsonRecord(latestPaths.latestPreflightReportPath),
        readJsonRecord(latestPaths.latestPromptEvidencePath),
        readJsonRecord(latestPaths.latestExecutionPlanPath),
        readJsonRecord(latestPaths.latestCliInvocationPath),
        readJsonRecord(latestPaths.latestProvenanceBundlePath),
        readJsonRecord(latestPaths.latestProvenanceFailurePath),
        readTextRecord(latestPaths.latestSummaryPath),
        readTextRecord(latestPaths.latestPreflightSummaryPath),
        readTextRecord(latestPaths.latestProvenanceSummaryPath)
    ]);
    const protectedArtifacts = createProtectedGeneratedArtifacts();
    const pathInput = {
        artifactRootDir: input.artifactRootDir,
        promptDir: input.promptDir,
        runDir: input.runDir
    };
    addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, currentStateArtifactReferences({
        stateRecord,
        artifactRootDir: input.artifactRootDir
    }));
    addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, latestArtifactReferences({
        latestResult,
        latestPreflightReport,
        latestPromptEvidence,
        latestExecutionPlan,
        latestCliInvocation,
        latestProvenanceBundle,
        latestProvenanceFailure,
        latestSummaryText,
        latestPreflightSummaryText,
        latestProvenanceSummaryText
    }, pathInput));
    return protectedArtifacts;
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
async function cleanupGeneratedArtifacts(input) {
    if (input.retentionCount <= 0) {
        return {
            deletedIterationDirectories: [],
            retainedIterationDirectories: [],
            protectedRetainedIterationDirectories: [],
            deletedPromptFiles: [],
            retainedPromptFiles: [],
            protectedRetainedPromptFiles: [],
            deletedRunArtifactBaseNames: [],
            retainedRunArtifactBaseNames: [],
            protectedRetainedRunArtifactBaseNames: []
        };
    }
    const [artifactEntries, promptEntries, runEntries, protectedArtifacts] = await Promise.all([
        fs.readdir(input.artifactRootDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.promptDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.runDir, { withFileTypes: true }).catch(() => []),
        resolveProtectedGeneratedArtifacts({
            artifactRootDir: input.artifactRootDir,
            promptDir: input.promptDir,
            runDir: input.runDir,
            stateFilePath: input.stateFilePath
        })
    ]);
    const iterationDirectories = artifactEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseIterationDirectoryName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const iterationDirectoryDecision = retentionDecisionByNewestAndProtected(iterationDirectories, input.retentionCount, protectedArtifacts.iterationDirectories, (entry) => entry.name);
    const retainedIterationDirectories = iterationDirectoryDecision.retainedNames;
    const deletedIterationDirectories = [];
    for (const entry of iterationDirectories.slice(input.retentionCount)) {
        if (retainedIterationDirectories.has(entry.name)) {
            continue;
        }
        await fs.rm(path.join(input.artifactRootDir, entry.name), { recursive: true, force: true });
        deletedIterationDirectories.push(entry.name);
    }
    const promptFiles = promptEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parsePromptFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const promptFileDecision = retentionDecisionByNewestAndProtected(promptFiles, input.retentionCount, protectedArtifacts.promptFiles, (entry) => entry.name);
    const retainedPromptFiles = promptFileDecision.retainedNames;
    const deletedPromptFiles = [];
    for (const entry of promptFiles.slice(input.retentionCount)) {
        if (retainedPromptFiles.has(entry.name)) {
            continue;
        }
        await fs.rm(path.join(input.promptDir, entry.name), { force: true });
        deletedPromptFiles.push(entry.name);
    }
    const runArtifactGroups = new Map();
    for (const entry of runEntries.filter((candidate) => candidate.isFile())) {
        const parsed = parseRunArtifactFileName(entry.name);
        if (!parsed) {
            continue;
        }
        const current = runArtifactGroups.get(parsed.baseName);
        if (current) {
            current.fileNames.push(parsed.name);
            continue;
        }
        runArtifactGroups.set(parsed.baseName, {
            baseName: parsed.baseName,
            iteration: parsed.iteration,
            fileNames: [parsed.name]
        });
    }
    const runArtifacts = Array.from(runArtifactGroups.values()).sort((left, right) => right.iteration - left.iteration || right.baseName.localeCompare(left.baseName));
    const runArtifactDecision = retentionDecisionByNewestAndProtected(runArtifacts, input.retentionCount, protectedArtifacts.runArtifactBaseNames, (entry) => entry.baseName);
    const retainedRunArtifactBaseNames = runArtifactDecision.retainedNames;
    const deletedRunArtifactBaseNames = [];
    for (const entry of runArtifacts.slice(input.retentionCount)) {
        if (retainedRunArtifactBaseNames.has(entry.baseName)) {
            continue;
        }
        await Promise.all(entry.fileNames.map((fileName) => fs.rm(path.join(input.runDir, fileName), { force: true })));
        deletedRunArtifactBaseNames.push(entry.baseName);
    }
    return {
        deletedIterationDirectories,
        retainedIterationDirectories: iterationDirectories
            .filter((entry) => retainedIterationDirectories.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedIterationDirectories: iterationDirectoryDecision.protectedRetainedNames,
        deletedPromptFiles,
        retainedPromptFiles: promptFiles
            .filter((entry) => retainedPromptFiles.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedPromptFiles: promptFileDecision.protectedRetainedNames,
        deletedRunArtifactBaseNames,
        retainedRunArtifactBaseNames: runArtifacts
            .filter((entry) => retainedRunArtifactBaseNames.has(entry.baseName))
            .map((entry) => entry.baseName),
        protectedRetainedRunArtifactBaseNames: runArtifactDecision.protectedRetainedNames
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
        taskValidationHint: input.taskValidationHint,
        effectiveValidationCommand: input.effectiveValidationCommand,
        normalizedValidationCommandFrom: input.normalizedValidationCommandFrom,
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
        fs.writeFile(input.paths.completionReportPath, (0, integrity_1.stableJson)(input.completionReport), 'utf8'),
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