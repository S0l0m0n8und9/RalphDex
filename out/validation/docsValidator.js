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
exports.validateRepositoryDocs = validateRepositoryDocs;
exports.formatDocsValidationReport = formatDocsValidationReport;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fs_1 = require("../util/fs");
const defaults_1 = require("../config/defaults");
const REQUIRED_DOCS = [
    'AGENTS.md',
    'README.md',
    'docs/architecture.md',
    'docs/workflows.md',
    'docs/testing.md',
    'docs/invariants.md',
    'docs/provenance.md',
    'docs/verifier.md',
    'docs/boundaries.md',
    'docs/multi-agent-readiness.md',
    'docs/prompt-calibration.md',
    'docs/release-workflow.md',
    'docs/model-tiering.md',
    'docs/failure-recovery.md'
];
const REQUIRED_AGENTS_HEADINGS = [
    'Purpose',
    'Working Rules',
    'Authoritative Doc Map',
    'Code Owners For Behavior',
    'Command And Validation Entry Points',
    'Brief Codex Boundaries'
];
const REQUIRED_AGENTS_DOC_MAP_TARGETS = [
    'README.md',
    'docs/architecture.md',
    'docs/workflows.md',
    'docs/testing.md',
    'docs/invariants.md',
    'docs/provenance.md',
    'docs/verifier.md',
    'docs/boundaries.md',
    'docs/multi-agent-readiness.md',
    'docs/prompt-calibration.md'
];
const REQUIRED_README_DOC_MAP_TARGETS = [
    'AGENTS.md',
    'docs/architecture.md',
    'docs/workflows.md',
    'docs/testing.md',
    'docs/invariants.md',
    'docs/provenance.md',
    'docs/verifier.md',
    'docs/boundaries.md',
    'docs/multi-agent-readiness.md',
    'docs/prompt-calibration.md',
    'docs/release-workflow.md',
    'docs/failure-recovery.md'
];
const REQUIRED_CODE_OWNER_FILES = [
    'src/commands/registerCommands.ts',
    'src/prompt/promptBuilder.ts',
    'src/ralph/iterationEngine.ts',
    'src/ralph/completionReportParser.ts',
    'src/ralph/taskDecomposition.ts',
    'src/ralph/reconciliation.ts',
    'src/ralph/preflight.ts',
    'src/ralph/taskFile.ts',
    'src/ralph/verifier.ts',
    'src/ralph/loopLogic.ts',
    'src/ralph/integrity.ts',
    'src/ralph/artifactStore.ts',
    'src/codex/claudeCliProvider.ts'
];
const DOC_RULES = {
    'AGENTS.md': {
        requiredHeadings: REQUIRED_AGENTS_HEADINGS,
        requiredFragments: [
            'AGENTS.md is a routing/control document',
            'focused doc that owns a rule'
        ],
        maxNonEmptyLines: 104
    },
    'docs/invariants.md': {
        requiredHeadings: [
            'Durable Workspace Model',
            'Task Graph Invariants',
            'Preflight Invariants',
            'Iteration Model Invariants',
            'Artifact Model Invariants',
            'Retention And Cleanup Invariants'
        ],
        requiredFragments: [
            'must remain true',
            'control plane',
            'artifact model',
            'one selected task and one Codex execution at a time'
        ]
    },
    'docs/provenance.md': {
        requiredHeadings: [
            'Provenance Unit',
            'What Gets Bound Before Execution',
            'CLI Provenance Chain',
            'IDE Handoff Provenance Chain',
            'Integrity Failure Stages',
            'Run Bundle Contract',
            'What Operators Can Verify',
            'Epistemic Gap'
        ],
        requiredFragments: [
            'plans, prompts, invocations, and run bundles',
            'trusted record',
            "model's self-report",
            'epistemicGap',
            'unverified',
            'reconciliationWarnings',
            'verifier-summary.json',
            'authoritative evidence'
        ]
    },
    'docs/verifier.md': {
        requiredHeadings: [
            'Verifier Modes',
            'Verifier Artifacts',
            'Outcome Classifications',
            'No-Progress Detection',
            'Stop Reasons',
            'Precedence Rules',
            'Feedback Into The Next Prompt'
        ],
        requiredFragments: [
            'verifier modes',
            'outcome classifications',
            'loop stopping',
            'review behavior',
            'reproduce the blocker against the inherited validation command',
            'the next narrowed child should implement the smallest bounded fix for that reproduced blocker',
            'each child should describe one deterministic next step that can be validated with the parent\'s existing validation command'
        ]
    },
    'docs/boundaries.md': {
        requiredHeadings: [
            'Codex Product Boundary',
            'Trust Boundary',
            'Control-Plane Boundary',
            'Repository Layout And Workspace State',
            'Workspace And Runtime Boundary',
            'Git And Safety Boundary',
            'Testing Boundary'
        ],
        requiredFragments: [
            'explicitly does not try to do',
            'trust guarantees stop',
            'iteration/loop runner',
            'operator-local runtime state',
            'autonomyMode',
            'hard stops'
        ]
    },
    'docs/workflows.md': {
        requiredHeadings: [
            'Develop The Extension',
            'Package And Install A .vsix',
            'Prepare A Prompt For IDE Use',
            'Run One CLI Iteration',
            'Run The Ralph Loop',
            'Memory Strategy',
            'Azure AI Foundry Provider',
            'Inspect State',
            'Reset State',
            'Diagnostics'
        ],
        requiredFragments: [
            'Extensions: Install from VSIX...',
            'code --install-extension',
            'build a distributable `.vsix`',
            'autonomyMode',
            'hard stops',
            'blocked preflight'
        ]
    },
    'docs/testing.md': {
        requiredHeadings: [
            'Authoritative Commands',
            'What Is Covered',
            'Stub Smoke Vs Real Activation Smoke',
            'What Is Not Covered',
            'Test Runtime Notes',
            'Packaging Runtime'
        ],
        requiredFragments: [
            '`npm run package`',
            'manual `.vsix` install',
            'Node 20+',
            'check:ledger'
        ]
    },
    'docs/multi-agent-readiness.md': {
        requiredHeadings: [
            'Task Ownership',
            'Write Serialisation',
            'Remediation Isolation',
            'Lifting The Deferral'
        ],
        requiredFragments: [
            'acceptance criterion',
            'claims.json',
            'agentId',
            'npm run validate'
        ]
    },
    'docs/prompt-calibration.md': {
        requiredHeadings: [
            'Calibration Baseline',
            'Token Target Methodology',
            'Recalibration Procedure',
            'Reasoning Effort Overhead'
        ],
        requiredFragments: [
            'targetTokens',
            'reasoningEffort',
            'medium',
            'high',
            'context window'
        ]
    },
    'docs/model-tiering.md': {
        requiredHeadings: [
            'Enabling Model Tiering',
            'Scoring Signals',
            'Tier Thresholds',
            'Model And Provider Configuration',
            'Expected Cost Savings'
        ],
        requiredFragments: [
            'ralphCodex.enableModelTiering',
            'ralphCodex.complexityTierThresholds',
            'simpleThreshold',
            'complexThreshold'
        ]
    },
    'docs/failure-recovery.md': {
        requiredHeadings: [
            'Failure Category Taxonomy',
            'Recovery Playbooks',
            'Attempt Limits And Escalation',
            'Dead-Letter Queue',
            'Observability',
            'Diagnostic Cost'
        ],
        requiredFragments: [
            'failure-analysis.json',
            'recovery-state.json',
            'dead-letter.json',
            'diagnosticCost'
        ]
    }
};
async function validateRepositoryDocs(rootDir) {
    const issues = [];
    const repoRoot = path.resolve(rootDir);
    const markdownCache = new Map();
    for (const relativePath of REQUIRED_DOCS) {
        const absolutePath = path.join(repoRoot, relativePath);
        if (!(await (0, fs_1.pathExists)(absolutePath))) {
            issues.push({
                code: 'missing_required_doc',
                filePath: relativePath,
                message: `Required documentation file is missing: ${relativePath}`
            });
            continue;
        }
        const text = await fs.readFile(absolutePath, 'utf8');
        markdownCache.set(relativePath, {
            text,
            parsed: parseMarkdown(text)
        });
    }
    for (const [relativePath, rule] of Object.entries(DOC_RULES)) {
        const cached = markdownCache.get(relativePath);
        if (!cached) {
            continue;
        }
        validateDocRule({
            issues,
            relativePath,
            text: cached.text,
            parsed: cached.parsed,
            rule
        });
    }
    await validateAgentsSections({
        repoRoot,
        markdownCache,
        issues
    });
    await validateReadmeDocMap({
        repoRoot,
        markdownCache,
        issues
    });
    await validateLocalMarkdownLinks({
        repoRoot,
        markdownCache,
        issues
    });
    await validateVerifierDocumentationAlignment({
        repoRoot,
        markdownCache,
        issues
    });
    await validateConfigDefaults({ repoRoot, issues });
    return issues.sort((left, right) => {
        const fileOrder = left.filePath.localeCompare(right.filePath);
        if (fileOrder !== 0) {
            return fileOrder;
        }
        const codeOrder = left.code.localeCompare(right.code);
        if (codeOrder !== 0) {
            return codeOrder;
        }
        return left.message.localeCompare(right.message);
    });
}
/**
 * The set of package.json configuration keys whose `default` values must stay in sync
 * with src/config/defaults.ts. Each entry maps the package.json property path to the
 * expected value derived from DEFAULT_CONFIG.
 */
