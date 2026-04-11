import * as fs from 'fs/promises';
import * as path from 'path';
import type { FailureAnalysis } from './failureDiagnostics';
import { getFailureAnalysisPath } from './failureDiagnostics';

/**
 * Recovery actions the orchestrator can dispatch for each failure category.
 * The caller is responsible for executing the action; the orchestrator only
 * computes the decision and (when autoApplyRemediation is non-empty) executes
 * injected side-effect callbacks (releaseClaim, emitOperatorNotification).
 */
export type RecoveryAction =
  | 'retry_with_backoff'            // transient: auto-retry with exponential backoff
  | 'retry_with_addendum'           // implementation_error / validation_mismatch
  | 'trigger_planning_pass'         // task_ambiguity
  | 'release_claim_and_pause'       // dependency_missing
  | 'attempt_preflight_remediation' // environment_issue
  | 'escalate_to_operator';         // max attempts exceeded or unrecoverable

/**
 * Durable state written to <artifactRootDir>/<taskId>/recovery-state.json.
 * Persisted across iterations so attempt counts survive loop restarts.
 */
export interface RecoveryState {
  schemaVersion: 1;
  kind: 'recoveryState';
  taskId: string;
  category: string;
  attemptCount: number;
  lastAttemptAt: string;
  retryPromptAddendum?: string;
  escalated: boolean;
}

/**
 * The decision returned by dispatchRecovery.  The caller uses this to modify
 * the iteration result and decide whether to continue or pause the loop.
 */
export interface RecoveryDecision {
  action: RecoveryAction;
  pauseAgent: boolean;
  /** Injected as a "Previous attempt context" section in the next iteration prompt. */
  retryPromptAddendum?: string;
  /** Milliseconds to wait before retrying (transient path only). */
  backoffMs?: number;
  summary: string;
  attemptCount: number;
  escalated: boolean;
  /**
   * true when autoApplyRemediation is non-empty and side effects
   * (releaseClaim / emitOperatorNotification) were actually invoked.
   */
  autoApplied: boolean;
}

/**
 * Inputs required to dispatch a recovery playbook.
 *
 * The callbacks (releaseClaim, emitOperatorNotification) are injected so the
 * orchestrator remains testable without VS Code or task-file dependencies.
 */
export interface RecoveryContext {
  taskId: string;
  taskTitle: string;
  analysis: FailureAnalysis;
  artifactRootDir: string;
  /** From ralphCodex.maxRecoveryAttempts. */
  maxRecoveryAttempts: number;
  /**
   * From ralphCodex.autoApplyRemediation.  Non-empty enables side-effect
   * execution; empty means the orchestrator computes the decision but skips
   * callbacks (gate matches the existing autoApplyRemediation semantics).
   */
  autoApplyRemediation: string[];
  /** Release the active task claim so other agents can pick it up. */
  releaseClaim: () => Promise<void>;
  /** Emit a VS Code information notification to the operator. */
  emitOperatorNotification: (message: string, failureAnalysisPath: string) => Promise<void>;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Computes exponential backoff: 1s, 2s, 4s, … capped at 30s. */
function computeBackoffMs(attemptCount: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1), MAX_BACKOFF_MS);
}

/** Returns the path where recovery-state.json is stored for a task. */
export function getRecoveryStatePath(artifactRootDir: string, taskId: string): string {
  return path.join(artifactRootDir, taskId, 'recovery-state.json');
}

async function loadRecoveryState(
  artifactRootDir: string,
  taskId: string,
  category: string
): Promise<RecoveryState> {
  const statePath = getRecoveryStatePath(artifactRootDir, taskId);
  try {
    const text = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(text) as RecoveryState;
    // Reset the counter when the failure category changes (new failure type).
    if (parsed.category !== category) {
      return {
        schemaVersion: 1,
        kind: 'recoveryState',
        taskId,
        category,
        attemptCount: 0,
        lastAttemptAt: new Date().toISOString(),
        escalated: false
      };
    }
    return parsed;
  } catch {
    return {
      schemaVersion: 1,
      kind: 'recoveryState',
      taskId,
      category,
      attemptCount: 0,
      lastAttemptAt: new Date().toISOString(),
      escalated: false
    };
  }
}

