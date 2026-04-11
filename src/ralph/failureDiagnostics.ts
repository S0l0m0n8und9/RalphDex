import * as fs from 'fs/promises';
import * as path from 'path';
import type { FailureCategoryId } from './types';

export interface FailureAnalysis {
  schemaVersion: 1;
  kind: 'failureAnalysis';
  taskId: string;
  createdAt: string;
  rootCauseCategory: FailureCategoryId;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  suggestedAction: string;
  retryPromptAddendum?: string;
}

const TRANSIENT_PATTERNS: RegExp[] = [
  /network\s+error/i,
  /lock\s+contention/i,
  /process\s+timeout/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /socket\s+hang\s+up/i,
  /ECONNRESET/
];

/**
 * Checks whether a failure signal string matches known transient failure patterns.
 * Returns 'transient' when matched, null otherwise.
 */
export function classifyTransientFailure(signal: string): FailureCategoryId | null {
  return TRANSIENT_PATTERNS.some((p) => p.test(signal)) ? 'transient' : null;
}

/**
 * Parses a FailureAnalysis from a diagnostic CLI response.
 * Accepts a fenced ```json block or raw JSON. Returns null when the response
 * is absent, malformed, or missing required fields.
 */
export function parseFailureDiagnosticResponse(text: string): FailureAnalysis | null {
  if (!text || !text.trim()) {
    return null;
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  const VALID_CATEGORIES: readonly FailureCategoryId[] = [
    'transient', 'implementation_error', 'task_ambiguity',
    'validation_mismatch', 'dependency_missing', 'environment_issue'
  ];
  const VALID_CONFIDENCES = ['high', 'medium', 'low'] as const;

  const rootCauseCategory = typeof record.rootCauseCategory === 'string'
    && VALID_CATEGORIES.includes(record.rootCauseCategory as FailureCategoryId)
    ? (record.rootCauseCategory as FailureCategoryId)
    : null;

  const confidence = typeof record.confidence === 'string'
    && VALID_CONFIDENCES.includes(record.confidence as 'high' | 'medium' | 'low')
    ? (record.confidence as 'high' | 'medium' | 'low')
    : null;

  const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
  const suggestedAction = typeof record.suggestedAction === 'string' ? record.suggestedAction.trim() : '';

  if (!rootCauseCategory || !confidence || !summary || !suggestedAction) {
    return null;
  }

  const retryPromptAddendum = typeof record.retryPromptAddendum === 'string' && record.retryPromptAddendum.trim()
    ? record.retryPromptAddendum.trim()
    : undefined;

  return {
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId: typeof record.taskId === 'string' ? record.taskId : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    rootCauseCategory,
    confidence,
    summary,
    suggestedAction,
    retryPromptAddendum
  };
}

/** Returns the path where the failure-analysis.json artifact is stored for a task. */
export function getFailureAnalysisPath(artifactsDir: string, taskId: string): string {
  return path.join(artifactsDir, taskId, 'failure-analysis.json');
}

/**
 * Builds the failure diagnostic prompt sent to the CLI.
 *
 * Provides the task context, a truncated view of the last iteration's
 * prompt and response, and the failure signal so the model can classify
 * the root cause.
 */
export function buildFailureDiagnosticPrompt(opts: {
  taskId: string;
  taskTitle: string;
  lastIterationPrompt: string;
  lastMessage: string;
  failureSignal: string;
  recentHistory: Array<{ iteration: number; completionClassification?: string; verificationStatus?: string }>;
}): string {
  const MAX_PROMPT_CHARS = 2000;
  const MAX_MESSAGE_CHARS = 2000;

  const truncatedPrompt = opts.lastIterationPrompt.length > MAX_PROMPT_CHARS
    ? opts.lastIterationPrompt.slice(0, MAX_PROMPT_CHARS) + '\n...[truncated]'
    : opts.lastIterationPrompt;

  const truncatedMessage = opts.lastMessage.length > MAX_MESSAGE_CHARS
    ? opts.lastMessage.slice(0, MAX_MESSAGE_CHARS) + '\n...[truncated]'
    : opts.lastMessage;

  const historyLines = opts.recentHistory
    .slice(0, 3)
    .map((h) => `  - Iteration ${h.iteration}: classification=${h.completionClassification ?? 'unknown'}, verification=${h.verificationStatus ?? 'unknown'}`)
    .join('\n');

  return [
    'You are a failure-analysis agent. Classify the root cause of the following Ralph task failure.',
    '',
    `Task ID: ${opts.taskId}`,
    `Task Title: ${opts.taskTitle}`,
    '',
    '## Last iteration prompt (truncated)',
    truncatedPrompt,
    '',
    '## Last iteration response (truncated)',
    truncatedMessage,
    '',
    '## Failure signal',
    opts.failureSignal,
    '',
    '## Recent iteration history',
    historyLines || '  (none)',
    '',
    'Respond with ONLY a valid JSON object (no markdown fences) in this exact schema:',
    '{',
    '  "rootCauseCategory": "transient" | "implementation_error" | "task_ambiguity" | "validation_mismatch" | "dependency_missing" | "environment_issue",',
    '  "confidence": "high" | "medium" | "low",',
    '  "summary": "<one sentence describing the root cause>",',
    '  "suggestedAction": "<one sentence recommending the next step>",',
    '  "retryPromptAddendum": "<optional extra context to add to the next retry prompt>"',
    '}'
  ].join('\n');
}

/** Writes a FailureAnalysis artifact to `.ralph/artifacts/<taskId>/failure-analysis.json`. */
export async function writeFailureAnalysis(
  artifactsDir: string,
  taskId: string,
  analysis: FailureAnalysis
): Promise<string> {
  const taskArtifactDir = path.join(artifactsDir, taskId);
  await fs.mkdir(taskArtifactDir, { recursive: true });
  const filePath = getFailureAnalysisPath(artifactsDir, taskId);
  await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf8');
  return filePath;
}