const CHECKED_CONFIG_DEFAULTS = [
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.promptBudgetProfile', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.promptBudgetProfile,
        label: 'ralphCodex.promptBudgetProfile'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.planningPass', 'default', 'enabled'],
        expectedValue: defaults_1.DEFAULT_CONFIG.planningPass.enabled,
        label: 'ralphCodex.planningPass.enabled'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.planningPass', 'default', 'mode'],
        expectedValue: defaults_1.DEFAULT_CONFIG.planningPass.mode,
        label: 'ralphCodex.planningPass.mode'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memoryStrategy', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.memoryStrategy,
        label: 'ralphCodex.memoryStrategy'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memoryWindowSize', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.memoryWindowSize,
        label: 'ralphCodex.memoryWindowSize'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memorySummaryThreshold', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.memorySummaryThreshold,
        label: 'ralphCodex.memorySummaryThreshold'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.agentCount', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.agentCount,
        label: 'ralphCodex.agentCount'
    },
    {
        packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.pipelineHumanGates', 'default'],
        expectedValue: defaults_1.DEFAULT_CONFIG.pipelineHumanGates,
        label: 'ralphCodex.pipelineHumanGates'
    }
];
/**
 * Patterns that indicate a description claims a default value. Each captures the
 * claimed default as group 1. This detects contradictions like a description saying
 * "default true" when the actual default is false.
 */
