import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathExists } from '../util/fs';
import { DEFAULT_CONFIG } from '../config/defaults';

export interface DocsValidationIssue {
  code: string;
  filePath: string;
  message: string;
}

interface MarkdownHeading {
  depth: number;
  text: string;
  slug: string;
  line: number;
}

interface MarkdownLink {
  text: string;
  target: string;
  line: number;
}

interface ParsedMarkdown {
  headings: MarkdownHeading[];
  links: MarkdownLink[];
  nonEmptyLineCount: number;
}

interface DocRule {
  requiredHeadings: string[];
  requiredFragments?: string[];
  forbiddenFragments?: string[];
  maxNonEmptyLines?: number;
}

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
] as const;

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

const DOC_RULES: Record<string, DocRule> = {
  'AGENTS.md': {
    requiredHeadings: REQUIRED_AGENTS_HEADINGS,
    requiredFragments: [
      'AGENTS.md is a routing/control document',
      'focused doc that owns a rule'
    ],
    maxNonEmptyLines: 105
  },
  'README.md': {
    requiredHeadings: [],
    requiredFragments: [
      'Ralphdex: Add Task',
      'Ralphdex: Seed Tasks from Feature Request',
      'Ralphdex: Regenerate PRD',
      '.ralph/artifacts/task-seeding/',
      'flat version-2 backlog tasks',
      'UXrefresh/',
      'reference-only prototype',
      'src/webview/'
    ]
  },
  'docs/architecture.md': {
    requiredHeadings: [],
    requiredFragments: [
      'src/webview/',
      'src/ui/panelHtml.ts',
      'src/ui/sidebarHtml.ts',
      'test/ui/',
      'test/webview/',
      'UXrefresh/',
      'reference-only prototype'
    ]
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
      'one selected task and one Codex execution at a time',
      '.ralph/artifacts/task-seeding/',
      'flat top-level version-2 tasks'
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
      'Seed Flat Backlog Tasks',
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
      'blocked preflight',
      '.ralph/artifacts/task-seeding/task-seeding-<timestamp>.json',
      '`.ralph/tasks.json` unchanged',
      'flat version-2 backlog tasks'
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
      'check:ledger',
      '.ralph/artifacts/task-seeding/',
      'test/taskSeeder.test.ts',
      'test/commandShell.smoke.test.ts'
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
  },
  'docs/release-workflow.md': {
    requiredHeadings: [
      'Prerequisites',
      'Steps',
      'Rollback',
      'Environment variable reference'
    ],
    requiredFragments: [
      'npm run validate',
      'npm run package',
      'npm run publish:dry-run'
    ],
    forbiddenFragments: [
      'ralph-codex-vscode-starter'
    ]
  }
};

