import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { buildPrompt, createArtifactBaseName, createPromptFileName, decidePromptKind } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { RalphStateManager } from './stateManager';
import { createProvenanceId, hashJson, hashText, utf8ByteLength } from './integrity';
import { deriveRootPolicy } from './rootPolicy';
import {
  RalphCompletionReport,
  RalphCompletionReportRequestedStatus,
  RalphCliInvocation,
  RalphDiffSummary,
  RalphExecutionPlan,
  RalphIntegrityFailure,
  RalphIterationResult,
  RalphLoopDecision,
  RalphPersistedPreflightReport,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptTarget,
  RalphProvenanceBundle,
  RalphRootPolicy,
  RalphProvenanceTrustLevel,
  RalphRunMode,
  RalphRunRecord,
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphTaskRemediationArtifact,
  RalphTaskRemediationHistoryEntry,
  RalphWorkspaceState
} from './types';
import { countTaskStatuses, findTaskById, remainingSubtasks, selectNextTask } from './taskFile';
import { buildTaskRemediation, classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation } from './loopLogic';
import {
  buildBlockingPreflightMessage,
  buildPreflightReport,
  inspectPreflightArtifactReadiness,
  renderPreflightReport
} from './preflight';
import {
  captureCoreState,
  captureGitStatus,
  chooseValidationCommand,
  GitStatusSnapshot,
  inspectValidationCommandReadiness,
  normalizeValidationCommand,
  RalphCoreStateSnapshot,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier
} from './verifier';
import {
  cleanupGeneratedArtifacts,
  resolveIterationArtifactPaths,
  resolveProvenanceBundlePaths,
  resolvePreflightArtifactPaths,
  writeCliInvocationArtifact,
  writeExecutionPlanArtifact,
  writeProvenanceBundle,
  writePromptArtifacts,
  writeIterationArtifacts,
  writePreflightArtifacts
} from './artifactStore';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

interface PreparedPromptContext {
  config: RalphCodexConfig;
  rootPath: string;
  rootPolicy: RalphRootPolicy;
  state: RalphWorkspaceState;
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  provenanceId: string;
  trustLevel: RalphProvenanceTrustLevel;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  promptSelectionReason: string;
  promptPath: string;
  promptTemplatePath: string;
  promptEvidence: RalphPromptEvidence;
  executionPlan: RalphExecutionPlan;
  executionPlanHash: string;
  executionPlanPath: string;
  prompt: string;
  iteration: number;
  objectiveText: string;
  progressText: string;
  tasksText: string;
  taskFile: RalphTaskFile;
  taskCounts: RalphTaskCounts;
  summary: Awaited<ReturnType<typeof scanWorkspace>>;
  selectedTask: RalphTask | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  persistedPreflightReport: RalphPersistedPreflightReport;
  preflightSummaryText: string;
  provenanceBundlePaths: ReturnType<typeof resolveProvenanceBundlePaths>;
  createdPaths: string[];
}

export interface PreparedIterationContext extends PreparedPromptContext {
  beforeCoreState: RalphCoreStateSnapshot;
  beforeGit: GitStatusSnapshot;
  phaseSeed: Pick<RalphIterationResult['phaseTimestamps'], 'inspectStartedAt' | 'inspectFinishedAt' | 'taskSelectedAt' | 'promptGeneratedAt'>;
}

export interface RalphIterationEngineHooks {
  beforeCliExecutionIntegrityCheck?: (prepared: PreparedIterationContext) => Promise<void>;
}

export interface PreparedPrompt extends PreparedPromptContext {}

export interface RalphIterationRunSummary {
  prepared: PreparedPrompt;
  result: RalphIterationResult;
  loopDecision: RalphLoopDecision;
  createdPaths: string[];
}

interface CompletionReportArtifact {
  schemaVersion: 1;
  kind: 'completionReport';
  status: 'applied' | 'rejected' | 'missing' | 'invalid';
  selectedTaskId: string | null;
  report: RalphCompletionReport | null;
  rawBlock: string | null;
  parseError: string | null;
  warnings: string[];
}

interface ParsedCompletionReport {
  status: 'missing' | 'invalid' | 'parsed';
  report: RalphCompletionReport | null;
  rawBlock: string | null;
  parseError: string | null;
}

