import { redactSensitiveTranscriptData } from '../codex/transcriptSafety';
import type {
  RalphCompletionClassification,
  RalphExecutionStatus,
  RalphIterationResult,
  RalphStopReason,
  RalphVerificationStatus
} from '../ralph/types';

/**
 * Stable automation contract for the headless CLI shim (`node out/shim/main.js`).
 *
 * The shim is an automation surface, not a second product: a single non-interactive
 * Ralph iteration outside the VS Code host. This module defines its deterministic
 * exit codes and the machine-readable report emitted in `--json` mode so automation
 * consumers can branch on the outcome without scraping human-readable text.
 */

export const SHIM_REPORT_SCHEMA_VERSION = 1 as const;

/**
 * Deterministic exit codes. Each failure mode maps to a stable, documented code so
 * automation can distinguish *why* a run failed without parsing output.
 */
export const SHIM_EXIT_CODES = {
  /** Iteration ran and the shim completed its job (the task may still be blocked). */
  success: 0,
  /** Unexpected/unclassified failure inside the shim. */
  internal: 1,
  /** Bad invocation or workspace/config that could not be loaded (usage, missing dir, malformed `.ralph-config.json`). */
  config: 2,
  /** The run was gated before execution (preflight not ready / no actionable task). */
  preflight: 3,
  /** The provider/CLI execution itself failed. */
  provider: 4,
  /** Execution ran but deterministic verification failed. */
  validation: 5
} as const;

export type ShimResultCategory = keyof typeof SHIM_EXIT_CODES;

export function exitCodeForCategory(category: ShimResultCategory): number {
  return SHIM_EXIT_CODES[category];
}

/**
 * Error raised by the shim for configuration/usage problems. Carries a stable
 * {@link ShimResultCategory} so the top-level handler can map it to an exit code
 * and report category instead of collapsing everything to `internal`.
 */
export class ShimError extends Error {
  readonly category: ShimResultCategory;

  constructor(message: string, category: ShimResultCategory = 'config') {
    super(message);
    this.name = 'ShimError';
    this.category = category;
  }
}

export function categoryForError(error: unknown): ShimResultCategory {
  return error instanceof ShimError ? error.category : 'internal';
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Maps a completed iteration result to a result category. This reflects whether
 * the *run* succeeded, not whether the task is finished — a successfully executed
 * and verified iteration whose task is still `blocked` is a `success` for the
 * shim (the blocked state is reported in the JSON body, not the exit code).
 */
export function categoryForIterationResult(result: RalphIterationResult): ShimResultCategory {
  if (result.executionStatus === 'failed') {
    return 'provider';
  }
  if (result.verificationStatus === 'failed') {
    return 'validation';
  }
  if (result.executionStatus === 'skipped') {
    // Gated before execution (preflight blocked, planning gate, or no actionable task).
    return 'preflight';
  }
  return 'success';
}

export interface ShimReport {
  schemaVersion: typeof SHIM_REPORT_SCHEMA_VERSION;
  ok: boolean;
  category: ShimResultCategory;
  exitCode: number;
  iteration?: number;
  selectedTaskId?: string | null;
  selectedTaskTitle?: string | null;
  executionStatus?: RalphExecutionStatus;
  verificationStatus?: RalphVerificationStatus;
  completionClassification?: RalphCompletionClassification;
  stopReason?: RalphStopReason | null;
  summary?: string;
  warnings?: string[];
  errors?: string[];
  error?: { message: string; category: ShimResultCategory };
}

function redact(value: string): string {
  return redactSensitiveTranscriptData(value);
}

/**
 * Redacts secrets from free-text shim output. Exposed so the shim entrypoint can
 * apply the same redaction guarantee to human/log output (e.g. on stderr in
 * `--json` mode) that the JSON report fields already receive.
 */
export function redactShimText(value: string): string {
  return redact(value);
}

/** Builds the machine-readable report for a completed iteration. All free text is redacted. */
export function buildIterationReport(result: RalphIterationResult): ShimReport {
  const category = categoryForIterationResult(result);
  return {
    schemaVersion: SHIM_REPORT_SCHEMA_VERSION,
    ok: category === 'success',
    category,
    exitCode: exitCodeForCategory(category),
    iteration: result.iteration,
    selectedTaskId: result.selectedTaskId,
    selectedTaskTitle: result.selectedTaskTitle,
    executionStatus: result.executionStatus,
    verificationStatus: result.verificationStatus,
    completionClassification: result.completionClassification,
    stopReason: result.stopReason,
    summary: redact(result.summary),
    warnings: result.warnings.map(redact),
    errors: result.errors.map(redact)
  };
}

/** Builds the machine-readable report for a failure thrown before/while running. */
export function buildErrorReport(error: unknown): ShimReport {
  const category = categoryForError(error);
  return {
    schemaVersion: SHIM_REPORT_SCHEMA_VERSION,
    ok: false,
    category,
    exitCode: exitCodeForCategory(category),
    error: { message: redact(messageForError(error)), category }
  };
}
