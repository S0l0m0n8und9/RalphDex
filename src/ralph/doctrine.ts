import * as fs from 'fs/promises';
import * as path from 'path';
import { pathExists } from '../util/fs';

export type DoctrineHealth = 'healthy' | 'missing' | 'incomplete' | 'invalid evidence index';

export interface DoctrineDiagnostic {
  severity: 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
}

export interface DoctrineCreateOptions {
  generatedAt?: string;
}

export interface DoctrineCreationResult {
  doctrineDir: string;
  createdPaths: string[];
}

export interface DoctrineInspection {
  doctrineDir: string;
  health: DoctrineHealth;
  protectedFiles: string[];
  diagnostics: DoctrineDiagnostic[];
}

export const DOCTRINE_ROOT_RELATIVE = '.ralph/doctrine';

export const DOCTRINE_MARKDOWN_FILES = [
  'project-profile.md',
  'invariants.md',
  'boundaries.md',
  'workflows.md',
  'agents.md',
  'decisions.md',
  'risks.md',
  'open-questions.md'
] as const;

export const PROTECTED_DOCTRINE_FILES = [
  'invariants.md',
  'boundaries.md',
  'agents.md'
] as const;

type DoctrineMarkdownFile = typeof DOCTRINE_MARKDOWN_FILES[number];

const REQUIRED_HEADINGS: Record<DoctrineMarkdownFile, string[]> = {
  'project-profile.md': [
    'Purpose',
    'Current Understanding',
    'Source Of Truth',
    'Unknowns'
  ],
  'invariants.md': [
    'Purpose',
    'Source Of Truth',
    'Protected Status',
    'Invariants',
    'Candidate Invariants Pending Review'
  ],
  'boundaries.md': [
    'Purpose',
    'Source Of Truth',
    'Protected Status',
    'Explicit Non-Goals',
    'Trust And Safety Boundaries',
    'Candidate Boundaries Pending Review'
  ],
  'workflows.md': [
    'Purpose',
    'Source Of Truth',
    'Build',
    'Test',
    'Validate',
    'Release',
    'Unknowns'
  ],
  'agents.md': [
    'Purpose',
    'Source Of Truth',
    'Protected Status',
    'Working Rules',
    'Provider Boundaries',
    'Prompt Context Rules'
  ],
  'decisions.md': [
    'Purpose',
    'Source Of Truth',
    'Decisions',
    'Superseded Decisions'
  ],
  'risks.md': [
    'Purpose',
    'Source Of Truth',
    'Known Risks',
    'Watch Items'
  ],
  'open-questions.md': [
    'Purpose',
    'Source Of Truth',
    'Questions',
    'Resolved Questions'
  ]
};

