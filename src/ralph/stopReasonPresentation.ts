import type { RalphStopReason } from './types';

/**
 * Operator-facing presentation of a loop stop reason.
 *
 * This module is the single source of truth for turning a raw
 * {@link RalphStopReason} enum into human-readable text. It is consumed by the
 * status report, the dashboard, and stop notifications so that operators never
 * see a bare enum like `repeated_no_progress` and can always answer "what
 * happened and what do I do next?".
 *
 * It is intentionally dependency-free (type-only import) so the webview React
 * bundle can import it directly.
 */
export interface StopReasonPresentation {
  /** Short, title-case summary suitable for a badge or heading. */
  readonly label: string;
  /** One sentence explaining why the loop stopped. */
  readonly explanation: string;
  /** The concrete next action the operator can take. */
  readonly nextAction: string;
}

// Record over the closed RalphStopReason union: adding a new stop reason to the
// type forces a new entry here at compile time.
const PRESENTATIONS: Record<RalphStopReason, StopReasonPresentation> = {
  iteration_cap_reached: {
    label: 'Iteration cap reached',
    explanation: 'The loop hit the configured maximum number of iterations (ralphCodex.ralphIterationCap).',
    nextAction: 'Review progress, then raise the cap or run the loop again to continue.'
  },
  task_marked_complete: {
    label: 'Task complete',
    explanation: 'The selected task was marked done and no further work remains for it.',
    nextAction: 'Pick or seed the next task, or run the loop to continue the backlog.'
  },
  claim_contested: {
    label: 'Task claim contested',
    explanation: 'Another agent already holds the claim on this task.',
    nextAction: 'Run "Resolve Stale Task Claim" to clear the contested claim before retrying.'
  },
  policy_violation: {
    label: 'Policy violation',
    explanation: 'The completion report requested an action the active agent role is not allowed to perform.',
    nextAction: 'Check the agent role and task-state policy, then adjust the crew or task before retrying.'
  },
  planning_gate_decomposed: {
    label: 'Decomposed into subtasks',
    explanation: 'The planning gate split this task into child tasks instead of executing it directly.',
    nextAction: 'Review the generated child tasks, then run the loop to work through them.'
  },
  planning_gate_blocked: {
    label: 'Blocked at planning',
    explanation: 'The planning gate determined the task cannot proceed as written.',
    nextAction: 'Read the blocker note, unblock or rewrite the task, then retry.'
  },
  planning_gate_human_review: {
    label: 'Planning needs review',
    explanation: 'The planning gate flagged this task for human review before execution.',
    nextAction: 'Review the planning output and approve or adjust the task.'
  },
  repeated_no_progress: {
    label: 'No progress',
    explanation: 'Consecutive iterations made no measurable progress on the task.',
    nextAction: 'Inspect the latest transcript or diagnosis; refine the task, add context, or mark it blocked.'
  },
  repeated_identical_failure: {
    label: 'Repeated identical failure',
    explanation: 'The same failure recurred across consecutive iterations.',
    nextAction: 'Open the failure diagnosis; fix the root cause or decompose the task before retrying.'
  },
  human_review_needed: {
    label: 'Human review needed',
    explanation: 'The outcome requires explicit human judgement.',
    nextAction: 'Review the iteration, then approve, edit, or skip the task.'
  },
  execution_failed: {
    label: 'Execution failed',
    explanation: 'The provider invocation failed for this iteration (for example a CLI error or timeout).',
    nextAction: 'Check provider readiness and the latest CLI transcript, then retry.'
  },
  non_retryable_provider_error: {
    label: 'Non-retryable provider error',
    explanation: 'The provider rejected the request with a non-retryable error (e.g. unknown model ID or auth failure); a byte-identical retry cannot succeed.',
    nextAction: 'Check the provider configuration (model ID, API key, and permissions), fix the underlying cause, then restart the loop.'
  },
  no_actionable_task: {
    label: 'No actionable task',
    explanation: 'No executable task remains in the backlog.',
    nextAction: 'Seed or unblock tasks, or regenerate the PRD to add work.'
  },
  cancelled: {
    label: 'Cancelled',
    explanation: 'The run was cancelled before reaching a natural stop.',
    nextAction: 'Run the loop again when you are ready to resume.'
  }
};

/**
 * Returns the operator-facing presentation for a stop reason. Unknown values
 * (should be impossible given the closed union, but guards against drift from
 * untyped boundaries) fall back to the raw value with generic guidance.
 */
export function describeStopReason(reason: RalphStopReason): StopReasonPresentation {
  return (
    PRESENTATIONS[reason] ?? {
      label: reason,
      explanation: 'The loop stopped for this reason.',
      nextAction: 'Inspect the latest iteration and artifacts for details.'
    }
  );
}