const DESCRIPTION_DEFAULT_PATTERNS = [
    /\bdefault\s+(true|false)\b/i,
    /\(default:\s*(true|false)\)/i,
    /\bdefault[s]?\s+to\s+`?(true|false)`?/i
];
/**
 * Configuration keys where description text should be checked for
 * contradictions against the actual default value.
 */
const DESCRIPTION_CONTRADICTION_CHECKS = [
    {
        propertyKey: 'ralphCodex.planningPass',
        defaultPath: ['enabled'],
        label: 'ralphCodex.planningPass.enabled'
    },
    {
        propertyKey: 'ralphCodex.memoryStrategy',
        defaultPath: [],
        label: 'ralphCodex.memoryStrategy'
    },
    {
        propertyKey: 'ralphCodex.memorySummaryThreshold',
        defaultPath: [],
        label: 'ralphCodex.memorySummaryThreshold'
    },
    {
        propertyKey: 'ralphCodex.pipelineHumanGates',
        defaultPath: [],
        label: 'ralphCodex.pipelineHumanGates'
    }
];
/** Phrases that must not appear in a description when the feature is implemented. */
const STALE_PLACEHOLDER_PHRASES = [
    'reserved for future use',
    'placeholder for a future',
    'behaves like verbatim for now'
];
async function validateConfigDefaults(input) {
    const packageJsonPath = path.join(input.repoRoot, 'package.json');
    if (!(await (0, fs_1.pathExists)(packageJsonPath))) {
        input.issues.push({
            code: 'config_default_missing_package_json',
            filePath: 'package.json',
            message: 'package.json not found; cannot validate config defaults.'
        });
        return;
    }
    let packageJson;
    try {
        const text = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(text);
    }
    catch {
        input.issues.push({
            code: 'config_default_parse_error',
            filePath: 'package.json',
            message: 'Failed to parse package.json; cannot validate config defaults.'
        });
        return;
    }
    for (const check of CHECKED_CONFIG_DEFAULTS) {
        let node = packageJson;
        for (const key of check.packageJsonPath) {
            if (node === null || typeof node !== 'object' || !(key in node)) {
                node = undefined;
                break;
            }
            node = node[key];
        }
        if (node === undefined) {
            input.issues.push({
                code: 'config_default_missing',
                filePath: 'package.json',
                message: `Missing default for ${check.label} at path ${check.packageJsonPath.join('.')}. Expected ${JSON.stringify(check.expectedValue)}.`
            });
            continue;
        }
        if (node !== check.expectedValue) {
            input.issues.push({
                code: 'config_default_mismatch',
                filePath: 'package.json',
                message: `Default for ${check.label} in package.json is ${JSON.stringify(node)} but src/config/defaults.ts has ${JSON.stringify(check.expectedValue)}. Align them to fix this drift.`
            });
        }
    }
    validateDescriptionContradictions(packageJson, input.issues);
}
function validateDescriptionContradictions(packageJson, issues) {
    const props = resolveJsonPath(packageJson, ['contributes', 'configuration', 'properties']);
    if (props === undefined || typeof props !== 'object' || props === null) {
        return;
    }
    for (const check of DESCRIPTION_CONTRADICTION_CHECKS) {
        const entry = props[check.propertyKey];
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const entryObj = entry;
        const description = typeof entryObj['description'] === 'string' ? entryObj['description'] : '';
        // Check for stale placeholder phrases
        for (const phrase of STALE_PLACEHOLDER_PHRASES) {
            if (description.toLowerCase().includes(phrase.toLowerCase())) {
                issues.push({
                    code: 'config_description_stale_placeholder',
                    filePath: 'package.json',
                    message: `Description for ${check.label} contains stale placeholder text "${phrase}". Update the description to reflect the current implementation.`
                });
            }
        }
        // Check for boolean default contradictions in description text
        let actualDefault = entryObj['default'];
        for (const segment of check.defaultPath) {
            if (actualDefault !== null && typeof actualDefault === 'object') {
                actualDefault = actualDefault[segment];
            }
            else {
                actualDefault = undefined;
                break;
            }
        }
        if (typeof actualDefault !== 'boolean') {
            continue;
        }
        for (const pattern of DESCRIPTION_DEFAULT_PATTERNS) {
            const match = pattern.exec(description);
            if (!match) {
                continue;
            }
            const claimedDefault = match[1].toLowerCase() === 'true';
            if (claimedDefault !== actualDefault) {
                issues.push({
                    code: 'config_description_default_contradiction',
                    filePath: 'package.json',
                    message: `Description for ${check.label} claims default is ${claimedDefault} but the actual default is ${actualDefault}. Align the description text with the manifest default.`
                });
            }
        }
    }
}
function resolveJsonPath(root, pathSegments) {
    let node = root;
    for (const key of pathSegments) {
        if (node === null || typeof node !== 'object' || !(key in node)) {
            return undefined;
        }
        node = node[key];
    }
    return node;
}
function formatDocsValidationReport(issues) {
    if (issues.length === 0) {
        return 'Documentation validation passed.';
    }
    return [
        'Documentation validation failed:',
        ...issues.map((issue) => `- [${issue.code}] ${issue.filePath}: ${issue.message}`)
    ].join('\n');
}
async function validateAgentsSections(input) {
    const agents = input.markdownCache.get('AGENTS.md');
    if (!agents) {
        return;
    }
    const docMapBody = getSectionBody(agents.text, agents.parsed.headings, 'Authoritative Doc Map');
    if (docMapBody !== null) {
        await validateRequiredSectionLinks({
            repoRoot: input.repoRoot,
            sourcePath: 'AGENTS.md',
            sectionName: 'Authoritative Doc Map',
            sectionBody: docMapBody,
            requiredTargets: REQUIRED_AGENTS_DOC_MAP_TARGETS,
            issues: input.issues
        });
    }
    const codeOwnersBody = getSectionBody(agents.text, agents.parsed.headings, 'Code Owners For Behavior');
    if (codeOwnersBody !== null) {
        validateRequiredCodeOwnerEntries({
            sectionBody: codeOwnersBody,
            issues: input.issues
        });
        await validateBacktickedFileReferences({
            repoRoot: input.repoRoot,
            sourcePath: 'AGENTS.md',
            sectionBody: codeOwnersBody,
            issues: input.issues
        });
    }
    const commandsBody = getSectionBody(agents.text, agents.parsed.headings, 'Command And Validation Entry Points');
    if (commandsBody !== null) {
        await validateBacktickedFileReferences({
            repoRoot: input.repoRoot,
            sourcePath: 'AGENTS.md',
            sectionBody: commandsBody,
            issues: input.issues
        });
    }
}
async function validateReadmeDocMap(input) {
    const readme = input.markdownCache.get('README.md');
    if (!readme) {
        return;
    }
    const documentMapBody = getSectionBody(readme.text, readme.parsed.headings, 'Document Map');
    if (documentMapBody === null) {
        input.issues.push({
            code: 'missing_section',
            filePath: 'README.md',
            message: 'Missing required section "Document Map".'
        });
        return;
    }
    await validateRequiredSectionLinks({
        repoRoot: input.repoRoot,
        sourcePath: 'README.md',
        sectionName: 'Document Map',
        sectionBody: documentMapBody,
        requiredTargets: REQUIRED_README_DOC_MAP_TARGETS,
        issues: input.issues
    });
}
async function validateLocalMarkdownLinks(input) {
    for (const [sourcePath, cached] of input.markdownCache.entries()) {
        for (const link of cached.parsed.links) {
            const resolved = resolveLocalLink({
                repoRoot: input.repoRoot,
                sourcePath,
                target: link.target
            });
            if (resolved === null) {
                continue;
            }
            if (!resolved.absoluteFilePath.startsWith(input.repoRoot)) {
                input.issues.push({
                    code: 'link_outside_repo',
                    filePath: sourcePath,
                    message: `Link target points outside the repository: ${link.target}`
                });
                continue;
            }
            if (!(await (0, fs_1.pathExists)(resolved.absoluteFilePath))) {
                input.issues.push({
                    code: 'broken_link',
                    filePath: sourcePath,
                    message: `Broken local link target: ${link.target}`
                });
                continue;
            }
            if (!resolved.anchor) {
                continue;
            }
            if (path.extname(resolved.absoluteFilePath) !== '.md') {
                input.issues.push({
                    code: 'invalid_anchor_target',
                    filePath: sourcePath,
                    message: `Anchor target must point to a Markdown file: ${link.target}`
                });
                continue;
            }
            const targetRelativePath = toRepoRelativePath(input.repoRoot, resolved.absoluteFilePath);
            let target = input.markdownCache.get(targetRelativePath);
            if (!target) {
                const text = await fs.readFile(resolved.absoluteFilePath, 'utf8');
                target = {
                    text,
                    parsed: parseMarkdown(text)
                };
                input.markdownCache.set(targetRelativePath, target);
            }
            const availableAnchors = new Set(target.parsed.headings.map((heading) => heading.slug));
            if (!availableAnchors.has(resolved.anchor)) {
                input.issues.push({
                    code: 'broken_anchor',
                    filePath: sourcePath,
                    message: `Broken anchor target: ${link.target}`
                });
            }
        }
    }
}
async function validateVerifierDocumentationAlignment(input) {
    const packageJsonPath = path.join(input.repoRoot, 'package.json');
    const ralphTypesPath = path.join(input.repoRoot, 'src/ralph/types.ts');
    const verifierDoc = input.markdownCache.get('docs/verifier.md');
    if (!(await (0, fs_1.pathExists)(packageJsonPath)) || !(await (0, fs_1.pathExists)(ralphTypesPath)) || !verifierDoc) {
        return;
    }
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const packageVerifierModes = packageJson.contributes?.configuration?.properties?.['ralphCodex.verifierModes']?.items?.enum;
    if (!Array.isArray(packageVerifierModes) || packageVerifierModes.length === 0) {
        input.issues.push({
            code: 'missing_verifier_mode_enum',
            filePath: 'package.json',
            message: 'Could not resolve package.json verifier mode enum.'
        });
        return;
    }
    const typeSource = await fs.readFile(ralphTypesPath, 'utf8');
    const typeVerifierModes = parseStringLiteralUnion(typeSource, 'RalphVerifierId');
    const typeStopReasons = parseStringLiteralUnion(typeSource, 'RalphStopReason');
    if (!sameMembers(packageVerifierModes, typeVerifierModes)) {
        input.issues.push({
            code: 'verifier_mode_mismatch',
            filePath: 'package.json',
            message: `package.json verifier modes ${formatList(packageVerifierModes)} do not match RalphVerifierId ${formatList(typeVerifierModes)}.`
        });
    }
    const verifierModesSection = getSectionBody(verifierDoc.text, verifierDoc.parsed.headings, 'Verifier Modes');
    const stopReasonsSection = getSectionBody(verifierDoc.text, verifierDoc.parsed.headings, 'Stop Reasons');
    if (verifierModesSection !== null) {
        const documentedModes = extractBulletCodeValues(verifierModesSection);
        validateDocumentedListMatches({
            sourcePath: 'docs/verifier.md',
            sectionName: 'Verifier Modes',
            documentedValues: documentedModes,
            expectedValues: packageVerifierModes,
            issues: input.issues
        });
    }
    if (stopReasonsSection !== null) {
        const documentedStopReasons = extractBulletCodeValues(stopReasonsSection);
        validateDocumentedListMatches({
            sourcePath: 'docs/verifier.md',
            sectionName: 'Stop Reasons',
            documentedValues: documentedStopReasons,
            expectedValues: typeStopReasons,
            issues: input.issues
        });
    }
}
function validateDocRule(input) {
    const availableHeadings = new Set(input.parsed.headings.map((heading) => heading.text));
    for (const heading of input.rule.requiredHeadings) {
        if (!availableHeadings.has(heading)) {
            input.issues.push({
                code: 'missing_heading',
                filePath: input.relativePath,
                message: `Missing required heading "${heading}".`
            });
        }
    }
    for (const fragment of input.rule.requiredFragments ?? []) {
        if (!input.text.includes(fragment)) {
            input.issues.push({
                code: 'missing_fragment',
                filePath: input.relativePath,
                message: `Missing required text fragment "${fragment}".`
            });
        }
    }
    if (input.rule.maxNonEmptyLines !== undefined && input.parsed.nonEmptyLineCount > input.rule.maxNonEmptyLines) {
        input.issues.push({
            code: 'line_budget_exceeded',
            filePath: input.relativePath,
            message: `Expected at most ${input.rule.maxNonEmptyLines} non-empty lines, found ${input.parsed.nonEmptyLineCount}. Keep this file focused.`
        });
    }
}
function validateRequiredCodeOwnerEntries(input) {
    for (const requiredFile of REQUIRED_CODE_OWNER_FILES) {
        const bullet = `- \`${requiredFile}\`:`;
        if (!input.sectionBody.includes(bullet)) {
            input.issues.push({
                code: 'missing_code_owner_entry',
                filePath: 'AGENTS.md',
                message: `Missing code-owner entry for ${requiredFile}.`
            });
        }
    }
}
async function validateRequiredSectionLinks(input) {
    const sectionLinks = parseMarkdown(input.sectionBody).links;
    const resolvedTargets = new Set();
    for (const link of sectionLinks) {
        const resolved = resolveLocalLink({
            repoRoot: input.repoRoot,
            sourcePath: input.sourcePath,
            target: link.target
        });
        if (resolved === null) {
            continue;
        }
        resolvedTargets.add(toRepoRelativePath(input.repoRoot, resolved.absoluteFilePath));
    }
    for (const requiredTarget of input.requiredTargets) {
        if (!resolvedTargets.has(requiredTarget)) {
            input.issues.push({
                code: 'missing_doc_map_entry',
                filePath: input.sourcePath,
                message: `Section "${input.sectionName}" must link to ${requiredTarget}.`
            });
        }
    }
}
async function validateBacktickedFileReferences(input) {
    for (const token of extractBacktickedFileReferences(input.sectionBody)) {
        const absolutePath = path.resolve(input.repoRoot, token);
        if (!(await (0, fs_1.pathExists)(absolutePath))) {
            input.issues.push({
                code: 'missing_file_reference',
                filePath: input.sourcePath,
                message: `Referenced file does not exist: ${token}`
            });
        }
    }
}
function validateDocumentedListMatches(input) {
    const missing = input.expectedValues.filter((value) => !input.documentedValues.includes(value));
    const extra = input.documentedValues.filter((value) => !input.expectedValues.includes(value));
    if (missing.length === 0 && extra.length === 0) {
        return;
    }
    const detailParts = [];
    if (missing.length > 0) {
        detailParts.push(`missing ${formatList(missing)}`);
    }
    if (extra.length > 0) {
        detailParts.push(`unexpected ${formatList(extra)}`);
    }
    input.issues.push({
        code: 'stale_documented_list',
        filePath: input.sourcePath,
        message: `Section "${input.sectionName}" is out of sync with code definitions: ${detailParts.join('; ')}.`
    });
}
function parseMarkdown(text) {
    const headings = [];
    const links = [];
    const lines = text.split(/\r?\n/);
    const slugCounts = new Map();
    let nonEmptyLineCount = 0;
    for (const [index, line] of lines.entries()) {
        if (line.trim().length > 0) {
            nonEmptyLineCount += 1;
        }
        const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (headingMatch) {
            const headingText = headingMatch[2].trim();
            const baseSlug = toMarkdownSlug(headingText);
            const seenCount = slugCounts.get(baseSlug) ?? 0;
            slugCounts.set(baseSlug, seenCount + 1);
            headings.push({
                depth: headingMatch[1].length,
                text: headingText,
                slug: seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount}`,
                line: index + 1
            });
        }
        const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        for (const match of line.matchAll(linkPattern)) {
            const matchIndex = match.index ?? 0;
            if (matchIndex > 0 && line[matchIndex - 1] === '!') {
                continue;
            }
            links.push({
                text: match[1],
                target: match[2],
                line: index + 1
            });
        }
    }
    return {
        headings,
        links,
        nonEmptyLineCount
    };
}
function getSectionBody(text, headings, headingText) {
    const sectionHeading = headings.find((heading) => heading.text === headingText);
    if (!sectionHeading) {
        return null;
    }
    const lines = text.split(/\r?\n/);
    const nextHeading = headings.find((candidate) => candidate.line > sectionHeading.line && candidate.depth <= sectionHeading.depth);
    const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
    return lines.slice(sectionHeading.line, endLine).join('\n');
}
function extractBacktickedFileReferences(sectionBody) {
    const matches = [...sectionBody.matchAll(/`([^`]+)`/g)];
    return matches
        .map((match) => match[1].trim())
        .filter((token) => isRepositoryFileReference(token));
}
function extractBulletCodeValues(sectionBody) {
    return [...sectionBody.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
}
function isRepositoryFileReference(token) {
    if (token.includes(' ') || token.includes('(') || token.includes('=') || token.includes(':')) {
        return false;
    }
    if (token.endsWith('/')) {
        return false;
    }
    if (token === 'AGENTS.md' || token === 'README.md' || token === 'package.json') {
        return true;
    }
    return /^(docs|src|test|scripts|prompt-templates|\.ralph)\//.test(token)
        || /\.(md|json|ts|js|sh|cjs)$/.test(token);
}
function resolveLocalLink(input) {
    const trimmedTarget = input.target.trim();
    if (trimmedTarget.length === 0) {
        return null;
    }
    if (/^(https?|mailto):/i.test(trimmedTarget)) {
        return null;
    }
    if (/^[a-z]+:/i.test(trimmedTarget) && !path.isAbsolute(trimmedTarget)) {
        return null;
    }
    const [pathPart, anchorPart] = trimmedTarget.split('#', 2);
    const basePath = path.join(input.repoRoot, input.sourcePath);
    const absoluteFilePath = pathPart
        ? path.isAbsolute(pathPart)
            ? path.normalize(pathPart)
            : path.resolve(path.dirname(basePath), pathPart)
        : basePath;
    return {
        absoluteFilePath,
        anchor: anchorPart ? toMarkdownSlug(anchorPart) : null
    };
}
function parseStringLiteralUnion(source, typeName) {
    const unionMatch = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
    if (!unionMatch) {
        return [];
    }
    return [...unionMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
function sameMembers(left, right) {
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    if (leftSorted.length !== rightSorted.length) {
        return false;
    }
    return leftSorted.every((value, index) => value === rightSorted[index]);
}
function formatList(values) {
    return values.map((value) => `"${value}"`).join(', ');
}
function toRepoRelativePath(rootDir, targetPath) {
    return path.relative(rootDir, targetPath).replace(/\\/g, '/');
}
function toMarkdownSlug(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[`"]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
}
//# sourceMappingURL=docsValidator.js.map