interface CompletionReconciliationOutcome {
  artifact: CompletionReportArtifact;
  selectedTask: RalphTask | null;
  progressChanged: boolean;
  taskFileChanged: boolean;
  warnings: string[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeLastMessage(lastMessage: string, exitCode: number | null): string {
  return lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}

function remediationRationale(result: RalphIterationResult): string {
  if (!result.remediation) {
    return 'No remediation proposal was recorded.';
  }

  switch (result.remediation.action) {
    case 'decompose_task':
      return 'Ralph saw repeated same-task attempts with no relevant file changes and no durable task/progress movement.';
    case 'reframe_task':
      return 'Ralph saw the same validation-backed failure signature repeat on the same selected task.';
    case 'mark_blocked':
      return 'Ralph saw the selected task remain blocked across consecutive attempts.';
    case 'request_human_review':
      return 'Ralph saw the same selected task fail repeatedly without evidence for a safe automatic retry strategy.';
    case 'no_action':
    default:
      return 'Ralph saw repeated stop evidence, but the recorded signals did not justify a stronger automatic remediation.';
  }
}

const MAX_REMEDIATION_CHILD_TASKS = 3;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decomposePhrase(value: string): string {
  return value
    .replace(/^(add|implement|build|create|fix|update|improve|refactor)\s+/i, '')
    .replace(/\s+for\s+/i, ' for ')
    .trim();
}

function isClearlyCompoundTask(task: RalphTask): boolean {
  const title = normalizeWhitespace(task.title.toLowerCase());
  const notes = normalizeWhitespace(task.notes?.toLowerCase() ?? '');
  const combined = [title, notes].filter(Boolean).join(' ');

  return /\b(and|plus|along with|together with|then)\b/.test(combined)
    || title.includes(',')
    || /\bfrom\b.+\bthrough\b/.test(combined)
    || /\bsmall proposed child-task set with dependencies\b/.test(combined);
}

function deriveCompoundSegments(task: RalphTask): string[] {
  const normalizedTitle = normalizeWhitespace(task.title);
  const segments = normalizedTitle
    .split(/\s+(?:and|plus|along with|together with|then)\s+/i)
    .map((segment) => decomposePhrase(segment))
    .filter((segment) => segment.length > 0);

  if (segments.length >= 2) {
    return segments.slice(0, MAX_REMEDIATION_CHILD_TASKS);
  }

  const notes = normalizeWhitespace(task.notes ?? '');
  if (notes) {
    const noteSegments = notes
      .split(/[.;]/)
      .map((segment) => normalizeWhitespace(segment))
      .filter((segment) => /\b(generate|keep|limit|propose|dependency|deterministic|verification)\b/i.test(segment))
      .slice(0, MAX_REMEDIATION_CHILD_TASKS);
    if (noteSegments.length >= 2) {
      return noteSegments.map((segment) => decomposePhrase(segment));
    }
  }

  return [];
}

function buildDecompositionProposal(task: RalphTask, result: RalphIterationResult): RalphSuggestedChildTask[] {
  if (!isClearlyCompoundTask(task)) {
    return [];
  }

  const validation = result.verification.effectiveValidationCommand ?? task.validation ?? null;
  const inheritedDependencies = (task.dependsOn ?? []).map((taskId) => ({
    taskId,
    reason: 'inherits_parent_dependency' as const
  }));
  const taskPrefix = task.id;
  const segments = deriveCompoundSegments(task);
  const seedSegments = segments.length >= 2
    ? segments
    : [
      'reproduce the blocker with a deterministic verification target',
      'implement the smallest bounded fix for that reproduced blocker',
      'rerun verification and capture the bounded evidence'
    ];
  const limitedSegments = seedSegments.slice(0, MAX_REMEDIATION_CHILD_TASKS);

  return limitedSegments.map((segment, index) => ({
    id: `${taskPrefix}.${index + 1}`,
    title: segment.charAt(0).toUpperCase() + segment.slice(1),
    parentId: task.id,
    dependsOn: [
      ...inheritedDependencies,
      ...(index === 0 ? [] : [{ taskId: `${taskPrefix}.${index}`, reason: 'blocks_sequence' as const }])
    ],
    validation,
    rationale: index === 0
      ? `Narrow ${task.id} to a deterministic first step before retrying the parent task.`
      : `Keep the proposal one level deep by sequencing the next bounded step after ${taskPrefix}.${index}.`
  }));
}

function remediationSuggestedChildTasks(taskFile: RalphTaskFile, result: RalphIterationResult): RalphSuggestedChildTask[] {
  const selectedTask = findTaskById(taskFile, result.selectedTaskId);
  const validationSignature = result.verification.validationFailureSignature;

  switch (result.remediation?.action) {
    case 'decompose_task':
      return selectedTask ? buildDecompositionProposal(selectedTask, result) : [];
    case 'reframe_task':
      return selectedTask
        ? [{
          id: `${selectedTask.id}.1`,
          title: `Reproduce and explain the validation failure for ${selectedTask.id}`,
          parentId: selectedTask.id,
          dependsOn: (selectedTask.dependsOn ?? []).map((taskId) => ({
            taskId,
            reason: 'inherits_parent_dependency' as const
          })),
          validation: result.verification.effectiveValidationCommand ?? selectedTask.validation ?? null,
          rationale: validationSignature
            ? `Focus the retry on the repeated validation signature ${validationSignature}.`
            : `Focus the retry on a single deterministic failure for ${selectedTask.id}.`
        }]
        : [];
    case 'mark_blocked':
      return selectedTask
        ? [{
          id: `${selectedTask.id}.1`,
          title: `Capture the missing unblocker for ${selectedTask.id}`,
          parentId: selectedTask.id,
          dependsOn: (selectedTask.dependsOn ?? []).map((taskId) => ({
            taskId,
            reason: 'inherits_parent_dependency' as const
          })),
          validation: null,
          rationale: `Document the external dependency or precondition before retrying ${selectedTask.id}.`
        }]
        : [];
    default:
      return [];
  }
}

function normalizeRemediationForTask(
  taskFile: RalphTaskFile,
  result: RalphIterationResult
): RalphIterationResult['remediation'] {
  const remediation = result.remediation;
  if (!remediation) {
    return null;
  }

  if (remediation.action !== 'decompose_task') {
    return remediation;
  }

  const suggestedChildTasks = remediationSuggestedChildTasks(taskFile, result);
  if (suggestedChildTasks.length > 0) {
    return remediation;
  }

  return {
    ...remediation,
    action: 'no_action',
    humanReviewRecommended: false,
    summary: `Task ${result.selectedTaskId ?? 'none'} repeated the same stop condition ${remediation.attemptCount} times, but the recorded evidence does not justify an automatic remediation change.`
  };
}

function remediationMatchesStopReason(
  result: RalphIterationResult,
  stopReason: RalphIterationResult['stopReason'],
  currentSignature: string | null
): boolean {
  if (!stopReason || !result.selectedTaskId) {
    return false;
  }

  if (stopReason === 'repeated_no_progress') {
    return result.completionClassification === 'no_progress';
  }

  if (stopReason === 'repeated_identical_failure') {
    if (result.completionClassification === 'blocked') {
      return true;
    }

    return ['blocked', 'failed', 'needs_human_review'].includes(result.completionClassification)
      && result.verification.validationFailureSignature !== null
      && result.verification.validationFailureSignature === currentSignature;
  }

  return false;
}

function remediationHistoryEntries(
  currentResult: RalphIterationResult,
  previousIterations: RalphIterationResult[]
): RalphTaskRemediationHistoryEntry[] {
  const stopReason = currentResult.stopReason;
  const taskId = currentResult.selectedTaskId;
  if (!currentResult.remediation || !stopReason || !taskId) {
    return [];
  }

  const history = [...previousIterations, currentResult];
  const collected: RalphTaskRemediationHistoryEntry[] = [];
  const currentSignature = currentResult.verification.validationFailureSignature;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.selectedTaskId !== taskId || !remediationMatchesStopReason(entry, stopReason, currentSignature)) {
      break;
    }

    collected.push({
      iteration: entry.iteration,
      completionClassification: entry.completionClassification,
      executionStatus: entry.executionStatus,
      verificationStatus: entry.verificationStatus,
      stopReason: entry.stopReason,
      summary: entry.summary,
      validationFailureSignature: entry.verification.validationFailureSignature,
      noProgressSignals: entry.noProgressSignals
    });
  }

  return collected.reverse();
}

function buildRemediationArtifact(input: {
  result: RalphIterationResult;
  taskFile: RalphTaskFile;
  previousIterations: RalphIterationResult[];
  artifactDir: string;
  iterationResultPath: string;
  createdAt: string;
}): RalphTaskRemediationArtifact | null {
  if (!input.result.remediation || !input.result.stopReason) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: input.result.provenanceId ?? null,
    iteration: input.result.iteration,
    selectedTaskId: input.result.selectedTaskId,
    selectedTaskTitle: input.result.selectedTaskTitle,
    trigger: input.result.remediation.trigger,
    attemptCount: input.result.remediation.attemptCount,
    action: input.result.remediation.action,
    humanReviewRecommended: input.result.remediation.humanReviewRecommended,
    summary: input.result.remediation.summary,
    rationale: remediationRationale(input.result),
    proposedAction: input.result.remediation.summary,
    evidence: input.result.remediation.evidence,
    triggeringHistory: remediationHistoryEntries(input.result, input.previousIterations),
    suggestedChildTasks: remediationSuggestedChildTasks(input.taskFile, input.result),
    artifactDir: input.artifactDir,
    iterationResultPath: input.iterationResultPath,
    createdAt: input.createdAt
  };
}

