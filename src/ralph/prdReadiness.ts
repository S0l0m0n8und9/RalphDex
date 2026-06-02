import * as fs from 'fs/promises';
import * as path from 'path';
import { registerArtifactsBestEffort } from './artifactRegistry';
import { hashText, stableJson } from './integrity';

export type PrdReadinessSeverity = 'pass' | 'warning' | 'blocker';

export interface PrdReadinessDimension {
  id:
    | 'title'
    | 'overview'
    | 'goals'
    | 'scope'
    | 'non-goals'
    | 'success-criteria'
    | 'work-area-taskability'
    | 'acceptance-clarity'
    | 'validation-clarity'
    | 'sequencing-clarity'
    | 'unresolved-assumptions'
    | 'placeholder-vague-language';
  label: string;
  severity: PrdReadinessSeverity;
  message: string;
}

export interface PrdReadinessResult {
  schemaVersion: 1;
  kind: 'prdReadiness';
  generatedAt: string;
  prdHash: string;
  title: string | null;
  score: number;
  dimensions: PrdReadinessDimension[];
  blockers: string[];
  warnings: string[];
  workAreas: string[];
  blockedWorkAreas: string[];
}

export interface TaskGenerationPlanArtifact {
  schemaVersion: 1;
  kind: 'taskGenerationPlan';
  generatedAt: string;
  status: 'draft' | 'approved';
  prdHash: string;
  prdTitle: string | null;
  readinessScore: number;
  workAreas: string[];
  generatedTaskIds: string[];
  warnings: string[];
  blockedWorkAreas: string[];
}

const PLACEHOLDER_PATTERN = /\b(?:todo|tbd|placeholder|lorem ipsum|coming soon|fill in|xxx)\b/i;
const VAGUE_WORD_PATTERN = /\b(?:stuff|things|various|misc(?:ellaneous)?|somehow|maybe|soon|better|improve|optimize)\b/i;
const ASSUMPTION_PATTERN = /\b(?:assume|assumption|unknown|open question|to be decided|pending decision)\b/i;
const VALIDATION_PATTERN = /\b(?:validate|validation|test|tests|verify|verification|acceptance test|npm run|pnpm|yarn|dotnet test|pytest|go test)\b/i;
const SEQUENCING_PATTERN = /\b(?:phase|sequence|order|depends on|dependency|milestone|first|next|then|after)\b/i;
const ACCEPTANCE_PATTERN = /\b(?:acceptance criteria|definition of done|done when|success criteria)\b/i;

interface PrdSection {
  title: string;
  body: string;
}

function normalizeSectionTitle(title: string): string {
  return title
    .trim()
    .replace(/^[0-9]+[.)]\s*/, '')
    .replace(/[:\-\s]+$/, '')
    .toLowerCase();
}

function splitPrdSections(prdText: string): PrdSection[] {
  const lines = prdText.split(/\r?\n/);
  const sections: PrdSection[] = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentTitle === null) {
      return;
    }
    sections.push({
      title: currentTitle,
      body: currentBody.join('\n').trim()
    });
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1];
      currentBody = [];
      continue;
    }

    if (currentTitle !== null) {
      currentBody.push(line);
    }
  }

  flush();
  return sections;
}

function hasNamedSection(
  sections: PrdSection[],
  aliases: string[]
): PrdSection | null {
  const aliasSet = new Set(aliases.map((alias) => normalizeSectionTitle(alias)));
  for (const section of sections) {
    if (aliasSet.has(normalizeSectionTitle(section.title))) {
      return section;
    }
  }
  return null;
}

function addDimension(
  dimensions: PrdReadinessDimension[],
  id: PrdReadinessDimension['id'],
  label: string,
  severity: PrdReadinessSeverity,
  message: string
): void {
  dimensions.push({ id, label, severity, message });
}

function scoreFromDimensions(dimensions: PrdReadinessDimension[]): number {
  let score = 100;
  for (const dimension of dimensions) {
    if (dimension.severity === 'blocker') {
      score -= 12;
    } else if (dimension.severity === 'warning') {
      score -= 4;
    }
  }
  return Math.max(0, score);
}

