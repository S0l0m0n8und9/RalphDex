/**
 * Deterministic task-complexity scoring for model-tier selection.
 *
 * Adopted from Ruflo's smart task-routing pattern, which routes simple tasks to
 * cheaper/faster models and complex or repeatedly-failing tasks to more capable ones.
 *
 * The score is an integer built from observable, evidence-backed signals only —
 * no freeform AI inference.  Higher scores indicate higher complexity.
 *
 * Score → tier mapping (thresholds are configurable via RalphModelTieringConfig):
 *   score < simpleThreshold  → simple model  (e.g. claude-haiku)
 *   score < complexThreshold → medium model  (e.g. claude-sonnet)
 *   score >= complexThreshold → complex model (e.g. claude-opus)
 */

import { RalphCompletionClassification, RalphIterationResult, RalphTask, RalphTaskFile, RalphTaskTier } from './types';
import { CliProviderId, RalphModelTieringConfig } from '../config/types';

export interface ComplexityScore {
  /** Total complexity score (sum of all signals). */
  score: number;
  /** Individual signal contributions for auditability. */
  signals: Array<{ name: string; contribution: number }>;
}

function childTaskCount(taskFile: RalphTaskFile, taskId: string): number {
  return taskFile.tasks.filter((candidate) => candidate.parentId === taskId).length;
}

function titleWordCountContribution(title: string): number {
  const wordCount = title.trim() ? title.trim().split(/\s+/).length : 0;
  if (wordCount >= 13) {
    return 1;
  }
  if (wordCount > 0 && wordCount <= 2) {
    return -1;
  }
  return 0;
}

const COMPLEX_CLASSIFICATIONS: Set<RalphCompletionClassification> = new Set([
  'blocked',
  'needs_human_review',
  'failed'
]);

function trailingComplexClassificationCount(
  history: RalphIterationResult[],
  taskId: string
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.selectedTaskId !== taskId) break;
    if (COMPLEX_CLASSIFICATIONS.has(item.completionClassification)) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Scores a task's complexity using deterministic, evidence-backed signals.
 *
 * @param task             - The task to score.
 * @param taskFile         - The full task file (for graph inspection).
 * @param iterationHistory - Recent iteration results for this agent.
 */
export function scoreTaskComplexity(
  task: RalphTask,
  taskFile: RalphTaskFile,
  iterationHistory: RalphIterationResult[]
): ComplexityScore {
  const signals: Array<{ name: string; contribution: number }> = [];

  // +2 if the task declares a validation command
  if (task.validation?.trim()) {
    signals.push({ name: 'has_validation_field', contribution: 2 });
  }

  // +1 per child task (capped at 3)
  const childCount = Math.min(childTaskCount(taskFile, task.id), 3);
  if (childCount > 0) {
    signals.push({ name: 'child_task_count', contribution: childCount });
  }

  // +1 if the task includes a blocker note
  if (task.blocker?.trim()) {
    signals.push({ name: 'has_blocker_note', contribution: 1 });
  }

  // +1 per trailing iteration that ended in a complex classification for this task
  const trailingFails = trailingComplexClassificationCount(iterationHistory, task.id);
  if (trailingFails > 0) {
    const contribution = Math.min(trailingFails, 4); // cap at 4 to avoid runaway
    signals.push({ name: 'trailing_complex_classifications', contribution });
  }

  // Retain title breadth as a weak signal, capped to ±1 contribution.
  const titleContribution = titleWordCountContribution(task.title);
  if (titleContribution !== 0) {
    signals.push({ name: 'title_word_count', contribution: titleContribution });
  }

  const score = signals.reduce((acc, s) => acc + s.contribution, 0);
  return { score, signals };
}

/**
 * Selects a model ID and optional provider override based on the task's
 * complexity score and the operator's tiering configuration.  Falls back
 * to `fallbackModel` when tiering is disabled.
 */
export function selectModelForTask(input: {
  task: RalphTask;
  taskFile: RalphTaskFile;
  iterationHistory: RalphIterationResult[];
  tiering: RalphModelTieringConfig;
  fallbackModel: string;
}): { model: string; provider?: CliProviderId; score: ComplexityScore | null; tier: string } {
  if (!input.tiering.enabled) {
    return { model: input.fallbackModel, score: null, tier: 'default' };
  }

  if (input.task.tier) {
    const tierConfig = input.task.tier === 'simple' ? input.tiering.simple
      : input.task.tier === 'complex' ? input.tiering.complex
      : input.tiering.medium;
    const score: ComplexityScore = { score: 0, signals: [{ name: 'explicit', contribution: 0 }] };
    return { model: tierConfig.model, provider: tierConfig.provider, score, tier: input.task.tier };
  }

  const score = scoreTaskComplexity(input.task, input.taskFile, input.iterationHistory);

  let tier: { model: string; provider?: CliProviderId };
  let tierName: string;
  if (score.score < input.tiering.simpleThreshold) {
    tier = input.tiering.simple;
    tierName = 'simple';
  } else if (score.score >= input.tiering.complexThreshold) {
    tier = input.tiering.complex;
    tierName = 'complex';
  } else {
    tier = input.tiering.medium;
    tierName = 'medium';
  }

  return { model: tier.model, provider: tier.provider, score, tier: tierName };
}

/** Resolved complexity tier with the source that determined it. */
export interface EffectiveTierInfo {
  tier: RalphTaskTier;
  /** 'explicit' when the task carries a static tier field; 'scored' when derived from heuristics. */
  source: 'explicit' | 'scored';
  /** Complexity score used for threshold mapping; null when source is 'explicit'. */
  score: number | null;
}

/**
 * Derives the effective tier for a task without committing to a specific model.
 * Useful for status reporting — shows what tier would apply regardless of whether
 * tiering is enabled in config.
 */
export function deriveEffectiveTier(input: {
  task: RalphTask;
  taskFile: RalphTaskFile;
  iterationHistory: RalphIterationResult[];
  simpleThreshold: number;
  complexThreshold: number;
}): EffectiveTierInfo {
  if (input.task.tier) {
    return { tier: input.task.tier, source: 'explicit', score: null };
  }

  const complexity = scoreTaskComplexity(input.task, input.taskFile, input.iterationHistory);
  let tier: RalphTaskTier;
  if (complexity.score < input.simpleThreshold) {
    tier = 'simple';
  } else if (complexity.score >= input.complexThreshold) {
    tier = 'complex';
  } else {
    tier = 'medium';
  }

  return { tier, source: 'scored', score: complexity.score };
}