export async function validateRepositoryDocs(rootDir: string): Promise<DocsValidationIssue[]> {
  const issues: DocsValidationIssue[] = [];
  const repoRoot = path.resolve(rootDir);
  const markdownCache = new Map<string, { text: string; parsed: ParsedMarkdown }>();

  for (const relativePath of REQUIRED_DOCS) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!(await pathExists(absolutePath))) {
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
  await validateReleaseWorkflowAlignment({
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
const CHECKED_CONFIG_DEFAULTS: ReadonlyArray<{
  packageJsonPath: string[];
  expectedValue: unknown;
  label: string;
}> = [
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.promptBudgetProfile', 'default'],
    expectedValue: DEFAULT_CONFIG.promptBudgetProfile,
    label: 'ralphCodex.promptBudgetProfile'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.planningPass', 'default', 'enabled'],
    expectedValue: DEFAULT_CONFIG.planningPass.enabled,
    label: 'ralphCodex.planningPass.enabled'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.planningPass', 'default', 'mode'],
    expectedValue: DEFAULT_CONFIG.planningPass.mode,
    label: 'ralphCodex.planningPass.mode'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memoryStrategy', 'default'],
    expectedValue: DEFAULT_CONFIG.memoryStrategy,
    label: 'ralphCodex.memoryStrategy'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memoryWindowSize', 'default'],
    expectedValue: DEFAULT_CONFIG.memoryWindowSize,
    label: 'ralphCodex.memoryWindowSize'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.memorySummaryThreshold', 'default'],
    expectedValue: DEFAULT_CONFIG.memorySummaryThreshold,
    label: 'ralphCodex.memorySummaryThreshold'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.agentCount', 'default'],
    expectedValue: DEFAULT_CONFIG.agentCount,
    label: 'ralphCodex.agentCount'
  },
  {
    packageJsonPath: ['contributes', 'configuration', 'properties', 'ralphCodex.pipelineHumanGates', 'default'],
    expectedValue: DEFAULT_CONFIG.pipelineHumanGates,
    label: 'ralphCodex.pipelineHumanGates'
  }
];

/**
 * Patterns that indicate a description claims a default value. Each captures the
 * claimed default as group 1. This detects contradictions like a description saying
 * "default true" when the actual default is false.
 */
const DESCRIPTION_DEFAULT_PATTERNS: RegExp[] = [
  /\bdefault\s+(true|false)\b/i,
  /\(default:\s*(true|false)\)/i,
  /\bdefault[s]?\s+to\s+`?(true|false)`?/i
];

/**
 * Configuration keys where description text should be checked for
 * contradictions against the actual default value.
 */
const DESCRIPTION_CONTRADICTION_CHECKS: ReadonlyArray<{
  propertyKey: string;
  defaultPath: string[];
  label: string;
}> = [
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

async function validateConfigDefaults(input: {
  repoRoot: string;
  issues: DocsValidationIssue[];
}): Promise<void> {
  const packageJsonPath = path.join(input.repoRoot, 'package.json');
  if (!(await pathExists(packageJsonPath))) {
    input.issues.push({
      code: 'config_default_missing_package_json',
      filePath: 'package.json',
      message: 'package.json not found; cannot validate config defaults.'
    });
    return;
  }

  let packageJson: unknown;
  try {
    const text = await fs.readFile(packageJsonPath, 'utf8');
    packageJson = JSON.parse(text);
  } catch {
    input.issues.push({
      code: 'config_default_parse_error',
      filePath: 'package.json',
      message: 'Failed to parse package.json; cannot validate config defaults.'
    });
    return;
  }

  for (const check of CHECKED_CONFIG_DEFAULTS) {
    let node: unknown = packageJson;
    for (const key of check.packageJsonPath) {
      if (node === null || typeof node !== 'object' || !(key in (node as Record<string, unknown>))) {
        node = undefined;
        break;
      }
      node = (node as Record<string, unknown>)[key];
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

function validateDescriptionContradictions(
  packageJson: unknown,
  issues: DocsValidationIssue[]
): void {
  const props = resolveJsonPath(packageJson, ['contributes', 'configuration', 'properties']);
  if (props === undefined || typeof props !== 'object' || props === null) {
    return;
  }

  for (const check of DESCRIPTION_CONTRADICTION_CHECKS) {
    const entry = (props as Record<string, unknown>)[check.propertyKey];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const entryObj = entry as Record<string, unknown>;
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
    let actualDefault: unknown = entryObj['default'];
    for (const segment of check.defaultPath) {
      if (actualDefault !== null && typeof actualDefault === 'object') {
        actualDefault = (actualDefault as Record<string, unknown>)[segment];
      } else {
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

function resolveJsonPath(root: unknown, pathSegments: string[]): unknown {
  let node = root;
  for (const key of pathSegments) {
    if (node === null || typeof node !== 'object' || !(key in (node as Record<string, unknown>))) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export function formatDocsValidationReport(issues: DocsValidationIssue[]): string {
  if (issues.length === 0) {
    return 'Documentation validation passed.';
  }

  return [
    'Documentation validation failed:',
    ...issues.map((issue) => `- [${issue.code}] ${issue.filePath}: ${issue.message}`)
  ].join('\n');
}

async function validateAgentsSections(input: {
  repoRoot: string;
  markdownCache: Map<string, { text: string; parsed: ParsedMarkdown }>;
  issues: DocsValidationIssue[];
}): Promise<void> {
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

async function validateReadmeDocMap(input: {
  repoRoot: string;
  markdownCache: Map<string, { text: string; parsed: ParsedMarkdown }>;
  issues: DocsValidationIssue[];
}): Promise<void> {
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

async function validateLocalMarkdownLinks(input: {
  repoRoot: string;
  markdownCache: Map<string, { text: string; parsed: ParsedMarkdown }>;
  issues: DocsValidationIssue[];
}): Promise<void> {
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

      if (!(await pathExists(resolved.absoluteFilePath))) {
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

async function validateVerifierDocumentationAlignment(input: {
  repoRoot: string;
  markdownCache: Map<string, { text: string; parsed: ParsedMarkdown }>;
  issues: DocsValidationIssue[];
}): Promise<void> {
  const packageJsonPath = path.join(input.repoRoot, 'package.json');
  const ralphTypesPath = path.join(input.repoRoot, 'src/ralph/types.ts');
  const verifierDoc = input.markdownCache.get('docs/verifier.md');

  if (!(await pathExists(packageJsonPath)) || !(await pathExists(ralphTypesPath)) || !verifierDoc) {
    return;
  }

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
    contributes?: {
      configuration?: {
        properties?: {
          [key: string]: {
            items?: {
              enum?: string[];
            };
          };
        };
      };
    };
  };

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

async function validateReleaseWorkflowAlignment(input: {
  repoRoot: string;
  markdownCache: Map<string, { text: string; parsed: ParsedMarkdown }>;
  issues: DocsValidationIssue[];
}): Promise<void> {
  const packageJsonPath = path.join(input.repoRoot, 'package.json');
  const releaseWorkflow = input.markdownCache.get('docs/release-workflow.md');

  if (!(await pathExists(packageJsonPath)) || !releaseWorkflow) {
    return;
  }

  let packageJson: unknown;
  try {
    packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  } catch {
    return;
  }

  const scripts = resolveJsonPath(packageJson, ['scripts']);
  const publishDryRunScript = typeof (scripts as Record<string, unknown> | undefined)?.['publish:dry-run'] === 'string'
    ? (scripts as Record<string, string>)['publish:dry-run']
    : undefined;

  if (publishDryRunScript === undefined) {
    input.issues.push({
      code: 'missing_package_script',
      filePath: 'package.json',
      message: 'Missing required package script "publish:dry-run" for Marketplace release validation.'
    });
  } else {
    // Accept either vsce publish --dry-run (older vsce versions) or npm run package (newer vsce versions without --dry-run)
    const isVscePublishDryRun = publishDryRunScript.includes('vsce publish') && publishDryRunScript.includes('--dry-run');
    const isPackageEquivalent = publishDryRunScript.includes('npm run package');

    if (!isVscePublishDryRun && !isPackageEquivalent) {
      input.issues.push({
        code: 'invalid_package_script',
        filePath: 'package.json',
        message: 'Package script "publish:dry-run" must run either "vsce publish --dry-run" or "npm run package" to validate packaging.'
      });
    }

    // For vsce publish form, require --no-dependencies
    if (publishDryRunScript.includes('vsce publish') && !publishDryRunScript.includes('--no-dependencies')) {
      input.issues.push({
        code: 'invalid_package_script',
        filePath: 'package.json',
        message: 'Package script "publish:dry-run" must include --no-dependencies when using vsce publish.'
      });
    }
  }

  const requiredDocFragments = [
    '`npm run publish:dry-run`',
    'without shipping'
  ];
  for (const fragment of requiredDocFragments) {
    if (!releaseWorkflow.text.includes(fragment)) {
      input.issues.push({
        code: 'missing_release_validation_path',
        filePath: 'docs/release-workflow.md',
        message: `Release workflow must document the Marketplace dry-run validation path including ${fragment}.`
      });
    }
  }
  // Accept either the old vsce publish --dry-run form or new package form
  if (!releaseWorkflow.text.includes('vsce publish --dry-run --no-dependencies') &&
      !releaseWorkflow.text.includes('npm run package')) {
    input.issues.push({
      code: 'missing_release_validation_path',
      filePath: 'docs/release-workflow.md',
      message: 'Release workflow must document either "vsce publish --dry-run --no-dependencies" or "npm run package" for validation.'
    });
  }
}

function validateDocRule(input: {
  issues: DocsValidationIssue[];
  relativePath: string;
  text: string;
  parsed: ParsedMarkdown;
  rule: DocRule;
}): void {
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

  for (const fragment of input.rule.forbiddenFragments ?? []) {
    if (input.text.includes(fragment)) {
      input.issues.push({
        code: 'forbidden_fragment',
        filePath: input.relativePath,
        message: `Found forbidden text "${fragment}" — this path is obsolete and must not appear in this document.`
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

function validateRequiredCodeOwnerEntries(input: {
  sectionBody: string;
  issues: DocsValidationIssue[];
}): void {
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

async function validateRequiredSectionLinks(input: {
  repoRoot: string;
  sourcePath: string;
  sectionName: string;
  sectionBody: string;
  requiredTargets: string[];
  issues: DocsValidationIssue[];
}): Promise<void> {
  const sectionLinks = parseMarkdown(input.sectionBody).links;
  const resolvedTargets = new Set<string>();

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

async function validateBacktickedFileReferences(input: {
  repoRoot: string;
  sourcePath: string;
  sectionBody: string;
  issues: DocsValidationIssue[];
}): Promise<void> {
  for (const token of extractBacktickedFileReferences(input.sectionBody)) {
    const absolutePath = path.resolve(input.repoRoot, token);
    if (!(await pathExists(absolutePath))) {
      input.issues.push({
        code: 'missing_file_reference',
        filePath: input.sourcePath,
        message: `Referenced file does not exist: ${token}`
      });
    }
  }
}

function validateDocumentedListMatches(input: {
  sourcePath: string;
  sectionName: string;
  documentedValues: string[];
  expectedValues: string[];
  issues: DocsValidationIssue[];
}): void {
  const missing = input.expectedValues.filter((value) => !input.documentedValues.includes(value));
  const extra = input.documentedValues.filter((value) => !input.expectedValues.includes(value));

  if (missing.length === 0 && extra.length === 0) {
    return;
  }

  const detailParts: string[] = [];
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

function parseMarkdown(text: string): ParsedMarkdown {
  const headings: MarkdownHeading[] = [];
  const links: MarkdownLink[] = [];
  const lines = text.split(/\r?\n/);
  const slugCounts = new Map<string, number>();
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

function getSectionBody(text: string, headings: MarkdownHeading[], headingText: string): string | null {
  const sectionHeading = headings.find((heading) => heading.text === headingText);
  if (!sectionHeading) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const nextHeading = headings.find(
    (candidate) => candidate.line > sectionHeading.line && candidate.depth <= sectionHeading.depth
  );
  const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
  return lines.slice(sectionHeading.line, endLine).join('\n');
}

function extractBacktickedFileReferences(sectionBody: string): string[] {
  const matches = [...sectionBody.matchAll(/`([^`]+)`/g)];
  return matches
    .map((match) => match[1].trim())
    .filter((token) => isRepositoryFileReference(token));
}

function extractBulletCodeValues(sectionBody: string): string[] {
  return [...sectionBody.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
}

function isRepositoryFileReference(token: string): boolean {
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

function resolveLocalLink(input: {
  repoRoot: string;
  sourcePath: string;
  target: string;
}): { absoluteFilePath: string; anchor: string | null } | null {
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

function parseStringLiteralUnion(source: string, typeName: string): string[] {
  const unionMatch = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!unionMatch) {
    return [];
  }

  return [...unionMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function sameMembers(left: string[], right: string[]): boolean {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  if (leftSorted.length !== rightSorted.length) {
    return false;
  }

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function formatList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(', ');
}

function toRepoRelativePath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).replace(/\\/g, '/');
}

function toMarkdownSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`"]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

