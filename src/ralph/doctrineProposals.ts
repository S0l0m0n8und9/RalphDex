import * as path from 'path';
import {
  DOCTRINE_MARKDOWN_FILES,
  DOCTRINE_ROOT_RELATIVE,
  PROTECTED_DOCTRINE_FILES
} from './doctrine';

export type DoctrineProposalSource = 'completionReport' | 'manual' | 'diagnostic' | 'unknown';
export type DoctrineProposalRisk = 'low' | 'medium' | 'high';
export type DoctrineProposalOperation = 'append' | 'replaceSection' | 'addSectionItem';

export interface DoctrineProposedUpdate {
  targetFile: string;
  operation: DoctrineProposalOperation;
  section: string | null;
  proposedText: string;
  rationale: string;
  evidence: string[];
  requiresApproval: boolean;
  protectedTarget: boolean;
  risk: DoctrineProposalRisk;
}

export interface DoctrineProposalArtifact {
  schemaVersion: 1;
  kind: 'doctrineUpdateProposal';
  proposalId: string;
  createdAt: string;
  provenanceId: string | null;
  iteration: number | null;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  source: DoctrineProposalSource;
  status: 'proposed';
  risk: DoctrineProposalRisk;
  summary: string;
  updates: DoctrineProposedUpdate[];
  warnings: string[];
}

export interface ParsedDoctrineProposalUpdates {
  updates: DoctrineProposedUpdate[];
  warnings: string[];
}

const ALLOWED_OPERATIONS = new Set<DoctrineProposalOperation>(['append', 'replaceSection', 'addSectionItem']);
const KNOWN_DOCTRINE_TARGETS = new Set(
  DOCTRINE_MARKDOWN_FILES.map((fileName) => `${DOCTRINE_ROOT_RELATIVE}/${fileName}`)
);
const PROTECTED_DOCTRINE_TARGETS = new Set(
  PROTECTED_DOCTRINE_FILES.map((fileName) => `${DOCTRINE_ROOT_RELATIVE}/${fileName}`)
);

const MAX_PROPOSED_TEXT_LENGTH = 4000;
const WARN_PROPOSED_TEXT_LENGTH = 1200;
const MAX_RATIONALE_LENGTH = 1600;
const WARN_RATIONALE_LENGTH = 600;
const MAX_EVIDENCE_ITEMS = 8;
const WARN_EVIDENCE_ITEMS = 4;
const MAX_EVIDENCE_ITEM_LENGTH = 400;

function normalizeTargetFile(value: string): string | null {
  const trimmed = value.trim().replace(/\\/g, '/');
  if (!trimmed) {
    return null;
  }

  const withoutLeadingDotSlash = trimmed.replace(/^\.\//, '');
  const normalized = path.posix.normalize(withoutLeadingDotSlash);
  if (!normalized.startsWith(`${DOCTRINE_ROOT_RELATIVE}/`)) {
    return null;
  }

  return KNOWN_DOCTRINE_TARGETS.has(normalized) ? normalized : null;
}

function normalizeOptionalSection(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoundedText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized || normalized.length > maximumLength) {
    return null;
  }

  return normalized;
}

function parseEvidence(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_ITEMS) {
    return null;
  }

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > MAX_EVIDENCE_ITEM_LENGTH) {
      return null;
    }
    normalized.push(trimmed);
  }

  return normalized;
}

function maxRisk(left: DoctrineProposalRisk, right: DoctrineProposalRisk): DoctrineProposalRisk {
  const order: Record<DoctrineProposalRisk, number> = { low: 0, medium: 1, high: 2 };
  return order[left] >= order[right] ? left : right;
}

function classifyDoctrineUpdate(update: Omit<DoctrineProposedUpdate, 'requiresApproval' | 'protectedTarget' | 'risk'>): DoctrineProposedUpdate {
  const protectedTarget = PROTECTED_DOCTRINE_TARGETS.has(update.targetFile);
  let risk: DoctrineProposalRisk = protectedTarget ? 'high' : 'low';

  if (update.operation === 'replaceSection' && risk === 'low') {
    risk = 'medium';
  }

  return {
    ...update,
    requiresApproval: protectedTarget,
    protectedTarget,
    risk
  };
}

function summarizeProposalUpdates(updates: DoctrineProposedUpdate[]): string {
  const uniqueTargets = Array.from(new Set(updates.map((update) => update.targetFile)));
  if (updates.length === 1) {
    return `1 proposed doctrine update for ${uniqueTargets[0]}.`;
  }

  return `${updates.length} proposed doctrine updates across ${uniqueTargets.length} doctrine file(s).`;
}