const TEMPLATE_CONTENT: Record<DoctrineMarkdownFile, string> = {
  'project-profile.md': [
    '# Project Profile',
    '',
    '## Purpose',
    '',
    'Compact durable context about this project for future RalphDex workflows.',
    '',
    '## Current Understanding',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Source Of Truth',
    '',
    '- Human-maintained project files remain authoritative.',
    '- `.ralph/prd.md`, `.ralph/tasks.json`, and `.ralph/progress.md` remain the active Ralph planning and progress state.',
    '',
    '## Unknowns',
    '',
    '- Unknown / not yet captured.',
    ''
  ].join('\n'),
  'invariants.md': [
    '# Doctrine Invariants',
    '',
    '## Purpose',
    '',
    'Record durable project rules that should not change casually.',
    '',
    '## Source Of Truth',
    '',
    '- Human review is authoritative for protected doctrine.',
    '',
    '## Protected Status',
    '',
    '- Protected: yes.',
    '- RalphDex may scaffold and validate this file; providers must not rewrite it during normal task execution.',
    '',
    '## Invariants',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Candidate Invariants Pending Review',
    '',
    '- None.',
    ''
  ].join('\n'),
  'boundaries.md': [
    '# Doctrine Boundaries',
    '',
    '## Purpose',
    '',
    'Record non-goals and trust boundaries for this project.',
    '',
    '## Source Of Truth',
    '',
    '- Human review is authoritative for protected doctrine.',
    '',
    '## Protected Status',
    '',
    '- Protected: yes.',
    '- RalphDex may scaffold and validate this file; providers must not rewrite it during normal task execution.',
    '',
    '## Explicit Non-Goals',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Trust And Safety Boundaries',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Candidate Boundaries Pending Review',
    '',
    '- None.',
    ''
  ].join('\n'),
  'workflows.md': [
    '# Doctrine Workflows',
    '',
    '## Purpose',
    '',
    'Record compact project workflow facts once they are known.',
    '',
    '## Source Of Truth',
    '',
    '- Repository scripts, CI configuration, and human-maintained docs are authoritative.',
    '',
    '## Build',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Test',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Validate',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Release',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Unknowns',
    '',
    '- Unknown / not yet captured.',
    ''
  ].join('\n'),
  'agents.md': [
    '# Doctrine Agents',
    '',
    '## Purpose',
    '',
    'Record durable agent-facing rules for this project.',
    '',
    '## Source Of Truth',
    '',
    '- Human review is authoritative for protected doctrine.',
    '',
    '## Protected Status',
    '',
    '- Protected: yes.',
    '- RalphDex may scaffold and validate this file; providers must not rewrite it during normal task execution.',
    '',
    '## Working Rules',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Provider Boundaries',
    '',
    '- Providers must not directly rewrite protected doctrine during normal task execution.',
    '',
    '## Prompt Context Rules',
    '',
    '- Unknown / not yet captured.',
    ''
  ].join('\n'),
  'decisions.md': [
    '# Doctrine Decisions',
    '',
    '## Purpose',
    '',
    'Record accepted project decisions in compact form.',
    '',
    '## Source Of Truth',
    '',
    '- Human-maintained decision records and reviewed project changes are authoritative.',
    '',
    '## Decisions',
    '',
    '- None captured.',
    '',
    '## Superseded Decisions',
    '',
    '- None.',
    ''
  ].join('\n'),
  'risks.md': [
    '# Doctrine Risks',
    '',
    '## Purpose',
    '',
    'Record known project risks and watch items.',
    '',
    '## Source Of Truth',
    '',
    '- Human-maintained issue trackers, docs, and reviewed changes are authoritative.',
    '',
    '## Known Risks',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Watch Items',
    '',
    '- Unknown / not yet captured.',
    ''
  ].join('\n'),
  'open-questions.md': [
    '# Doctrine Open Questions',
    '',
    '## Purpose',
    '',
    'Record unresolved questions that affect future work.',
    '',
    '## Source Of Truth',
    '',
    '- Human answers and reviewed project docs are authoritative.',
    '',
    '## Questions',
    '',
    '- Unknown / not yet captured.',
    '',
    '## Resolved Questions',
    '',
    '- None.',
    ''
  ].join('\n')
};

export const DOCTRINE_CONTEXT_BUDGET_CHARS = 8000;

export interface DoctrineContextEntry {
  fileName: string;
  relativePath: string;
  content: string;
  isProtected: boolean;
  truncated: boolean;
}

export interface DoctrineContext {
  entries: DoctrineContextEntry[];
  totalChars: number;
  budgetChars: number;
  budgetExceeded: boolean;
}

export async function collectDoctrineContext(
  rootPath: string,
  budgetChars: number = DOCTRINE_CONTEXT_BUDGET_CHARS
): Promise<DoctrineContext> {
  const targetDir = doctrineDir(rootPath);

  if (!(await pathExists(targetDir))) {
    return { entries: [], totalChars: 0, budgetChars, budgetExceeded: false };
  }

  const perFileBudget = Math.floor(budgetChars / DOCTRINE_MARKDOWN_FILES.length);
  const protectedSet = new Set<string>(PROTECTED_DOCTRINE_FILES);
  const entries: DoctrineContextEntry[] = [];

  for (const fileName of DOCTRINE_MARKDOWN_FILES) {
    const filePath = path.join(targetDir, fileName);
    if (!(await pathExists(filePath))) {
      continue;
    }
    const raw = await fs.readFile(filePath, 'utf8');
    const truncated = raw.length > perFileBudget;
    entries.push({
      fileName,
      relativePath: relativeDoctrineFile(fileName),
      content: truncated ? raw.slice(0, perFileBudget) : raw,
      isProtected: protectedSet.has(fileName),
      truncated
    });
  }

  const totalChars = entries.reduce((sum, e) => sum + e.content.length, 0);
  return { entries, totalChars, budgetChars, budgetExceeded: totalChars >= budgetChars };
}

function doctrineDir(rootPath: string): string {
  return path.join(rootPath, '.ralph', 'doctrine');
}

function relativeDoctrineFile(fileName: string): string {
  return `${DOCTRINE_ROOT_RELATIVE}/${fileName}`;
}

function markdownHeadings(text: string): Set<string> {
  const headings = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      headings.add(match[1].trim());
    }
  }
  return headings;
}

function evidenceIndexHasMinimalShape(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return record.schemaVersion === 1
    && typeof record.generatedAt === 'string'
    && record.doctrineRoot === DOCTRINE_ROOT_RELATIVE
    && Array.isArray(record.evidence);
}