function sanitizeCompletionText(value: string | undefined, maximumLength = 400): string | undefined {
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

function isAllowedCompletionStatus(value: string): value is RalphCompletionReportRequestedStatus {
  return value === 'done' || value === 'blocked' || value === 'in_progress';
}

function extractTrailingJsonObject(text: string): string | null {
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

function parseCompletionReport(lastMessage: string): ParsedCompletionReport {
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

function controlPlaneRuntimeChanges(changedFiles: string[]): string[] {
  const matches = new Set<string>();

  for (const filePath of changedFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    if (/^(?:.+\/)?package\.json$/.test(normalized)
      || /(?:^|\/)(?:src|out|prompt-templates)\//.test(normalized)) {
      matches.add(filePath);
    }
  }

  return Array.from(matches).sort();
}

function trustLevelForTarget(promptTarget: RalphPromptTarget): RalphProvenanceTrustLevel {
  return promptTarget === 'cliExec' ? 'verifiedCliExecution' : 'preparedPromptOnly';
}

function isBacklogExhausted(taskCounts: RalphTaskCounts): boolean {
  return taskCounts.todo === 0 && taskCounts.in_progress === 0 && taskCounts.blocked === 0;
}

interface IntegrityFailureDetails {
  stage: RalphIntegrityFailure['stage'];
  message: string;
  expectedExecutionPlanHash: string | null;
  actualExecutionPlanHash: string | null;
  expectedPromptHash: string | null;
  actualPromptHash: string | null;
  expectedPayloadHash: string | null;
  actualPayloadHash: string | null;
}

class RalphIntegrityFailureError extends Error {
  public constructor(public readonly details: IntegrityFailureDetails) {
    super(details.message);
    this.name = 'RalphIntegrityFailureError';
  }
}

async function readVerifiedExecutionPlanArtifact(
  executionPlanPath: string,
  expectedExecutionPlanHash: string
): Promise<RalphExecutionPlan> {
  const planText = await fs.readFile(executionPlanPath, 'utf8').catch((error: unknown) => {
    throw new RalphIntegrityFailureError({
      stage: 'executionPlanHash',
      message: `Execution integrity check failed before launch: could not read execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash,
      actualExecutionPlanHash: null,
      expectedPromptHash: null,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  });

  const actualExecutionPlanHash = hashText(planText);
  if (actualExecutionPlanHash !== expectedExecutionPlanHash) {
    throw new RalphIntegrityFailureError({
      stage: 'executionPlanHash',
      message: `Execution integrity check failed before launch: execution plan hash ${actualExecutionPlanHash} did not match expected plan hash ${expectedExecutionPlanHash}.`,
      expectedExecutionPlanHash,
      actualExecutionPlanHash,
      expectedPromptHash: null,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  }

  try {
    return JSON.parse(planText) as RalphExecutionPlan;
  } catch (error) {
    throw new RalphIntegrityFailureError({
      stage: 'executionPlanHash',
      message: `Execution integrity check failed before launch: could not parse execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash,
      actualExecutionPlanHash,
      expectedPromptHash: null,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  }
}

async function readVerifiedPromptArtifact(plan: RalphExecutionPlan): Promise<string> {
  const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error: unknown) => {
    throw new RalphIntegrityFailureError({
      stage: 'promptArtifactHash',
      message: `Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash: null,
      actualExecutionPlanHash: null,
      expectedPromptHash: plan.promptHash,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  });

  const artifactHash = hashText(promptArtifactText);
  if (artifactHash !== plan.promptHash) {
    throw new RalphIntegrityFailureError({
      stage: 'promptArtifactHash',
      message: `Execution integrity check failed before launch: prompt artifact hash ${artifactHash} did not match planned prompt hash ${plan.promptHash}.`,
      expectedExecutionPlanHash: null,
      actualExecutionPlanHash: null,
      expectedPromptHash: plan.promptHash,
      actualPromptHash: artifactHash,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  }

  return promptArtifactText;
}

function toIntegrityFailureError(error: unknown, prepared: PreparedIterationContext): RalphIntegrityFailureError | null {
  if (error instanceof RalphIntegrityFailureError) {
    return error;
  }

  const message = toErrorMessage(error);
  const stdinHashMatch = message.match(/stdin payload hash (\S+) did not match planned prompt hash (\S+)\./);
  if (stdinHashMatch) {
    return new RalphIntegrityFailureError({
      stage: 'stdinPayloadHash',
      message,
      expectedExecutionPlanHash: prepared.executionPlanHash,
      actualExecutionPlanHash: prepared.executionPlanHash,
      expectedPromptHash: prepared.executionPlan.promptHash,
      actualPromptHash: prepared.executionPlan.promptHash,
      expectedPayloadHash: stdinHashMatch[2],
      actualPayloadHash: stdinHashMatch[1]
    });
  }

  return null;
}

function runRecordFromIteration(
  mode: RalphRunMode,
  prepared: PreparedIterationContext,
  startedAt: string,
  result: RalphIterationResult
): RalphRunRecord | undefined {
  if (result.executionStatus === 'skipped') {
    return undefined;
  }

  return {
    provenanceId: prepared.provenanceId,
    iteration: prepared.iteration,
    mode,
    promptKind: prepared.promptKind,
    startedAt,
    finishedAt: result.finishedAt,
    status: result.executionStatus === 'succeeded' ? 'succeeded' : 'failed',
    exitCode: result.execution.exitCode,
    promptPath: prepared.promptPath,
    transcriptPath: result.execution.transcriptPath,
    lastMessagePath: result.execution.lastMessagePath,
    summary: result.summary
  };
}

export class RalphIterationEngine {
  public constructor(
    private readonly stateManager: RalphStateManager,
    private readonly strategies: CodexStrategyRegistry,
    private readonly logger: Logger,
    private readonly hooks: RalphIterationEngineHooks = {}
  ) {}

  private createProvenanceBundle(input: {
    prepared: PreparedPromptContext;
    status: RalphProvenanceBundle['status'];
    summary: string;
    executionPayloadHash?: string | null;
    executionPayloadMatched?: boolean | null;
    mismatchReason?: string | null;
    cliInvocationPath?: string | null;
    iterationResultPath?: string | null;
    provenanceFailurePath?: string | null;
    provenanceFailureSummaryPath?: string | null;
  }): RalphProvenanceBundle {
    const {
      prepared,
      status,
      summary,
      executionPayloadHash = null,
      executionPayloadMatched = null,
      mismatchReason = null,
      cliInvocationPath = null,
      iterationResultPath = null,
      provenanceFailurePath = null,
      provenanceFailureSummaryPath = null
    } = input;

    return {
      schemaVersion: 1,
      kind: 'provenanceBundle',
      provenanceId: prepared.provenanceId,
      iteration: prepared.iteration,
      promptKind: prepared.promptKind,
      promptTarget: prepared.promptTarget,
      trustLevel: prepared.trustLevel,
      status,
      summary,
      rootPolicy: prepared.rootPolicy,
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskTitle: prepared.selectedTask?.title ?? null,
      artifactDir: resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration).directory,
      bundleDir: prepared.provenanceBundlePaths.directory,
      preflightReportPath: prepared.provenanceBundlePaths.preflightReportPath,
      preflightSummaryPath: prepared.provenanceBundlePaths.preflightSummaryPath,
      promptArtifactPath: prepared.provenanceBundlePaths.promptPath,
      promptEvidencePath: prepared.provenanceBundlePaths.promptEvidencePath,
      executionPlanPath: prepared.provenanceBundlePaths.executionPlanPath,
      executionPlanHash: prepared.executionPlanHash,
      cliInvocationPath,
      iterationResultPath,
      provenanceFailurePath,
      provenanceFailureSummaryPath,
      promptHash: prepared.executionPlan.promptHash,
      promptByteLength: prepared.executionPlan.promptByteLength,
      executionPayloadHash,
      executionPayloadMatched,
      mismatchReason,
      createdAt: prepared.executionPlan.createdAt,
      updatedAt: new Date().toISOString()
    };
  }

  private async persistPreparedProvenanceBundle(prepared: PreparedPromptContext): Promise<void> {
    const bundle = this.createProvenanceBundle({
      prepared,
      status: prepared.promptTarget === 'cliExec' ? 'prepared' : 'prepared',
      summary: prepared.promptTarget === 'cliExec'
        ? 'Prepared CLI execution provenance bundle.'
        : 'Prepared prompt provenance bundle for IDE handoff.'
    });

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: prepared.paths.artifactDir,
      paths: prepared.provenanceBundlePaths,
      bundle,
      preflightReport: prepared.persistedPreflightReport,
      preflightSummary: prepared.preflightSummaryText,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      executionPlan: prepared.executionPlan,
      retentionCount: prepared.config.provenanceBundleRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after prepare.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds,
        retentionCount: prepared.config.provenanceBundleRetentionCount
      });
    }

    await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'prepare');
  }

  private async persistBlockedPreflightBundle(input: {
    paths: ReturnType<RalphStateManager['resolvePaths']>;
    provenanceId: string;
    iteration: number;
    promptKind: RalphPromptKind;
    promptTarget: RalphPromptTarget;
    trustLevel: RalphProvenanceTrustLevel;
    provenanceRetentionCount: number;
    generatedArtifactRetentionCount: number;
    selectedTask: RalphTask | null;
    rootPolicy: RalphRootPolicy;
    persistedPreflightReport: RalphPersistedPreflightReport;
    preflightSummaryText: string;
  }): Promise<void> {
    const provenanceBundlePaths = resolveProvenanceBundlePaths(input.paths.artifactDir, input.provenanceId);
    const bundle: RalphProvenanceBundle = {
      schemaVersion: 1,
      kind: 'provenanceBundle',
      provenanceId: input.provenanceId,
      iteration: input.iteration,
      promptKind: input.promptKind,
      promptTarget: input.promptTarget,
      trustLevel: input.trustLevel,
      status: 'blocked',
      summary: input.persistedPreflightReport.summary,
      rootPolicy: input.rootPolicy,
      selectedTaskId: input.selectedTask?.id ?? null,
      selectedTaskTitle: input.selectedTask?.title ?? null,
      artifactDir: resolveIterationArtifactPaths(input.paths.artifactDir, input.iteration).directory,
      bundleDir: provenanceBundlePaths.directory,
      preflightReportPath: provenanceBundlePaths.preflightReportPath,
      preflightSummaryPath: provenanceBundlePaths.preflightSummaryPath,
      promptArtifactPath: null,
      promptEvidencePath: null,
      executionPlanPath: null,
      executionPlanHash: null,
      cliInvocationPath: null,
      iterationResultPath: null,
      provenanceFailurePath: null,
      provenanceFailureSummaryPath: null,
      promptHash: null,
      promptByteLength: null,
      executionPayloadHash: null,
      executionPayloadMatched: null,
      mismatchReason: null,
      createdAt: input.persistedPreflightReport.createdAt,
      updatedAt: new Date().toISOString()
    };

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: input.paths.artifactDir,
      paths: provenanceBundlePaths,
      bundle,
      preflightReport: input.persistedPreflightReport,
      preflightSummary: input.preflightSummaryText,
      retentionCount: input.provenanceRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds
      });
    }

    await this.cleanupGeneratedArtifacts(input.paths, input.generatedArtifactRetentionCount, 'blocked preflight');
  }

  private async persistIntegrityFailureBundle(
    prepared: PreparedIterationContext,
    failureError: RalphIntegrityFailureError
  ): Promise<void> {
    const failure: RalphIntegrityFailure = {
      schemaVersion: 1,
      kind: 'integrityFailure',
      provenanceId: prepared.provenanceId,
      iteration: prepared.iteration,
      promptKind: prepared.promptKind,
      promptTarget: prepared.promptTarget,
      trustLevel: prepared.trustLevel,
      stage: failureError.details.stage,
      blocked: true,
      summary: `Blocked before launch because ${failureError.details.stage} verification failed.`,
      message: failureError.details.message,
      artifactDir: resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration).directory,
      executionPlanPath: prepared.executionPlanPath,
      promptArtifactPath: prepared.executionPlan.promptArtifactPath,
      cliInvocationPath: null,
      expectedExecutionPlanHash: failureError.details.expectedExecutionPlanHash,
      actualExecutionPlanHash: failureError.details.actualExecutionPlanHash,
      expectedPromptHash: failureError.details.expectedPromptHash,
      actualPromptHash: failureError.details.actualPromptHash,
      expectedPayloadHash: failureError.details.expectedPayloadHash,
      actualPayloadHash: failureError.details.actualPayloadHash,
      createdAt: new Date().toISOString()
    };
    const bundle = this.createProvenanceBundle({
      prepared,
      status: 'blocked',
      summary: failure.summary,
      executionPayloadHash: failure.actualPayloadHash,
      executionPayloadMatched: false,
      mismatchReason: failure.message,
      provenanceFailurePath: prepared.provenanceBundlePaths.provenanceFailurePath,
      provenanceFailureSummaryPath: prepared.provenanceBundlePaths.provenanceFailureSummaryPath
    });

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: prepared.paths.artifactDir,
      paths: prepared.provenanceBundlePaths,
      bundle,
      preflightReport: prepared.persistedPreflightReport,
      preflightSummary: prepared.preflightSummaryText,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      executionPlan: prepared.executionPlan,
      failure,
      retentionCount: prepared.config.provenanceBundleRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after integrity failure.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds,
        retentionCount: prepared.config.provenanceBundleRetentionCount
      });
    }

    await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'integrity failure');
  }

  private async cleanupGeneratedArtifacts(
    paths: ReturnType<RalphStateManager['resolvePaths']>,
    retentionCount: number,
    stage: string
  ): Promise<void> {
    const retention = await cleanupGeneratedArtifacts({
      artifactRootDir: paths.artifactDir,
      promptDir: paths.promptDir,
      runDir: paths.runDir,
      stateFilePath: paths.stateFilePath,
      retentionCount
    });

    if (retention.deletedIterationDirectories.length === 0
      && retention.deletedPromptFiles.length === 0
      && retention.deletedRunArtifactBaseNames.length === 0) {
      return;
    }

    this.logger.info(`Cleaned up generated Ralph artifacts after ${stage}.`, {
      retentionCount,
      deletedIterationDirectories: retention.deletedIterationDirectories,
      protectedRetainedIterationDirectories: retention.protectedRetainedIterationDirectories,
      deletedPromptFiles: retention.deletedPromptFiles,
      protectedRetainedPromptFiles: retention.protectedRetainedPromptFiles,
      deletedRunArtifactBaseNames: retention.deletedRunArtifactBaseNames,
      protectedRetainedRunArtifactBaseNames: retention.protectedRetainedRunArtifactBaseNames
    });
  }

  private async reconcileCompletionReport(input: {
    prepared: PreparedIterationContext;
    selectedTask: RalphTask | null;
    verificationStatus: RalphIterationResult['verificationStatus'];
    preliminaryClassification: RalphIterationResult['completionClassification'];
    lastMessage: string;
  }): Promise<CompletionReconciliationOutcome> {
    const parsed = parseCompletionReport(input.lastMessage);
    const artifactBase: CompletionReportArtifact = {
      schemaVersion: 1,
      kind: 'completionReport',
      status: parsed.status === 'parsed' ? 'rejected' : parsed.status,
      selectedTaskId: input.selectedTask?.id ?? null,
      report: parsed.report,
      rawBlock: parsed.rawBlock,
      parseError: parsed.parseError,
      warnings: []
    };

    if (!input.selectedTask || input.prepared.promptKind === 'replenish-backlog') {
      artifactBase.status = 'missing';
      return {
        artifact: artifactBase,
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        warnings: []
      };
    }

    if (parsed.status !== 'parsed' || !parsed.report) {
      const warnings = parsed.status === 'invalid' && parsed.parseError
        ? [parsed.parseError]
        : parsed.status === 'missing'
          ? ['No completion report JSON block was found at the end of the Codex last message.']
          : [];
      artifactBase.warnings = warnings;
      return {
        artifact: {
          ...artifactBase,
          warnings
        },
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        warnings
      };
    }

    const warnings: string[] = [];
    if (parsed.report.selectedTaskId !== input.selectedTask.id) {
      warnings.push(
        `Completion report selectedTaskId ${parsed.report.selectedTaskId} did not match the selected task ${input.selectedTask.id}.`
      );
      return {
        artifact: {
          ...artifactBase,
          warnings
        },
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        warnings
      };
    }

    let requestedStatus = parsed.report.requestedStatus;
    if (requestedStatus === 'done') {
      if (input.verificationStatus !== 'passed') {
        warnings.push(`Completion report requested done, but verification status was ${input.verificationStatus}.`);
      }
      if (parsed.report.needsHumanReview) {
        warnings.push('Completion report requested done while also declaring needsHumanReview.');
      }
      if (warnings.length > 0) {
        return {
          artifact: {
            ...artifactBase,
            warnings
          },
          selectedTask: input.selectedTask,
          progressChanged: false,
          taskFileChanged: false,
          warnings
        };
      }
    }

    if (requestedStatus === 'blocked' && input.preliminaryClassification === 'complete') {
      warnings.push('Completion report requested blocked, but the preliminary outcome already classified the task as complete.');
      return {
        artifact: {
          ...artifactBase,
          warnings
        },
        selectedTask: input.selectedTask,
        progressChanged: false,
        taskFileChanged: false,
        warnings
      };
    }

    let taskFileChanged = false;
    let progressChanged = false;

    await this.stateManager.updateTaskFile(input.prepared.paths, (taskFile) => {
      const nextTasks = taskFile.tasks.map((task) => {
        if (task.id !== input.selectedTask!.id) {
          return task;
        }

        const nextTask: RalphTask = {
          ...task,
          status: requestedStatus,
          notes: parsed.report!.progressNote ?? task.notes,
          blocker: requestedStatus === 'blocked'
            ? parsed.report!.blocker ?? task.blocker
            : task.blocker
        };

        if (requestedStatus !== 'blocked' && parsed.report!.blocker) {
          nextTask.blocker = parsed.report!.blocker;
        }

        taskFileChanged = nextTask.status !== task.status
          || nextTask.notes !== task.notes
          || nextTask.blocker !== task.blocker;

        return nextTask;
      });

      return {
        ...taskFile,
        tasks: nextTasks
      };
    });

    if (parsed.report.progressNote) {
      await this.stateManager.appendProgressBullet(input.prepared.paths, parsed.report.progressNote);
      progressChanged = true;
    }

    const selectedTask = await this.stateManager.selectedTask(input.prepared.paths, input.selectedTask.id);

    return {
      artifact: {
        ...artifactBase,
        status: 'applied',
        warnings
      },
      selectedTask,
      progressChanged,
      taskFileChanged,
      warnings
    };
  }

  public async preparePrompt(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<PreparedPrompt> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, false);

    return {
      ...prepared
    };
  }

  public async runCliIteration(
    workspaceFolder: vscode.WorkspaceFolder,
    mode: RalphRunMode,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options: {
      reachedIterationCap: boolean;
    }
  ): Promise<RalphIterationRunSummary> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, true);
    const artifactPaths = resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration);
    const startedAt = prepared.phaseSeed.inspectStartedAt;
    const phaseTimestamps: RalphIterationResult['phaseTimestamps'] = {
      inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
      inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
      taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
      promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
      resultCollectedAt: startedAt,
      verificationFinishedAt: startedAt,
      classifiedAt: startedAt
    };

    progress.report({
      message: `Executing Ralph iteration ${prepared.iteration}`
    });

    const execStrategy = this.strategies.getCliExecStrategy();
    if (!execStrategy.runExec) {
      throw new Error('The configured Codex CLI strategy does not support codex exec.');
    }

    let executionStatus: RalphIterationResult['executionStatus'] = 'skipped';
    let executionWarnings: string[] = [];
    let executionErrors: string[] = [];
    let execStdout = '';
    let execStderr = '';
    let execExitCode: number | null = null;
    let execStdinHash: string | null = null;
    let transcriptPath: string | undefined;
    let lastMessagePath: string | undefined;
    let lastMessage = '';
    let invocation: RalphCliInvocation | undefined;

    const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';

    if (shouldExecutePrompt) {
      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
      const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);

      this.logger.info('Running Ralph iteration.', {
        iteration: prepared.iteration,
        mode,
        promptPath: prepared.promptPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        validationCommand: prepared.validationCommand
      });

      try {
        if (this.hooks.beforeCliExecutionIntegrityCheck) {
          await this.hooks.beforeCliExecutionIntegrityCheck(prepared);
        }
        const verifiedPlan = await readVerifiedExecutionPlanArtifact(
          prepared.executionPlanPath,
          prepared.executionPlanHash
        );
        const promptArtifactText = await readVerifiedPromptArtifact(verifiedPlan);
        phaseTimestamps.executionStartedAt = new Date().toISOString();
        const execResult = await execStrategy.runExec({
          commandPath: prepared.config.codexCommandPath,
          workspaceRoot: prepared.rootPath,
          executionRoot: prepared.rootPolicy.executionRootPath,
          prompt: promptArtifactText,
          promptPath: verifiedPlan.promptArtifactPath,
          promptHash: verifiedPlan.promptHash,
          promptByteLength: verifiedPlan.promptByteLength,
          transcriptPath: runArtifacts.transcriptPath,
          lastMessagePath: runArtifacts.lastMessagePath,
          model: prepared.config.model,
          reasoningEffort: prepared.config.reasoningEffort,
          sandboxMode: prepared.config.sandboxMode,
          approvalMode: prepared.config.approvalMode,
          onStdoutChunk: (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
          onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
        });
        phaseTimestamps.executionFinishedAt = new Date().toISOString();

        executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
        executionWarnings = execResult.warnings;
        executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
        execStdout = execResult.stdout;
        execStderr = execResult.stderr;
        execExitCode = execResult.exitCode;
        execStdinHash = execResult.stdinHash;
        transcriptPath = execResult.transcriptPath;
        lastMessagePath = execResult.lastMessagePath;
        lastMessage = execResult.lastMessage;

        invocation = {
          schemaVersion: 1,
          kind: 'cliInvocation',
          provenanceId: prepared.provenanceId,
          iteration: prepared.iteration,
          commandPath: prepared.config.codexCommandPath,
          args: execResult.args,
          reasoningEffort: prepared.config.reasoningEffort,
          workspaceRoot: prepared.rootPath,
          rootPolicy: prepared.rootPolicy,
          promptArtifactPath: verifiedPlan.promptArtifactPath,
          promptHash: verifiedPlan.promptHash,
          promptByteLength: verifiedPlan.promptByteLength,
          stdinHash: execResult.stdinHash,
          transcriptPath: execResult.transcriptPath,
          lastMessagePath: execResult.lastMessagePath,
          createdAt: new Date().toISOString()
        };
        await writeCliInvocationArtifact({
          paths: artifactPaths,
          artifactRootDir: prepared.paths.artifactDir,
          invocation
        });
      } catch (error) {
        const integrityFailure = toIntegrityFailureError(error, prepared);
        if (integrityFailure) {
          phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
          phaseTimestamps.executionFinishedAt = new Date().toISOString();
          await this.persistIntegrityFailureBundle(prepared, integrityFailure);
        }
        throw error;
      }
    } else {
      executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
      phaseTimestamps.executionStartedAt = new Date().toISOString();
      phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
    }

    phaseTimestamps.resultCollectedAt = new Date().toISOString();

    const afterCoreStateBeforeReconciliation = await captureCoreState(prepared.paths);
    const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;

    progress.report({ message: 'Running Ralph verifiers' });

    const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
      ? await runValidationCommandVerifier({
        command: prepared.validationCommand,
        taskValidationHint: prepared.taskValidationHint,
        normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
        rootPath: prepared.rootPolicy.verificationRootPath,
        artifactDir: artifactPaths.directory
      })
      : {
        command: prepared.validationCommand,
        stdout: '',
        stderr: '',
        exitCode: null,
        result: {
          verifier: 'validationCommand' as const,
          status: 'skipped' as const,
          summary: executionStatus === 'succeeded'
            ? 'Validation-command verifier disabled for this iteration.'
            : 'Validation-command verifier skipped because Codex execution did not succeed.',
          warnings: [],
          errors: [],
          command: prepared.validationCommand ?? undefined
        }
      };

    const shouldRunFileChangeVerifier = prepared.selectedTask !== null
      && (prepared.config.verifierModes.includes('gitDiff')
        || prepared.config.gitCheckpointMode === 'snapshotAndDiff');
    const fileChangeVerification = shouldRunFileChangeVerifier
      ? await runFileChangeVerifier({
        rootPath: prepared.rootPolicy.verificationRootPath,
        artifactDir: artifactPaths.directory,
        beforeGit: prepared.beforeGit,
        afterGit,
        before: prepared.beforeCoreState,
        after: afterCoreStateBeforeReconciliation
      })
      : {
        diffSummary: null as RalphDiffSummary | null,
        result: {
          verifier: 'gitDiff' as const,
          status: 'skipped' as const,
          summary: prepared.selectedTask
            ? 'Git-diff/file-change verifier disabled for this iteration.'
            : 'Git-diff/file-change verifier skipped because no Ralph task was selected.',
          warnings: [],
          errors: []
        }
      };

    const preliminaryVerificationStatus = classifyVerificationStatus([
      validationVerification.result.status,
      fileChangeVerification.result.status
    ]);
    const preliminaryOutcome = classifyIterationOutcome({
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskCompleted: false,
      selectedTaskBlocked: false,
      humanReviewNeeded: false,
      remainingSubtaskCount: remainingSubtasks(afterCoreStateBeforeReconciliation.taskFile, prepared.selectedTask?.id ?? null).length,
      remainingTaskCount: countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).todo
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).in_progress
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).blocked,
      executionStatus,
      verificationStatus: preliminaryVerificationStatus,
      validationFailureSignature: validationVerification.result.failureSignature ?? null,
      relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
      progressChanged: prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
      taskFileChanged: prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
      previousIterations: prepared.state.iterationHistory
    });
    const completionReconciliation = await this.reconcileCompletionReport({
      prepared,
      selectedTask: prepared.selectedTask,
      verificationStatus: preliminaryVerificationStatus,
      preliminaryClassification: preliminaryOutcome.classification,
      lastMessage
    });
    const afterCoreState = await captureCoreState(prepared.paths);
    const taskStateVerification = prepared.config.verifierModes.includes('taskState')
      ? await runTaskStateVerifier({
        selectedTaskId: prepared.selectedTask?.id ?? null,
        before: prepared.beforeCoreState,
        after: afterCoreState,
        artifactDir: artifactPaths.directory
      })
      : {
        selectedTaskAfter: completionReconciliation.selectedTask ?? prepared.selectedTask,
        selectedTaskCompleted: false,
        selectedTaskBlocked: false,
        humanReviewNeeded: false,
        progressChanged: completionReconciliation.progressChanged,
        taskFileChanged: completionReconciliation.taskFileChanged,
        result: {
          verifier: 'taskState' as const,
          status: 'skipped' as const,
          summary: 'Task-state verifier disabled for this iteration.',
          warnings: [],
          errors: []
        }
      };

    phaseTimestamps.verificationFinishedAt = new Date().toISOString();

    const verifierResults = [
      validationVerification.result,
      fileChangeVerification.result,
      taskStateVerification.result
    ];
    const verificationStatus = classifyVerificationStatus(verifierResults.map((item) => item.status));
    const selectedTaskAfter = taskStateVerification.selectedTaskAfter
      ?? completionReconciliation.selectedTask
      ?? prepared.selectedTask;
    const remainingSubtaskList = remainingSubtasks(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
    const afterTaskCounts = countTaskStatuses(afterCoreState.taskFile);
    const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
    const nextActionableTask = selectNextTask(afterCoreState.taskFile);
    const outcome = classifyIterationOutcome({
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
      selectedTaskBlocked: taskStateVerification.selectedTaskBlocked,
      humanReviewNeeded: taskStateVerification.humanReviewNeeded,
      remainingSubtaskCount: remainingSubtaskList.length,
      remainingTaskCount,
      executionStatus,
      verificationStatus,
      validationFailureSignature: validationVerification.result.failureSignature ?? null,
      relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
      progressChanged: taskStateVerification.progressChanged,
      taskFileChanged: taskStateVerification.taskFileChanged,
      previousIterations: prepared.state.iterationHistory
    });

    let completionClassification = outcome.classification;
    let followUpAction = outcome.followUpAction;
    if (!prepared.selectedTask) {
      if (isBacklogExhausted(afterTaskCounts)) {
        completionClassification = 'complete';
        followUpAction = 'stop';
      } else if (afterTaskCounts.todo === 0 && afterTaskCounts.in_progress === 0 && afterTaskCounts.blocked > 0) {
        completionClassification = 'blocked';
        followUpAction = 'request_human_review';
      }
    }

    phaseTimestamps.classifiedAt = new Date().toISOString();

    const summary = [
      prepared.selectedTask
        ? `Selected ${prepared.selectedTask.id}: ${prepared.selectedTask.title}`
        : prepared.promptKind === 'replenish-backlog'
          ? 'Replenishing exhausted Ralph backlog.'
          : 'No actionable Ralph task selected.',
      `Execution: ${executionStatus}`,
      `Verification: ${verificationStatus}`,
      `Outcome: ${completionClassification}`,
      `Backlog remaining: ${remainingTaskCount}`
    ].join(' | ');
    const warnings = [
      ...executionWarnings,
      ...completionReconciliation.warnings,
      ...verifierResults.flatMap((item) => item.warnings)
    ];
    const errors = [
      ...executionErrors,
      ...verifierResults.flatMap((item) => item.errors)
    ];

    const result: RalphIterationResult = {
      schemaVersion: 1,
      provenanceId: prepared.provenanceId,
      iteration: prepared.iteration,
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskTitle: prepared.selectedTask?.title ?? null,
      promptKind: prepared.promptKind,
      promptPath: prepared.promptPath,
      artifactDir: artifactPaths.directory,
      adapterUsed: 'cliExec',
      executionIntegrity: {
        provenanceId: prepared.provenanceId,
        promptTarget: prepared.executionPlan.promptTarget,
        rootPolicy: prepared.rootPolicy,
        templatePath: prepared.executionPlan.templatePath,
        reasoningEffort: prepared.config.reasoningEffort,
        taskValidationHint: prepared.taskValidationHint,
        effectiveValidationCommand: prepared.effectiveValidationCommand,
        normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
        executionPlanPath: prepared.executionPlanPath,
        executionPlanHash: prepared.executionPlanHash,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        promptByteLength: prepared.executionPlan.promptByteLength,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
        mismatchReason: execStdinHash === null
          ? null
          : execStdinHash === prepared.executionPlan.promptHash
            ? null
            : `Executed stdin hash ${execStdinHash} did not match planned prompt hash ${prepared.executionPlan.promptHash}.`,
        cliInvocationPath: invocation ? artifactPaths.cliInvocationPath : null
      },
      executionStatus,
      verificationStatus,
      completionClassification,
      followUpAction,
      startedAt,
      finishedAt: new Date().toISOString(),
      phaseTimestamps,
      summary,
      warnings,
      errors,
      execution: {
        exitCode: execExitCode,
        message: prepared.selectedTask ? executionErrors[0] ?? undefined : undefined,
        transcriptPath,
        lastMessagePath,
        stdoutPath: artifactPaths.stdoutPath,
        stderrPath: artifactPaths.stderrPath
      },
      verification: {
        taskValidationHint: prepared.taskValidationHint,
        effectiveValidationCommand: prepared.effectiveValidationCommand,
        normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
        primaryCommand: validationVerification.command ?? null,
        validationFailureSignature: validationVerification.result.failureSignature ?? null,
        verifiers: verifierResults
      },
      backlog: {
        remainingTaskCount,
        actionableTaskAvailable: Boolean(nextActionableTask)
      },
      diffSummary: fileChangeVerification.diffSummary,
      noProgressSignals: outcome.noProgressSignals,
      remediation: null,
      completionReportStatus: completionReconciliation.artifact.status,
      reconciliationWarnings: completionReconciliation.warnings,
      stopReason: null
    };

    let loopDecision = decideLoopContinuation({
      currentResult: result,
      selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
      remainingSubtaskCount: remainingSubtaskList.length,
      remainingTaskCount,
      hasActionableTask: Boolean(nextActionableTask),
      noProgressThreshold: prepared.config.noProgressThreshold,
      repeatedFailureThreshold: prepared.config.repeatedFailureThreshold,
      stopOnHumanReviewNeeded: prepared.config.stopOnHumanReviewNeeded,
      reachedIterationCap: options.reachedIterationCap,
      previousIterations: prepared.state.iterationHistory
    });
    const runtimeChanges = controlPlaneRuntimeChanges(fileChangeVerification.diffSummary?.relevantChangedFiles ?? []);

    if (!loopDecision.shouldContinue) {
      result.stopReason = loopDecision.stopReason;
      result.followUpAction = 'stop';
      result.remediation = buildTaskRemediation({
        currentResult: result,
        stopReason: loopDecision.stopReason,
        previousIterations: prepared.state.iterationHistory
      });
      result.remediation = normalizeRemediationForTask(afterCoreState.taskFile, result);
    } else if (runtimeChanges.length > 0) {
      loopDecision = {
        shouldContinue: false,
        stopReason: 'control_plane_reload_required',
        message: 'Control-plane runtime files changed; rerun Ralph in a fresh process before continuing.'
      };
      result.stopReason = 'control_plane_reload_required';
      result.followUpAction = 'stop';
      result.remediation = null;
      result.warnings.push(
        `Control-plane runtime files changed during this iteration; rerun Ralph in a fresh process before continuing. (${runtimeChanges.join(', ')})`
      );
    }

    phaseTimestamps.persistedAt = new Date().toISOString();

    const remediationArtifact = buildRemediationArtifact({
      result,
      taskFile: afterCoreState.taskFile,
      previousIterations: prepared.state.iterationHistory,
      artifactDir: artifactPaths.directory,
      iterationResultPath: artifactPaths.iterationResultPath,
      createdAt: phaseTimestamps.persistedAt
    });

    await writeIterationArtifacts({
      paths: artifactPaths,
      artifactRootDir: prepared.paths.artifactDir,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      completionReport: completionReconciliation.artifact,
      stdout: execStdout,
      stderr: execStderr,
      executionSummary: {
        iteration: prepared.iteration,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        promptKind: prepared.promptKind,
        promptTarget: prepared.executionPlan.promptTarget,
        rootPolicy: prepared.rootPolicy,
        templatePath: prepared.executionPlan.templatePath,
        taskValidationHint: prepared.taskValidationHint,
        effectiveValidationCommand: prepared.effectiveValidationCommand,
        normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
        executionPlanPath: prepared.executionPlanPath,
        executionPlanHash: prepared.executionPlanHash,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
        cliInvocationPath: invocation ? artifactPaths.cliInvocationPath : null,
        executionStatus,
        exitCode: execExitCode,
        message: executionErrors[0] ?? null,
        transcriptPath,
        lastMessagePath,
        lastMessage: summarizeLastMessage(lastMessage, execExitCode),
        completionReportStatus: completionReconciliation.artifact.status
      },
      verifierSummary: verifierResults,
      diffSummary: fileChangeVerification.diffSummary,
      result,
      remediationArtifact,
      gitStatusBefore: prepared.beforeGit.available ? prepared.beforeGit.raw : undefined,
      gitStatusAfter: afterGit.available ? afterGit.raw : undefined
    });

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: prepared.paths.artifactDir,
      paths: prepared.provenanceBundlePaths,
      bundle: this.createProvenanceBundle({
        prepared,
        status: 'executed',
        summary: result.summary,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
        mismatchReason: result.executionIntegrity?.mismatchReason ?? null,
        cliInvocationPath: invocation ? prepared.provenanceBundlePaths.cliInvocationPath : null,
        iterationResultPath: prepared.provenanceBundlePaths.iterationResultPath
      }),
      preflightReport: prepared.persistedPreflightReport,
      preflightSummary: prepared.preflightSummaryText,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      executionPlan: prepared.executionPlan,
      cliInvocation: invocation,
      result,
      retentionCount: prepared.config.provenanceBundleRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after execution.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds,
        retentionCount: prepared.config.provenanceBundleRetentionCount
      });
    }

    const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
    await this.stateManager.recordIteration(
      prepared.rootPath,
      prepared.paths,
      prepared.state,
      result,
      prepared.objectiveText,
      runRecord
    );
    await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution');

    this.logger.info('Completed Ralph iteration.', {
      iteration: prepared.iteration,
      selectedTaskId: prepared.selectedTask?.id ?? null,
      executionStatus,
      verificationStatus,
      completionClassification,
      stopReason: result.stopReason,
      promptPath: prepared.promptPath,
      promptArtifactPath: prepared.executionPlan.promptArtifactPath,
      promptHash: prepared.executionPlan.promptHash,
      executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
      artifactDir: artifactPaths.directory,
      selectedTaskAfterStatus: selectedTaskAfter?.status ?? null
    });

    return {
      prepared,
      result,
      loopDecision,
      createdPaths: prepared.createdPaths
    };
  }

  private async maybeSeedObjective(paths: PreparedPromptContext['paths']): Promise<string> {
    const objectiveText = await this.stateManager.readObjectiveText(paths);
    if (!this.stateManager.isDefaultObjective(objectiveText)) {
      return objectiveText;
    }

    const seededObjective = await vscode.window.showInputBox({
      prompt: 'Seed the PRD with a short objective for this workspace',
      placeHolder: 'Example: Harden the VS Code extension starter into a reliable v2 iteration engine'
    });

    if (!seededObjective?.trim()) {
      return objectiveText;
    }

    const nextText = [
      '# Product / project brief',
      '',
      seededObjective.trim()
    ].join('\n');

    await this.stateManager.writeObjectiveText(paths, nextText);
    return `${nextText}\n`;
  }

  private async prepareIterationContext(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    includeVerifierContext: boolean
  ): Promise<PreparedIterationContext> {
    const inspectStartedAt = new Date().toISOString();
    progress.report({ message: 'Inspecting Ralph workspace' });
    const config = readConfig(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await this.stateManager.ensureWorkspace(rootPath, config);
    await this.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);

    if (snapshot.createdPaths.length > 0) {
      this.logger.warn('Initialized or repaired Ralph workspace paths.', {
        rootPath,
        createdPaths: snapshot.createdPaths
      });
    }

    const objectiveText = await this.maybeSeedObjective(snapshot.paths);
    const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : null;
    const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
      this.stateManager.readProgressText(snapshot.paths),
      this.stateManager.inspectTaskFile(snapshot.paths),
      this.stateManager.taskCounts(snapshot.paths).catch(() => null),
      scanWorkspace(rootPath, workspaceFolder.name, {
        focusPath,
        inspectionRootOverride: config.inspectionRootOverride
      }),
      captureCoreState(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
    const selectedTask = selectNextTask(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const rootPolicy = deriveRootPolicy(summary);
    const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const promptDecision = decidePromptKind(snapshot.state, promptTarget, {
      selectedTask,
      taskCounts: effectiveTaskCounts
    });
    const promptKind = promptDecision.kind;
    const taskValidationHint = selectedTask?.validation?.trim() || null;
    const selectedValidationCommand = promptKind === 'replenish-backlog'
      ? null
      : chooseValidationCommand(summary, selectedTask, config.validationCommandOverride);
    const effectiveValidationCommand = promptKind === 'replenish-backlog'
      ? null
      : normalizeValidationCommand({
        command: selectedValidationCommand,
        workspaceRootPath: workspaceFolder.uri.fsPath,
        verificationRootPath: rootPolicy.verificationRootPath
      });
    const normalizedValidationCommandFrom = selectedValidationCommand
      && effectiveValidationCommand
      && selectedValidationCommand !== effectiveValidationCommand
      ? selectedValidationCommand
      : null;
    const validationCommandReadiness = await inspectValidationCommandReadiness({
      command: effectiveValidationCommand,
      rootPath: rootPolicy.verificationRootPath
    });
    const trustLevel = trustLevelForTarget(promptTarget);
    const iteration = snapshot.state.nextIteration;
    const provenanceId = createProvenanceId({
      iteration,
      promptTarget,
      createdAt: taskSelectedAt
    });
    const [availableCommands, codexCliSupport] = await Promise.all([
      vscode.commands.getCommands(true),
      inspectCodexCliSupport(config.codexCommandPath)
    ]);
    const ideCommandSupport = inspectIdeCommandSupport({
      preferredHandoffMode: config.preferredHandoffMode,
      openSidebarCommandId: config.openSidebarCommandId,
      newChatCommandId: config.newChatCommandId,
      availableCommands
    });
    const artifactReadinessDiagnostics = await inspectPreflightArtifactReadiness({
      rootPath,
      artifactRootDir: snapshot.paths.artifactDir,
      promptDir: snapshot.paths.promptDir,
      runDir: snapshot.paths.runDir,
      stateFilePath: snapshot.paths.stateFilePath,
      generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
      provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
    });
    const preflightReport = buildPreflightReport({
      rootPath,
      workspaceTrusted: vscode.workspace.isTrusted,
      config,
      taskInspection,
      taskCounts: effectiveTaskCounts,
      selectedTask,
      taskValidationHint,
      validationCommand: effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommandReadiness,
      fileStatus: snapshot.fileStatus,
      createdPaths: snapshot.createdPaths,
      codexCliSupport,
      ideCommandSupport,
      artifactReadinessDiagnostics
    });
    const preflightArtifactPaths = resolvePreflightArtifactPaths(snapshot.paths.artifactDir, iteration);
    const {
      persistedReport: persistedPreflightReport,
      humanSummary: preflightSummaryText
    } = await writePreflightArtifacts({
      paths: preflightArtifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      provenanceId,
      iteration,
      promptKind,
      promptTarget,
      trustLevel,
      report: preflightReport,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand
    });
    progress.report({ message: preflightReport.summary });
    this.logger.appendText(renderPreflightReport(preflightReport));
    this.logger.info('Prepared Ralph preflight report.', {
      rootPath,
      iteration,
      ready: preflightReport.ready,
      preflightReportPath: preflightArtifactPaths.reportPath,
      preflightSummaryPath: preflightArtifactPaths.summaryPath,
      diagnostics: preflightReport.diagnostics
    });
    if (includeVerifierContext && !preflightReport.ready) {
      await this.persistBlockedPreflightBundle({
        paths: snapshot.paths,
        provenanceId,
        iteration,
        promptKind,
        promptTarget,
        trustLevel,
        provenanceRetentionCount: config.provenanceBundleRetentionCount,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        selectedTask,
        rootPolicy,
        persistedPreflightReport,
        preflightSummaryText
      });
      throw new Error(buildBlockingPreflightMessage(preflightReport));
    }

    progress.report({ message: 'Generating Ralph prompt' });
    const artifactPaths = resolveIterationArtifactPaths(snapshot.paths.artifactDir, iteration);
    const provenanceBundlePaths = resolveProvenanceBundlePaths(snapshot.paths.artifactDir, provenanceId);
    const promptRender = await buildPrompt({
      kind: promptKind,
      target: promptTarget,
      iteration,
      selectionReason: promptDecision.reason,
      objectiveText,
      progressText,
      taskCounts: effectiveTaskCounts,
      summary,
      state: snapshot.state,
      paths: snapshot.paths,
      taskFile,
      selectedTask,
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand,
      preflightReport,
      config
    });
    const prompt = promptRender.prompt;
    const promptEvidence: RalphPromptEvidence = {
      ...promptRender.evidence,
      provenanceId
    };

    const promptPath = await this.stateManager.writePrompt(
      snapshot.paths,
      createPromptFileName(promptKind, iteration),
      prompt
    );
    await writePromptArtifacts({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      prompt,
      promptEvidence
    });
    const executionPlan: RalphExecutionPlan = {
      schemaVersion: 1,
      kind: 'executionPlan',
      provenanceId,
      iteration,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      promptKind,
      promptTarget,
      selectionReason: promptDecision.reason,
      rootPolicy,
      templatePath: promptRender.templatePath,
      promptPath,
      promptArtifactPath: artifactPaths.promptPath,
      promptEvidencePath: artifactPaths.promptEvidencePath,
      promptHash: hashText(prompt),
      promptByteLength: utf8ByteLength(prompt),
      artifactDir: artifactPaths.directory,
      createdAt: new Date().toISOString()
    };
    const executionPlanHash = hashJson(executionPlan);
    await writeExecutionPlanArtifact({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      plan: executionPlan
    });
    const promptGeneratedAt = new Date().toISOString();
    const beforeGit = includeVerifierContext
      && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
      ? await captureGitStatus(rootPolicy.verificationRootPath)
      : EMPTY_GIT_STATUS;

    this.logger.info('Prepared Ralph prompt context.', {
      rootPath,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      iteration,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptArtifactPath: executionPlan.promptArtifactPath,
      promptHash: executionPlan.promptHash,
      executionPlanPath: artifactPaths.executionPlanPath,
      promptEvidence,
      selectedTaskId: selectedTask?.id ?? null,
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom
    });

    const preparedContext: PreparedIterationContext = {
      config,
      rootPath,
      rootPolicy,
      state: snapshot.state,
      paths: snapshot.paths,
      provenanceId,
      trustLevel,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptEvidence,
      executionPlan,
      executionPlanHash,
      executionPlanPath: artifactPaths.executionPlanPath,
      prompt,
      iteration,
      objectiveText,
      progressText,
      tasksText,
      taskFile,
      taskCounts: effectiveTaskCounts,
      summary,
      selectedTask,
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand,
      preflightReport,
      persistedPreflightReport,
      preflightSummaryText,
      provenanceBundlePaths,
      createdPaths: snapshot.createdPaths,
      beforeCoreState,
      beforeGit,
      phaseSeed: {
        inspectStartedAt,
        inspectFinishedAt: taskSelectedAt,
        taskSelectedAt,
        promptGeneratedAt
      }
    };
    await this.persistPreparedProvenanceBundle(preparedContext);

    return preparedContext;
  }
}
