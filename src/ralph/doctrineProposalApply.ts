import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DOCTRINE_MARKDOWN_FILES,
  DOCTRINE_ROOT_RELATIVE,
  PROTECTED_DOCTRINE_FILES
} from './doctrine';
import type {
  DoctrineProposalArtifact,
  DoctrineProposedUpdate,
  DoctrineReviewAction
} from './doctrineProposals';

export interface DoctrineUpdateApplicationResult {
  updateIndex: number;
  success: boolean;
  fileChanged: string | null;
  warning: string | null;
  error: string | null;
}

export interface DoctrineProposalApplicationResult {
  action: DoctrineReviewAction;
  appliedUpdateIndexes: number[];
  rejectedUpdateIndexes: number[];
  filesChanged: string[];
  warnings: string[];
  errors: string[];
  updateResults: DoctrineUpdateApplicationResult[];
}

const KNOWN_DOCTRINE_FILENAMES = new Set<string>(DOCTRINE_MARKDOWN_FILES);
const PROTECTED_DOCTRINE_FILENAMES = new Set<string>(PROTECTED_DOCTRINE_FILES);

function resolveDoctrineFilePath(rootPath: string, targetFile: string): string | null {
  const normalized = targetFile.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized.startsWith(`${DOCTRINE_ROOT_RELATIVE}/`)) {
    return null;
  }
  const fileName = normalized.slice(`${DOCTRINE_ROOT_RELATIVE}/`.length);
  if (!KNOWN_DOCTRINE_FILENAMES.has(fileName)) {
    return null;
  }
  return path.join(rootPath, '.ralph', 'doctrine', fileName);
}

function isProtectedTarget(targetFile: string): boolean {
  const normalized = targetFile.replace(/\\/g, '/').replace(/^\.\//, '');
  const fileName = normalized.slice(`${DOCTRINE_ROOT_RELATIVE}/`.length);
  return PROTECTED_DOCTRINE_FILENAMES.has(fileName);
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function ensureSingleTrailingNewline(text: string): string {
  return `${text.trimEnd()}\n`;
}

function findSectionBoundaries(lines: string[], section: string): { headingIndex: number; bodyStart: number; bodyEnd: number } | null {
  const headingPattern = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:#*)\\s*$`);
  let headingIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      headingIndex = i;
      break;
    }
  }

  if (headingIndex === -1) {
    return null;
  }

  let bodyEnd = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      bodyEnd = i;
      break;
    }
  }

  return { headingIndex, bodyStart: headingIndex + 1, bodyEnd };
}

async function applyAppend(filePath: string, proposedText: string): Promise<{ warning: string | null; error: string | null }> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch {
    return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
  }

  const newContent = ensureSingleTrailingNewline(`${existing.trimEnd()}\n\n${proposedText}`);
  try {
    await fs.writeFile(filePath, newContent, 'utf8');
  } catch {
    return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
  }

  return { warning: null, error: null };
}

async function applyAddSectionItem(
  filePath: string,
  section: string,
  proposedText: string
): Promise<{ warning: string | null; error: string | null }> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch {
    return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
  }

  const lines = splitLines(existing);
  const boundaries = findSectionBoundaries(lines, section);

  if (!boundaries) {
    return {
      warning: null,
      error: `Section "## ${section}" not found in ${filePath}. Cannot add section item.`
    };
  }

  const bodyLines = lines.slice(boundaries.bodyStart, boundaries.bodyEnd);
  const bodyText = bodyLines.join('\n').trim();
  if (bodyText.includes(proposedText.trim())) {
    return {
      warning: `Proposed text already present in section "## ${section}" of ${filePath}. Skipping duplicate.`,
      error: null
    };
  }

  const insertLines = proposedText.trim().split(/\r?\n/);
  const before = lines.slice(0, boundaries.bodyEnd);
  const after = lines.slice(boundaries.bodyEnd);

  const trailingBlank = before.length > 0 && before[before.length - 1].trim() === '' ? [] : [''];
  const combined = [...before, ...trailingBlank, ...insertLines, ...after];

  try {
    await fs.writeFile(filePath, ensureSingleTrailingNewline(combined.join('\n')), 'utf8');
  } catch {
    return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
  }

  return { warning: null, error: null };
}