export function analyzePrdReadiness(prdText: string): PrdReadinessResult {
  const trimmed = prdText.trim();
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = (lines.find((line) => line.startsWith('# ')) ?? '').replace(/^#\s+/, '').trim() || null;
  const sections = splitPrdSections(trimmed);
  const dimensions: PrdReadinessDimension[] = [];
  const canonicalSectionKeys = new Set([
    'overview',
    'goals',
    'objectives',
    'scope',
    'in scope',
    'non-goals',
    'non goals',
    'out of scope',
    'success criteria',
    'success metrics',
    'definition of done',
    'constraints',
    'requirements'
  ]);

  if (!title) {
    addDimension(dimensions, 'title', 'Title', 'blocker', 'PRD must include a specific top-level # title.');
  } else if (title.split(/\s+/).length < 3 || PLACEHOLDER_PATTERN.test(title)) {
    addDimension(dimensions, 'title', 'Title', 'warning', `PRD title "${title}" looks placeholder-heavy or too thin.`);
  } else {
    addDimension(dimensions, 'title', 'Title', 'pass', `PRD title "${title}" is present.`);
  }

  const overview = hasNamedSection(sections, ['Overview']);
  addDimension(
    dimensions,
    'overview',
    'Overview',
    overview ? 'pass' : 'blocker',
    overview ? 'Overview section is present.' : 'PRD is missing the required "## Overview" section.'
  );

  const goals = hasNamedSection(sections, ['Goals', 'Objectives']);
  addDimension(
    dimensions,
    'goals',
    'Goals',
    goals ? 'pass' : 'blocker',
    goals ? 'Goals section is present.' : 'PRD is missing the required "## Goals" section.'
  );

  const scope = hasNamedSection(sections, ['Scope', 'In Scope']);
  addDimension(
    dimensions,
    'scope',
    'Scope',
    scope ? 'pass' : 'blocker',
    scope ? 'Scope section is present.' : 'PRD is missing a concrete scope section.'
  );

  const nonGoals = hasNamedSection(sections, ['Non-Goals', 'Non Goals', 'Out of Scope']);
  addDimension(
    dimensions,
    'non-goals',
    'Non-Goals',
    nonGoals ? 'pass' : 'blocker',
    nonGoals ? 'Non-goals section is present.' : 'PRD is missing explicit non-goals.'
  );

  const successCriteria = hasNamedSection(sections, ['Success Criteria', 'Success Metrics', 'Definition of Done']);
  addDimension(
    dimensions,
    'success-criteria',
    'Success Criteria',
    successCriteria ? 'pass' : 'blocker',
    successCriteria ? 'Success criteria section is present.' : 'PRD is missing explicit success criteria.'
  );

  const workAreas = sections
    .filter((section) => !canonicalSectionKeys.has(normalizeSectionTitle(section.title)))
    .map((section) => section.title.trim());
  const blockedWorkAreas = sections
    .filter((section) => !canonicalSectionKeys.has(normalizeSectionTitle(section.title)))
    .filter((section) => section.body.split(/\s+/).filter(Boolean).length < 15 || PLACEHOLDER_PATTERN.test(section.body))
    .map((section) => section.title.trim());

  if (workAreas.length === 0) {
    addDimension(
      dimensions,
      'work-area-taskability',
      'Work-Area Taskability',
      'blocker',
      'PRD needs at least one actionable work-area section beyond Overview/Goals/Scope.'
    );
  } else if (blockedWorkAreas.length > 0) {
    addDimension(
      dimensions,
      'work-area-taskability',
      'Work-Area Taskability',
      'warning',
      `Work areas need more detail for task generation: ${blockedWorkAreas.join(', ')}.`
    );
  } else {
    addDimension(
      dimensions,
      'work-area-taskability',
      'Work-Area Taskability',
      'pass',
      `Detected ${workAreas.length} actionable work area(s).`
    );
  }

  if (ACCEPTANCE_PATTERN.test(trimmed)) {
    addDimension(dimensions, 'acceptance-clarity', 'Acceptance Clarity', 'pass', 'Acceptance/success language is present.');
  } else {
    addDimension(
      dimensions,
      'acceptance-clarity',
      'Acceptance Clarity',
      'blocker',
      'PRD lacks explicit acceptance-style done criteria for work areas.'
    );
  }

  if (VALIDATION_PATTERN.test(trimmed)) {
    addDimension(dimensions, 'validation-clarity', 'Validation Clarity', 'pass', 'Validation language is present.');
  } else {
    addDimension(
      dimensions,
      'validation-clarity',
      'Validation Clarity',
      'warning',
      'PRD does not describe how completion will be validated.'
    );
  }

  if (SEQUENCING_PATTERN.test(trimmed)) {
    addDimension(dimensions, 'sequencing-clarity', 'Sequencing Clarity', 'pass', 'Sequencing/dependency language is present.');
  } else {
    addDimension(
      dimensions,
      'sequencing-clarity',
      'Sequencing Clarity',
      'warning',
      'PRD does not clearly describe sequencing or dependencies between work areas.'
    );
  }

  const hasAssumptions = ASSUMPTION_PATTERN.test(trimmed);
  addDimension(
    dimensions,
    'unresolved-assumptions',
    'Unresolved Assumptions',
    hasAssumptions ? 'warning' : 'pass',
    hasAssumptions
      ? 'PRD still contains unresolved assumptions or open questions.'
      : 'No unresolved-assumption markers detected.'
  );

  const hasPlaceholderOrVague = PLACEHOLDER_PATTERN.test(trimmed) || VAGUE_WORD_PATTERN.test(trimmed);
  addDimension(
    dimensions,
    'placeholder-vague-language',
    'Placeholder/Vague Language',
    PLACEHOLDER_PATTERN.test(trimmed) ? 'blocker' : hasPlaceholderOrVague ? 'warning' : 'pass',
    PLACEHOLDER_PATTERN.test(trimmed)
      ? 'PRD still contains placeholder markers (TODO/TBD/etc.).'
      : hasPlaceholderOrVague
        ? 'PRD contains vague language that should be sharpened before task generation.'
        : 'No placeholder/vague-language issues detected.'
  );

  const blockers = dimensions
    .filter((dimension) => dimension.severity === 'blocker')
    .map((dimension) => `${dimension.label}: ${dimension.message}`);
  const warnings = dimensions
    .filter((dimension) => dimension.severity === 'warning')
    .map((dimension) => `${dimension.label}: ${dimension.message}`);

  return {
    schemaVersion: 1,
    kind: 'prdReadiness',
    generatedAt: new Date().toISOString(),
    prdHash: hashText(prdText),
    title,
    score: scoreFromDimensions(dimensions),
    dimensions,
    blockers,
    warnings,
    workAreas,
    blockedWorkAreas
  };
}

function buildPrdReadinessSummaryMarkdown(result: PrdReadinessResult): string {
  const lines: string[] = [
    '# PRD Readiness Summary',
    '',
    `- Generated: ${result.generatedAt}`,
    `- PRD hash: ${result.prdHash}`,
    `- Title: ${result.title ?? 'n/a'}`,
    `- Score: ${result.score}`,
    `- Blockers: ${result.blockers.length}`,
    `- Warnings: ${result.warnings.length}`,
    ''
  ];

  if (result.blockers.length > 0) {
    lines.push('## Blockers', '');
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  lines.push('## Dimensions', '');
  for (const dimension of result.dimensions) {
    lines.push(`- [${dimension.severity.toUpperCase()}] ${dimension.label}: ${dimension.message}`);
  }
  lines.push('');

  if (result.workAreas.length > 0) {
    lines.push('## Work Areas', '');
    for (const workArea of result.workAreas) {
      lines.push(`- ${workArea}`);
    }
    lines.push('');
  }

  if (result.blockedWorkAreas.length > 0) {
    lines.push('## Blocked Work Areas', '');
    for (const workArea of result.blockedWorkAreas) {
      lines.push(`- ${workArea}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export async function persistLatestPrdReadinessArtifacts(
  artifactDir: string,
  result: PrdReadinessResult
): Promise<{ jsonPath: string; summaryPath: string }> {
  await fs.mkdir(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, 'latest-prd-readiness.json');
  const summaryPath = path.join(artifactDir, 'latest-prd-readiness-summary.md');
  await fs.writeFile(jsonPath, stableJson(result), 'utf8');
  await fs.writeFile(summaryPath, buildPrdReadinessSummaryMarkdown(result), 'utf8');
  await registerArtifactsBestEffort(artifactDir, [
    { type: 'latest-prd-readiness', path: jsonPath, retentionClass: 'latest' },
    { type: 'latest-prd-readiness-summary', path: summaryPath, retentionClass: 'latest' }
  ]);
  return { jsonPath, summaryPath };
}

export async function persistTaskGenerationPlanArtifact(
  artifactDir: string,
  plan: TaskGenerationPlanArtifact
): Promise<{ latestPath: string; historyPath: string }> {
  await fs.mkdir(artifactDir, { recursive: true });
  const latestPath = path.join(artifactDir, 'latest-task-generation-plan.json');
  const historyDir = path.join(artifactDir, 'task-generation-plans');
  await fs.mkdir(historyDir, { recursive: true });
  const timestamp = plan.generatedAt.replace(/[:.]/g, '-');
  const historyPath = path.join(historyDir, `task-generation-plan-${timestamp}.json`);
  const payload = stableJson(plan);
  await fs.writeFile(latestPath, payload, 'utf8');
  await fs.writeFile(historyPath, payload, 'utf8');
  await registerArtifactsBestEffort(artifactDir, [
    { type: 'latest-task-generation-plan', path: latestPath, retentionClass: 'latest' },
    { type: 'task-generation-plan', path: historyPath, retentionClass: 'durable' }
  ]);
  return { latestPath, historyPath };
}

export async function readLatestTaskGenerationPlan(
  artifactDir: string
): Promise<TaskGenerationPlanArtifact | null> {
  const latestPath = path.join(artifactDir, 'latest-task-generation-plan.json');
  try {
    const raw = await fs.readFile(latestPath, 'utf8');
    const parsed = JSON.parse(raw) as TaskGenerationPlanArtifact;
    if (parsed?.kind !== 'taskGenerationPlan' || parsed.schemaVersion !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
