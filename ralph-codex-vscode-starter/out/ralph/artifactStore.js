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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES = exports.PROTECTED_GENERATED_LATEST_POINTER_FILES = exports.PROTECTED_GENERATED_STATE_ROOT_REFERENCES = void 0;
exports.resolveIterationArtifactPaths = resolveIterationArtifactPaths;
exports.resolveProvenanceBundlePaths = resolveProvenanceBundlePaths;
exports.resolveLatestArtifactPaths = resolveLatestArtifactPaths;
exports.resolvePreflightArtifactPaths = resolvePreflightArtifactPaths;
exports.ensureIterationArtifactDirectory = ensureIterationArtifactDirectory;
exports.writePromptArtifacts = writePromptArtifacts;
exports.writeExecutionPlanArtifact = writeExecutionPlanArtifact;
exports.writeCliInvocationArtifact = writeCliInvocationArtifact;
exports.writePreflightArtifacts = writePreflightArtifacts;
exports.writeIterationArtifacts = writeIterationArtifacts;
exports.writeProvenanceBundle = writeProvenanceBundle;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const artifactRendering_1 = require("./artifactRendering");
const artifactRetention_1 = require("./artifactRetention");
// Re-export submodules for backward compatibility.
__exportStar(require("./artifactRendering"), exports);
__exportStar(require("./artifactRetention"), exports);
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
        diagnostics: input.report.diagnostics,
        sessionHandoff: input.sessionHandoff ?? null
    };
    const humanSummary = (0, artifactRendering_1.renderPreflightSummary)(persistedReport);
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
    const humanSummary = (0, artifactRendering_1.renderIterationSummary)({
        result: input.result,
        paths: input.paths,
        verifiers: input.verifierSummary,
        diffSummary: input.diffSummary
    });
    const latestResult = (0, artifactRendering_1.latestResultFromIteration)({
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
    const summary = (0, artifactRendering_1.renderProvenanceSummary)(bundle);
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
        const failureSummary = (0, artifactRendering_1.renderIntegrityFailureSummary)(input.failure);
        writes.push(fs.writeFile(input.paths.provenanceFailurePath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(input.paths.provenanceFailureSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8'), fs.writeFile(latestPaths.latestProvenanceFailurePath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(latestPaths.latestResultPath, (0, integrity_1.stableJson)(input.failure), 'utf8'), fs.writeFile(latestPaths.latestSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8'));
    }
    await Promise.all(writes);
    const retention = await (0, artifactRetention_1.cleanupProvenanceBundles)({
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