async function writeRecoveryState(
  artifactRootDir: string,
  taskId: string,
  state: RecoveryState
): Promise<void> {
  const taskArtifactDir = path.join(artifactRootDir, taskId);
  await fs.mkdir(taskArtifactDir, { recursive: true });
  const statePath = getRecoveryStatePath(artifactRootDir, taskId);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Reads failure-analysis.json, selects the matching recovery playbook by
 * rootCauseCategory, tracks attempt counts, and executes side effects when
 * autoApplyRemediation is non-empty.
 *
 * Returns a RecoveryDecision the caller uses to steer the next iteration.
 */
export async function dispatchRecovery(ctx: RecoveryContext): Promise<RecoveryDecision> {
  const { analysis, artifactRootDir, taskId, taskTitle, maxRecoveryAttempts, autoApplyRemediation } = ctx;
  const canAutoApply = autoApplyRemediation.length > 0;

  const state = await loadRecoveryState(artifactRootDir, taskId, analysis.rootCauseCategory);
  const newAttemptCount = state.attemptCount + 1;

  // Max recovery attempts exceeded → escalate regardless of category.
  if (newAttemptCount > maxRecoveryAttempts) {
    const newState: RecoveryState = {
      ...state,
      attemptCount: newAttemptCount,
      lastAttemptAt: new Date().toISOString(),
      escalated: true
    };
    await writeRecoveryState(artifactRootDir, taskId, newState);

    if (canAutoApply) {
      const analysisPath = getFailureAnalysisPath(artifactRootDir, taskId);
      await ctx.emitOperatorNotification(
        `Task ${taskId} (${taskTitle}) has exceeded the maximum recovery attempts ` +
        `(${maxRecoveryAttempts}) for "${analysis.rootCauseCategory}". Manual intervention is required.`,
        analysisPath
      );
    }

    return {
      action: 'escalate_to_operator',
      pauseAgent: true,
      summary:
        `Max recovery attempts (${maxRecoveryAttempts}) exceeded for ` +
        `"${analysis.rootCauseCategory}"; escalating to operator.`,
      attemptCount: newAttemptCount,
      escalated: true,
      autoApplied: canAutoApply
    };
  }

  const newState: RecoveryState = {
    ...state,
    attemptCount: newAttemptCount,
    lastAttemptAt: new Date().toISOString(),
    escalated: false
  };

  let decision: RecoveryDecision;

  switch (analysis.rootCauseCategory) {
    case 'transient': {
      // No LLM diagnostic call — retry directly with exponential backoff.
      const backoffMs = computeBackoffMs(newAttemptCount);
      decision = {
        action: 'retry_with_backoff',
        pauseAgent: false,
        backoffMs,
        summary: `Transient failure; retry attempt ${newAttemptCount} with ${backoffMs}ms backoff.`,
        attemptCount: newAttemptCount,
        escalated: false,
        autoApplied: canAutoApply
      };
      break;
    }

    case 'implementation_error':
    case 'validation_mismatch': {
      // Persist the addendum so iterationPreparation can inject a
      // "Previous attempt context" section on the next iteration.
      if (analysis.retryPromptAddendum) {
        newState.retryPromptAddendum = analysis.retryPromptAddendum;
      }
      decision = {
        action: 'retry_with_addendum',
        pauseAgent: false,
        retryPromptAddendum: analysis.retryPromptAddendum,
        summary: `${analysis.rootCauseCategory}: retry attempt ${newAttemptCount} with prompt addendum.`,
        attemptCount: newAttemptCount,
        escalated: false,
        autoApplied: canAutoApply
      };
      break;
    }

    case 'task_ambiguity': {
      decision = {
        action: 'trigger_planning_pass',
        pauseAgent: false,
        summary: `Task ambiguity detected; triggering planning pass before retry (attempt ${newAttemptCount}).`,
        attemptCount: newAttemptCount,
        escalated: false,
        autoApplied: canAutoApply
      };
      break;
    }

    case 'dependency_missing': {
      // Release the claim so the scheduler can re-evaluate eligibility order.
      if (canAutoApply) {
        await ctx.releaseClaim();
      }
      decision = {
        action: 'release_claim_and_pause',
        pauseAgent: true,
        summary: `Dependency missing; claim released and agent paused for dependency re-evaluation.`,
        attemptCount: newAttemptCount,
        escalated: false,
        autoApplied: canAutoApply
      };
      break;
    }

    case 'environment_issue': {
      // Attempt preflight auto-remediation; the caller is responsible for
      // running the remediation step and escalating if it fails.
      decision = {
        action: 'attempt_preflight_remediation',
        pauseAgent: false,
        summary: `Environment issue; attempting preflight auto-remediation (attempt ${newAttemptCount}).`,
        attemptCount: newAttemptCount,
        escalated: false,
        autoApplied: canAutoApply
      };
      break;
    }

    default: {
      // Unrecognised category — escalate immediately.
      if (canAutoApply) {
        const analysisPath = getFailureAnalysisPath(artifactRootDir, taskId);
        await ctx.emitOperatorNotification(
          `Task ${taskId} (${taskTitle}) encountered an unrecognised failure category ` +
          `"${analysis.rootCauseCategory}". Manual review required.`,
          analysisPath
        );
      }
      newState.escalated = true;
      decision = {
        action: 'escalate_to_operator',
        pauseAgent: true,
        summary: `Unrecognised failure category "${analysis.rootCauseCategory}"; escalating to operator.`,
        attemptCount: newAttemptCount,
        escalated: true,
        autoApplied: canAutoApply
      };
      break;
    }
  }

  await writeRecoveryState(artifactRootDir, taskId, newState);
  return decision;
}