async function applyReplaceSection(
  filePath: string,
  section: string,
  proposedText: string
): Promise<{ warning: string | null; error: string | null }> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch {
    return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
  }

  const lines = splitLines(existing);
  const boundaries = findSectionBoundaries(lines, section);

  if (!boundaries) {
    return {
      warning: null,
      error: `Section "## ${section}" not found in ${filePath}. Cannot replace section.`
    };
  }

  const heading = lines[boundaries.headingIndex];
  const replacementLines = proposedText.trim().split(/\r?\n/);
  const before = lines.slice(0, boundaries.headingIndex);
  const after = lines.slice(boundaries.bodyEnd);

  const combined = [...before, heading, '', ...replacementLines, ...after];

  try {
    await fs.writeFile(filePath, ensureSingleTrailingNewline(combined.join('\n')), 'utf8');
  } catch {
    return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
  }

  return { warning: null, error: null };
}

async function applySingleUpdate(
  update: DoctrineProposedUpdate,
  index: number,
  rootPath: string
): Promise<DoctrineUpdateApplicationResult> {
  const filePath = resolveDoctrineFilePath(rootPath, update.targetFile);
  if (!filePath) {
    return {
      updateIndex: index,
      success: false,
      fileChanged: null,
      warning: null,
      error: `targetFile "${update.targetFile}" is not a known doctrine file. Update rejected.`
    };
  }

  let result: { warning: string | null; error: string | null };

  if (update.operation === 'append') {
    result = await applyAppend(filePath, update.proposedText);
  } else if (update.operation === 'addSectionItem') {
    result = await applyAddSectionItem(filePath, update.section!, update.proposedText);
  } else if (update.operation === 'replaceSection') {
    result = await applyReplaceSection(filePath, update.section!, update.proposedText);
  } else {
    return {
      updateIndex: index,
      success: false,
      fileChanged: null,
      warning: null,
      error: `Unknown operation "${(update as DoctrineProposedUpdate).operation}". Update rejected.`
    };
  }

  if (result.error) {
    return { updateIndex: index, success: false, fileChanged: null, warning: result.warning, error: result.error };
  }
  if (result.warning) {
    return { updateIndex: index, success: false, fileChanged: null, warning: result.warning, error: null };
  }

  return { updateIndex: index, success: true, fileChanged: update.targetFile, warning: null, error: null };
}

export async function applyDoctrineProposal(input: {
  proposal: DoctrineProposalArtifact;
  rootPath: string;
  selectedUpdateIndexes?: number[];
}): Promise<DoctrineProposalApplicationResult> {
  const { proposal, rootPath } = input;
  const selectedIndexes = input.selectedUpdateIndexes
    ?? proposal.updates.map((_, i) => i);

  const updateResults: DoctrineUpdateApplicationResult[] = [];
  const appliedUpdateIndexes: number[] = [];
  const rejectedUpdateIndexes: number[] = [];
  const filesChangedSet = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const index of selectedIndexes) {
    const update = proposal.updates[index];
    if (!update) {
      errors.push(`Update index ${index} is out of range. Skipping.`);
      rejectedUpdateIndexes.push(index);
      updateResults.push({ updateIndex: index, success: false, fileChanged: null, warning: null, error: `Update index ${index} is out of range.` });
      continue;
    }

    const result = await applySingleUpdate(update, index, rootPath);
    updateResults.push(result);

    if (result.success && result.fileChanged) {
      appliedUpdateIndexes.push(index);
      filesChangedSet.add(result.fileChanged);
    } else {
      rejectedUpdateIndexes.push(index);
      if (result.warning) {
        warnings.push(`Update ${index + 1}: ${result.warning}`);
      }
      if (result.error) {
        errors.push(`Update ${index + 1}: ${result.error}`);
      }
    }
  }

  let action: DoctrineReviewAction;
  if (appliedUpdateIndexes.length === 0) {
    action = 'rejected';
  } else if (rejectedUpdateIndexes.length === 0) {
    action = 'applied';
  } else {
    action = 'partiallyApplied';
  }

  return {
    action,
    appliedUpdateIndexes,
    rejectedUpdateIndexes,
    filesChanged: Array.from(filesChangedSet),
    warnings,
    errors,
    updateResults
  };
}

export function detectProtectedTargets(proposal: DoctrineProposalArtifact): string[] {
  return proposal.updates
    .filter((update) => isProtectedTarget(update.targetFile))
    .map((update) => update.targetFile);
}