function parseDoctrineUpdate(
  candidate: unknown,
  index: number
): { update: DoctrineProposedUpdate | null; warnings: string[]; error: string | null } {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: expected an object.`
    };
  }

  const record = candidate as Record<string, unknown>;
  const targetFile = typeof record.targetFile === 'string'
    ? normalizeTargetFile(record.targetFile)
    : null;
  if (!targetFile) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: targetFile must reference a known doctrine file under ${DOCTRINE_ROOT_RELATIVE}/.`
    };
  }

  if (typeof record.operation !== 'string' || !ALLOWED_OPERATIONS.has(record.operation as DoctrineProposalOperation)) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: operation must be one of append, replaceSection, or addSectionItem.`
    };
  }

  const operation = record.operation as DoctrineProposalOperation;
  const section = normalizeOptionalSection(record.section);
  if ((operation === 'replaceSection' || operation === 'addSectionItem') && !section) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: ${operation} requires a non-empty section.`
    };
  }

  const proposedText = normalizeBoundedText(record.proposedText, MAX_PROPOSED_TEXT_LENGTH);
  if (!proposedText) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: proposedText must be non-empty and at most ${MAX_PROPOSED_TEXT_LENGTH} characters.`
    };
  }

  const rationale = normalizeBoundedText(record.rationale, MAX_RATIONALE_LENGTH);
  if (!rationale) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: rationale must be non-empty and at most ${MAX_RATIONALE_LENGTH} characters.`
    };
  }

  const evidence = parseEvidence(record.evidence);
  if (!evidence) {
    return {
      update: null,
      warnings: [],
      error: `Ignored invalid doctrineUpdates[${index}]: evidence must be a non-empty array of short strings.`
    };
  }

  const warnings: string[] = [];
  if (proposedText.length > WARN_PROPOSED_TEXT_LENGTH) {
    warnings.push(
      `Doctrine update ${index + 1} proposedText is unusually long (${proposedText.length} chars).`
    );
  }
  if (rationale.length > WARN_RATIONALE_LENGTH) {
    warnings.push(
      `Doctrine update ${index + 1} rationale is unusually long (${rationale.length} chars).`
    );
  }
  if (evidence.length > WARN_EVIDENCE_ITEMS) {
    warnings.push(
      `Doctrine update ${index + 1} includes ${evidence.length} evidence entries; review for unnecessary breadth.`
    );
  }

  return {
    update: classifyDoctrineUpdate({
      targetFile,
      operation,
      section,
      proposedText,
      rationale,
      evidence
    }),
    warnings,
    error: null
  };
}

export function parseDoctrineUpdatesFromCompletionReport(candidate: unknown): ParsedDoctrineProposalUpdates {
  if (candidate === undefined) {
    return { updates: [], warnings: [] };
  }

  if (!Array.isArray(candidate)) {
    return {
      updates: [],
      warnings: ['Ignored invalid doctrineUpdates: expected an array.']
    };
  }

  const updates: DoctrineProposedUpdate[] = [];
  const warnings: string[] = [];

  candidate.forEach((entry, index) => {
    const parsed = parseDoctrineUpdate(entry, index);
    if (parsed.update) {
      updates.push(parsed.update);
    }
    if (parsed.error) {
      warnings.push(parsed.error);
    }
    warnings.push(...parsed.warnings);
  });

  return { updates, warnings };
}

export function createDoctrineProposalArtifact(input: {
  provenanceId: string | null;
  iteration: number | null;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  source: DoctrineProposalSource;
  updates: DoctrineProposedUpdate[];
  createdAt?: string;
  proposalId?: string;
  warnings?: string[];
}): DoctrineProposalArtifact {
  const risk = input.updates.reduce<DoctrineProposalRisk>(
    (current, update) => maxRisk(current, update.risk),
    'low'
  );
  const proposalId = input.proposalId
    ?? `doctrine-proposal-${input.provenanceId ?? `iteration-${input.iteration ?? 'unknown'}`}`;

  return {
    schemaVersion: 1,
    kind: 'doctrineUpdateProposal',
    proposalId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    selectedTaskId: input.selectedTaskId,
    selectedTaskTitle: input.selectedTaskTitle,
    source: input.source,
    status: 'proposed',
    risk,
    summary: summarizeProposalUpdates(input.updates),
    updates: input.updates,
    warnings: input.warnings ?? []
  };
}
