import {
  RalphCompletionReport,
  RalphCompletionReportRequestedStatus
} from './types';

export interface CompletionReportArtifact {
  schemaVersion: 1;
  kind: 'completionReport';
  status: 'applied' | 'rejected' | 'missing' | 'invalid';
  selectedTaskId: string | null;
  report: RalphCompletionReport | null;
  rawBlock: string | null;
  parseError: string | null;
  warnings: string[];
}

export interface ParsedCompletionReport {
  status: 'missing' | 'invalid' | 'parsed';
  report: RalphCompletionReport | null;
  rawBlock: string | null;
  parseError: string | null;
}

export function sanitizeCompletionText(value: string | undefined, maximumLength = 400): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/^\s*[-*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, maximumLength).trim();
}

export function isAllowedCompletionStatus(value: string): value is RalphCompletionReportRequestedStatus {
  return value === 'done' || value === 'blocked' || value === 'in_progress';
}

export function extractTrailingJsonObject(text: string): string | null {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith('}')) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '}') {
      depth += 1;
      continue;
    }

    if (char === '{') {
      depth -= 1;
      if (depth === 0) {
        const candidate = trimmed.slice(index);
        return candidate.trim();
      }
    }
  }

  return null;
}

export function parseCompletionReport(lastMessage: string): ParsedCompletionReport {
  const trimmed = lastMessage.trim();
  if (!trimmed) {
    return {
      status: 'missing',
      report: null,
      rawBlock: null,
      parseError: null
    };
  }

  const fencedMatch = /```json\s*([\s\S]*?)\s*```\s*$/i.exec(trimmed);
  const rawBlock = fencedMatch?.[1]?.trim() ?? extractTrailingJsonObject(trimmed);
  if (!rawBlock) {
    return {
      status: 'missing',
      report: null,
      rawBlock: null,
      parseError: null
    };
  }

  let candidate: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBlock);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Completion report must be a JSON object.');
    }
    candidate = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      status: 'invalid',
      report: null,
      rawBlock,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }

  if (typeof candidate.selectedTaskId !== 'string' || !candidate.selectedTaskId.trim()) {
    return {
      status: 'invalid',
      report: null,
      rawBlock,
      parseError: 'Completion report requires a non-empty selectedTaskId string.'
    };
  }
  if (typeof candidate.requestedStatus !== 'string' || !isAllowedCompletionStatus(candidate.requestedStatus)) {
    return {
      status: 'invalid',
      report: null,
      rawBlock,
      parseError: 'Completion report requestedStatus must be one of done, blocked, or in_progress.'
    };
  }
  if (candidate.needsHumanReview !== undefined && typeof candidate.needsHumanReview !== 'boolean') {
    return {
      status: 'invalid',
      report: null,
      rawBlock,
      parseError: 'Completion report needsHumanReview must be a boolean when provided.'
    };
  }

  const report: RalphCompletionReport = {
    selectedTaskId: candidate.selectedTaskId.trim(),
    requestedStatus: candidate.requestedStatus,
    progressNote: sanitizeCompletionText(typeof candidate.progressNote === 'string' ? candidate.progressNote : undefined),
    blocker: sanitizeCompletionText(typeof candidate.blocker === 'string' ? candidate.blocker : undefined),
    validationRan: sanitizeCompletionText(typeof candidate.validationRan === 'string' ? candidate.validationRan : undefined),
    needsHumanReview: typeof candidate.needsHumanReview === 'boolean' ? candidate.needsHumanReview : undefined
  };

  return {
    status: 'parsed',
    report,
    rawBlock,
    parseError: null
  };
}