export async function createDoctrinePack(
  rootPath: string,
  options: DoctrineCreateOptions = {}
): Promise<DoctrineCreationResult> {
  const targetDir = doctrineDir(rootPath);
  const createdPaths: string[] = [];

  await fs.mkdir(targetDir, { recursive: true });

  for (const fileName of DOCTRINE_MARKDOWN_FILES) {
    const targetPath = path.join(targetDir, fileName);
    if (await pathExists(targetPath)) {
      continue;
    }
    await fs.writeFile(targetPath, TEMPLATE_CONTENT[fileName], 'utf8');
    createdPaths.push(targetPath);
  }

  const evidenceIndexPath = path.join(targetDir, 'evidence-index.json');
  if (!(await pathExists(evidenceIndexPath))) {
    const evidenceIndex = {
      schemaVersion: 1,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      doctrineRoot: DOCTRINE_ROOT_RELATIVE,
      evidence: []
    };
    await fs.writeFile(evidenceIndexPath, `${JSON.stringify(evidenceIndex, null, 2)}\n`, 'utf8');
    createdPaths.push(evidenceIndexPath);
  }

  return {
    doctrineDir: targetDir,
    createdPaths
  };
}

export async function inspectDoctrinePack(rootPath: string): Promise<DoctrineInspection> {
  const targetDir = doctrineDir(rootPath);
  const diagnostics: DoctrineDiagnostic[] = [];

  if (!(await pathExists(targetDir))) {
    return {
      doctrineDir: targetDir,
      health: 'missing',
      protectedFiles: [...PROTECTED_DOCTRINE_FILES],
      diagnostics: [{
        severity: 'warning',
        code: 'doctrine_directory_missing',
        message: 'Doctrine health: missing. .ralph/doctrine has not been created for this workspace.'
      }]
    };
  }

  for (const fileName of DOCTRINE_MARKDOWN_FILES) {
    const targetPath = path.join(targetDir, fileName);
    if (!(await pathExists(targetPath))) {
      diagnostics.push({
        severity: 'warning',
        code: 'doctrine_required_file_missing',
        file: relativeDoctrineFile(fileName),
        message: `Doctrine health: incomplete. Missing required doctrine file ${relativeDoctrineFile(fileName)}.`
      });
      continue;
    }

    const text = await fs.readFile(targetPath, 'utf8');
    const headings = markdownHeadings(text);
    for (const requiredHeading of REQUIRED_HEADINGS[fileName]) {
      if (!headings.has(requiredHeading)) {
        diagnostics.push({
          severity: 'warning',
          code: 'doctrine_required_heading_missing',
          file: relativeDoctrineFile(fileName),
          message: `Doctrine health: incomplete. ${relativeDoctrineFile(fileName)} is missing required heading "## ${requiredHeading}".`
        });
      }
    }
  }

  const evidenceIndexPath = path.join(targetDir, 'evidence-index.json');
  if (!(await pathExists(evidenceIndexPath))) {
    diagnostics.push({
      severity: 'warning',
      code: 'doctrine_required_file_missing',
      file: relativeDoctrineFile('evidence-index.json'),
      message: `Doctrine health: incomplete. Missing required doctrine file ${relativeDoctrineFile('evidence-index.json')}.`
    });
  } else {
    try {
      const parsed = JSON.parse(await fs.readFile(evidenceIndexPath, 'utf8'));
      if (!evidenceIndexHasMinimalShape(parsed)) {
        diagnostics.push({
          severity: 'warning',
          code: 'doctrine_evidence_index_invalid',
          file: relativeDoctrineFile('evidence-index.json'),
          message: 'Doctrine health: invalid evidence index. .ralph/doctrine/evidence-index.json does not have the expected minimal shape.'
        });
      }
    } catch {
      diagnostics.push({
        severity: 'warning',
        code: 'doctrine_evidence_index_invalid',
        file: relativeDoctrineFile('evidence-index.json'),
        message: 'Doctrine health: invalid evidence index. .ralph/doctrine/evidence-index.json is not valid JSON.'
      });
    }
  }

  const hasInvalidEvidenceIndex = diagnostics.some((diagnostic) => diagnostic.code === 'doctrine_evidence_index_invalid');
  if (hasInvalidEvidenceIndex) {
    return {
      doctrineDir: targetDir,
      health: 'invalid evidence index',
      protectedFiles: [...PROTECTED_DOCTRINE_FILES],
      diagnostics
    };
  }

  if (diagnostics.length > 0) {
    return {
      doctrineDir: targetDir,
      health: 'incomplete',
      protectedFiles: [...PROTECTED_DOCTRINE_FILES],
      diagnostics
    };
  }

  return {
    doctrineDir: targetDir,
    health: 'healthy',
    protectedFiles: [...PROTECTED_DOCTRINE_FILES],
    diagnostics: [{
      severity: 'info',
      code: 'doctrine_pack_healthy',
      message: 'Doctrine health: healthy. Required doctrine files, headings, protected-file rules, and evidence index are present.'
    }]
  };
}
