import {
  RalphIterationResult,
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskFile,
  RalphTaskRemediationArtifact,
  RalphTaskRemediationHistoryEntry
} from './types';
import { applySuggestedChildTasksToFile, findTaskById } from './taskFile';

const MAX_REMEDIATION_CHILD_TASKS = 3;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function decomposePhrase(value: string): string {
  return value
    .replace(/^(add|implement|build|create|fix|update|improve|refactor)\s+/i, '')
    .replace(/\s+for\s+/i, ' for ')
    .trim();
}

export function isClearlyCompoundTask(task: RalphTask): boolean {
  const title = normalizeWhitespace(task.title.toLowerCase());
  const notes = normalizeWhitespace(task.notes?.toLowerCase() ?? '');
  const combined = [title, notes].filter(Boolean).join(' ');

  return /\b(and|plus|along with|together with|then)\b/.test(combined)
    || /\b(broad task|needs decomposition|requires decomposition|decompose)\b/.test(combined)
    || title.includes(',')
    || /\bfrom\b.+\bthrough\b/.test(combined)
    || /\bsmall proposed child-task set with dependencies\b/.test(combined);
}

export function deriveCompoundSegments(task: RalphTask): string[] {
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

export function buildDecompositionProposal(
  task: RalphTask,
  result: RalphIterationResult
): RalphSuggestedChildTask[] {
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
      'implement the smallest bounded fix for that reproduced blocker'
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

export function remediationSuggestedChildTasks(
  taskFile: RalphTaskFile,
  result: RalphIterationResult
): RalphSuggestedChildTask[] {
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

export function normalizeRemediationForTask(
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

export function remediationMatchesStopReason(
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

export function remediationHistoryEntries(
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

export function buildRemediationArtifact(input: {
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

export interface RalphApplicableTaskDecompositionProposal {
  parentTaskId: string;
  suggestedChildTasks: RalphSuggestedChildTask[];
}

export function resolveApplicableTaskDecompositionProposal(
  remediationArtifact: RalphTaskRemediationArtifact | null | undefined
): RalphApplicableTaskDecompositionProposal | null {
  if (!remediationArtifact
    || remediationArtifact.action !== 'decompose_task'
    || !remediationArtifact.selectedTaskId
    || remediationArtifact.suggestedChildTasks.length === 0) {
    return null;
  }

  return {
    parentTaskId: remediationArtifact.selectedTaskId,
    suggestedChildTasks: remediationArtifact.suggestedChildTasks
  };
}

export async function applyTaskDecompositionProposalArtifact(
  taskFilePath: string,
  remediationArtifact: RalphTaskRemediationArtifact
): Promise<{
    taskFile: RalphTaskFile;
    parentTaskId: string;
    childTaskIds: string[];
  }> {
  const proposal = resolveApplicableTaskDecompositionProposal(remediationArtifact);
  if (!proposal) {
    throw new Error('The provided remediation artifact does not contain an applicable task-decomposition proposal.');
  }

  return {
    taskFile: await applySuggestedChildTasksToFile(
      taskFilePath,
      proposal.parentTaskId,
      proposal.suggestedChildTasks
    ),
    parentTaskId: proposal.parentTaskId,
    childTaskIds: proposal.suggestedChildTasks.map((task) => task.id)
  };
}

export function remediationRationale(result: RalphIterationResult): string {
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

export function remediationSummary(result: RalphIterationResult): string | null {
  return result.remediation?.summary ?? null;
}
