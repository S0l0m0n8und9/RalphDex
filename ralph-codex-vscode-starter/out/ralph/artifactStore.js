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
exports.repairLatestArtifactSurfaces = repairLatestArtifactSurfaces;
exports.cleanupProvenanceBundles = cleanupProvenanceBundles;
exports.inspectProvenanceBundleRetention = inspectProvenanceBundleRetention;
exports.cleanupGeneratedArtifacts = cleanupGeneratedArtifacts;
exports.inspectGeneratedArtifactRetention = inspectGeneratedArtifactRetention;
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
    if (input.includeHistory ?? true) {
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
function parseHandoffFileName(name) {
    const match = /^.+-(\d+)\.json$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
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
        remediationPath: path.join(directory, 'task-remediation.json'),
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
        latestRemediationPath: path.join(artifactRootDir, 'latest-remediation.json'),
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
async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
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
async function repairLatestArtifactSurfaces(artifactRootDir) {
    const latestPaths = resolveLatestArtifactPaths(artifactRootDir);
    const repairedLatestArtifactPaths = [];
    const staleLatestArtifactPaths = [];
    const [latestResultExists, latestSummaryExists, latestPreflightReportRecord, latestPreflightSummaryExists, latestProvenanceBundleRecord, latestProvenanceSummaryExists] = await Promise.all([
        pathExists(latestPaths.latestResultPath),
        pathExists(latestPaths.latestSummaryPath),
        readJsonRecord(latestPaths.latestPreflightReportPath),
        pathExists(latestPaths.latestPreflightSummaryPath),
        readJsonRecord(latestPaths.latestProvenanceBundlePath),
        pathExists(latestPaths.latestProvenanceSummaryPath)
    ]);
    if (!latestSummaryExists && latestResultExists) {
        const latestResultRecord = await readJsonRecord(latestPaths.latestResultPath);
        const repairedSummary = looksLikePreflightRecord(latestResultRecord)
            ? renderPreflightSummary(latestResultRecord)
            : looksLikeIntegrityFailure(latestResultRecord)
                ? renderIntegrityFailureSummary(latestResultRecord)
                : latestResultRecord
                    ? renderLatestResultSummary(latestResultRecord)
                    : null;
        if (repairedSummary) {
            await fs.writeFile(latestPaths.latestSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
            repairedLatestArtifactPaths.push(latestPaths.latestSummaryPath);
        }
        else {
            staleLatestArtifactPaths.push(latestPaths.latestSummaryPath);
        }
    }
    if (!latestPreflightSummaryExists && looksLikePreflightRecord(latestPreflightReportRecord)) {
        const repairedSummary = renderPreflightSummary(latestPreflightReportRecord);
        await fs.writeFile(latestPaths.latestPreflightSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
        repairedLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
    }
    else if (!latestPreflightSummaryExists && latestPreflightReportRecord) {
        staleLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
    }
    if (!latestProvenanceSummaryExists && looksLikeProvenanceBundle(latestProvenanceBundleRecord)) {
        const repairedSummary = renderProvenanceSummary(latestProvenanceBundleRecord);
        await fs.writeFile(latestPaths.latestProvenanceSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
        repairedLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
    }
    else if (!latestProvenanceSummaryExists && latestProvenanceBundleRecord) {
        staleLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
    }
    return {
        repairedLatestArtifactPaths,
        staleLatestArtifactPaths
    };
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
        artifactRootDir: input.artifactRootDir,
        includeHistory: (input.protectionScope ?? 'fullStateAndLatest') === 'fullStateAndLatest'
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
    const inspection = await collectProvenanceBundleRetentionInspection(input);
    if (input.retentionCount <= 0) {
        return {
            deletedBundleIds: [],
            retainedBundleIds: inspection.retainedBundleIds,
            protectedBundleIds: inspection.protectedBundleIds
        };
    }
    const runsDir = path.join(input.artifactRootDir, 'runs');
    const retainedIds = new Set(inspection.retainedBundleIds);
    const deletedBundleIds = [];
    for (const bundleId of inspection.bundleIds.slice(input.retentionCount)) {
        if (retainedIds.has(bundleId)) {
            continue;
        }
        await fs.rm(path.join(runsDir, bundleId), { recursive: true, force: true });
        deletedBundleIds.push(bundleId);
    }
    return {
        deletedBundleIds,
        retainedBundleIds: inspection.retainedBundleIds,
        protectedBundleIds: inspection.protectedBundleIds
    };
}
async function inspectProvenanceBundleRetention(input) {
    const inspection = await collectProvenanceBundleRetentionInspection(input);
    return {
        deletedBundleIds: [],
        retainedBundleIds: inspection.retainedBundleIds,
        protectedBundleIds: inspection.protectedBundleIds
    };
}
async function cleanupGeneratedArtifacts(input) {
    if (input.retentionCount <= 0) {
        const summary = {
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
        if (input.handoffDir) {
            summary.deletedHandoffFiles = [];
            summary.retainedHandoffFiles = [];
        }
        return summary;
    }
    const inspection = await collectGeneratedArtifactRetentionInspection(input);
    const retainedIterationDirectories = inspection.iterationDirectoryDecision.retainedNames;
    const deletedIterationDirectories = [];
    for (const entry of inspection.iterationDirectories.slice(input.retentionCount)) {
        if (retainedIterationDirectories.has(entry.name)) {
            continue;
        }
        await fs.rm(path.join(input.artifactRootDir, entry.name), { recursive: true, force: true });
        deletedIterationDirectories.push(entry.name);
    }
    const retainedPromptFiles = inspection.promptFileDecision.retainedNames;
    const deletedPromptFiles = [];
    for (const entry of inspection.promptFiles.slice(input.retentionCount)) {
        if (retainedPromptFiles.has(entry.name)) {
            continue;
        }
        await fs.rm(path.join(input.promptDir, entry.name), { force: true });
        deletedPromptFiles.push(entry.name);
    }
    const retainedRunArtifactBaseNames = inspection.runArtifactDecision.retainedNames;
    const deletedRunArtifactBaseNames = [];
    for (const entry of inspection.runArtifacts.slice(input.retentionCount)) {
        if (retainedRunArtifactBaseNames.has(entry.baseName)) {
            continue;
        }
        await Promise.all(entry.fileNames.map((fileName) => fs.rm(path.join(input.runDir, fileName), { force: true })));
        deletedRunArtifactBaseNames.push(entry.baseName);
    }
    const summary = {
        deletedIterationDirectories,
        retainedIterationDirectories: inspection.iterationDirectories
            .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
        deletedPromptFiles,
        retainedPromptFiles: inspection.promptFiles
            .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
        deletedRunArtifactBaseNames,
        retainedRunArtifactBaseNames: inspection.runArtifacts
            .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
            .map((entry) => entry.baseName),
        protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames
    };
    if (input.handoffDir) {
        const retainedHandoffFiles = inspection.handoffFileDecision.retainedNames;
        const deletedHandoffFiles = [];
        for (const entry of inspection.handoffFiles.slice(input.retentionCount)) {
            if (retainedHandoffFiles.has(entry.name)) {
                continue;
            }
            await fs.rm(path.join(input.handoffDir, entry.name), { force: true });
            deletedHandoffFiles.push(entry.name);
        }
        summary.deletedHandoffFiles = deletedHandoffFiles;
        summary.retainedHandoffFiles = inspection.handoffFiles
            .filter((entry) => retainedHandoffFiles.has(entry.name))
            .map((entry) => entry.name);
    }
    ;
    return summary;
}
async function inspectGeneratedArtifactRetention(input) {
    const inspection = await collectGeneratedArtifactRetentionInspection(input);
    const summary = {
        deletedIterationDirectories: [],
        retainedIterationDirectories: inspection.iterationDirectories
            .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
        deletedPromptFiles: [],
        retainedPromptFiles: inspection.promptFiles
            .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
        deletedRunArtifactBaseNames: [],
        retainedRunArtifactBaseNames: inspection.runArtifacts
            .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
            .map((entry) => entry.baseName),
        protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames
    };
    if (input.handoffDir) {
        summary.deletedHandoffFiles = [];
        summary.retainedHandoffFiles = inspection.handoffFiles
            .filter((entry) => inspection.handoffFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name);
    }
    return summary;
}
async function collectProvenanceBundleRetentionInspection(input) {
    const runsDir = path.join(input.artifactRootDir, 'runs');
    const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
    const bundleIds = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left));
    const protectedIds = Array.from(await resolveProtectedBundleIds(input.artifactRootDir)).sort();
    const retainedIds = new Set(input.retentionCount <= 0 ? bundleIds : bundleIds.slice(0, input.retentionCount));
    protectedIds.forEach((bundleId) => retainedIds.add(bundleId));
    return {
        bundleIds,
        retainedBundleIds: bundleIds.filter((bundleId) => retainedIds.has(bundleId)),
        protectedBundleIds: protectedIds
    };
}
async function collectGeneratedArtifactRetentionInspection(input) {
    const [artifactEntries, promptEntries, runEntries, protectedArtifacts] = await Promise.all([
        fs.readdir(input.artifactRootDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.promptDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.runDir, { withFileTypes: true }).catch(() => []),
        resolveProtectedGeneratedArtifacts({
            artifactRootDir: input.artifactRootDir,
            promptDir: input.promptDir,
            runDir: input.runDir,
            stateFilePath: input.stateFilePath,
            protectionScope: input.protectionScope
        })
    ]);
    const handoffEntries = input.handoffDir
        ? await fs.readdir(input.handoffDir, { withFileTypes: true }).catch(() => [])
        : [];
    const iterationDirectories = artifactEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseIterationDirectoryName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const promptFiles = promptEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parsePromptFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
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
    const handoffFiles = handoffEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parseHandoffFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const effectiveRetentionCount = input.retentionCount <= 0
        ? Math.max(iterationDirectories.length, promptFiles.length, runArtifacts.length, handoffFiles.length)
        : input.retentionCount;
    return {
        iterationDirectories,
        promptFiles,
        runArtifacts,
        handoffFiles,
        protectedArtifacts,
        iterationDirectoryDecision: retentionDecisionByNewestAndProtected(iterationDirectories, effectiveRetentionCount, protectedArtifacts.iterationDirectories, (entry) => entry.name),
        promptFileDecision: retentionDecisionByNewestAndProtected(promptFiles, effectiveRetentionCount, protectedArtifacts.promptFiles, (entry) => entry.name),
        runArtifactDecision: retentionDecisionByNewestAndProtected(runArtifacts, effectiveRetentionCount, protectedArtifacts.runArtifactBaseNames, (entry) => entry.baseName),
        handoffFileDecision: {
            retainedNames: retainedNamesByNewestAndProtected(handoffFiles, effectiveRetentionCount, [], (entry) => entry.name)
        }
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
        agentId: input.agentId,
        provenanceId: input.provenanceId,
        iteration: input.iteration,
        promptKind: input.promptKind,
        promptTarget: input.promptTarget,
        trustLevel: input.trustLevel,
        ready: input.report.ready,
        summary: input.report.summary,
        activeClaimSummary: input.report.activeClaimSummary,
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
        input.remediationArtifact
            ? fs.writeFile(input.paths.remediationPath, (0, integrity_1.stableJson)(input.remediationArtifact), 'utf8')
            : Promise.resolve(),
        fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestResultPath, (0, integrity_1.stableJson)(latestResult), 'utf8'),
        fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestPromptEvidencePath, (0, integrity_1.stableJson)(input.promptEvidence), 'utf8'),
        input.remediationArtifact
            ? fs.writeFile(latestPaths.latestRemediationPath, (0, integrity_1.stableJson)(input.remediationArtifact), 'utf8')
            : fs.rm(latestPaths.latestRemediationPath, { force: true }),
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
    const resultIterationPaths = input.result
        ? resolveIterationArtifactPaths(input.artifactRootDir, input.result.iteration)
        : null;
    const completionReportPath = resultIterationPaths
        ? await fs.access(resultIterationPaths.completionReportPath)
            .then(() => resultIterationPaths.completionReportPath)
            .catch(() => null)
        : null;
    const bundle = input.result
        ? {
            ...input.bundle,
            executionSummaryPath: resultIterationPaths?.executionSummaryPath ?? null,
            verifierSummaryPath: resultIterationPaths?.verifierSummaryPath ?? null,
            completionReportStatus: input.result.completionReportStatus ?? null,
            reconciliationWarnings: input.result.reconciliationWarnings ?? null,
            completionReportPath,
            epistemicGap: {
                trustBoundary: 'The provenance chain stops at the codex exec boundary; model-internal reasoning is not directly observable.',
                bundleProves: 'Prompt, plan, and CLI payload integrity up to execution, plus the verifier-observed post-run artifacts.',
                bundleDoesNotProve: 'That the model reasoned correctly internally or that its completion report is true without verifier support.',
                modelClaimsPath: completionReportPath,
                modelClaimsStatus: input.result.completionReportStatus ?? null,
                modelClaimsAreUnverified: completionReportPath !== null,
                verifierEvidencePaths: [
                    resultIterationPaths?.executionSummaryPath ?? null,
                    resultIterationPaths?.verifierSummaryPath ?? null,
                    resultIterationPaths?.iterationResultPath ?? null
                ].filter((item) => typeof item === 'string' && item.length > 0),
                verifierEvidenceIsAuthoritative: true,
                reconciliationWarnings: input.result.reconciliationWarnings ?? [],
                noWarningsMeans: 'No reconciliation warnings means the model claim matched the observable verifier signals, not that the model reasoning was correct.'
            }
        }
        : {
            ...input.bundle,
            executionSummaryPath: null,
            verifierSummaryPath: null,
            epistemicGap: {
                trustBoundary: 'The provenance chain can prove only the prepared bundle until execution occurs.',
                bundleProves: 'The persisted preflight, prompt, and execution-plan artifacts that Ralph prepared for this run.',
                bundleDoesNotProve: 'Anything about a model outcome, because no completion report or verifier evidence exists yet.',
                modelClaimsPath: null,
                modelClaimsStatus: null,
                modelClaimsAreUnverified: false,
                verifierEvidencePaths: [],
                verifierEvidenceIsAuthoritative: true,
                reconciliationWarnings: [],
                noWarningsMeans: 'No reconciliation warnings are available because no model self-report was reconciled yet.'
            }
        };
    const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
    const summary = renderProvenanceSummary(bundle);
    const writes = [
        fs.writeFile(input.paths.bundlePath, (0, integrity_1.stableJson)(bundle), 'utf8'),
        fs.writeFile(input.paths.summaryPath, `${summary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.preflightReportPath, (0, integrity_1.stableJson)(input.preflightReport), 'utf8'),
        fs.writeFile(input.paths.preflightSummaryPath, `${input.preflightSummary.trimEnd()}\n`, 'utf8'),
        fs.writeFile(latestPaths.latestProvenanceBundlePath, (0, integrity_1.stableJson)(bundle), 'utf8'),
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