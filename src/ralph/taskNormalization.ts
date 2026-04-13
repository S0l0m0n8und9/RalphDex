/**
 * Shared task-normalization and augmentation pipeline for all task producers.
 *
 * Every code path that creates a new {@link RalphTask} — decomposition,
 * remediation, pipeline construction, or manual synthesis — should call
 * {@link normalizeNewTask} to get a canonical, coerced, and optionally
 * augmented task object before persistence.
 *
 * The pipeline delegates core coercion to `normalizeTask` in
 * `src/ralph/taskFile.ts` (the same normalizer used during file parsing)
 * and adds producer-facing conveniences:
 *
 * - Field alias mapping (e.g., `rationale` → `notes`)
 * - Structured-dependency flattening (`{ taskId }[]` → `string[]`)
 * - `null` → `undefined` coercion for nullable producer fields
 * - Optional parent-task augmentation for derive-if-possible fields
 * - Default status injection when the producer omits it
 *
 * See docs/invariants.md § Normalized Task Contract for the full field-presence
 * rules and coercion invariants that `normalizeTask` enforces downstream.
 */
import {
  RalphTask,
  RalphTaskMode,
  RalphTaskPriority,
  RalphTaskStatus,
  RalphTaskTier
} from './types';
import { autoCorrectKnownMistakes, normalizeTask } from './taskFile';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Loose producer-facing input accepted by {@link normalizeNewTask}.
 *
 * Accepts every supported `RalphTask` field plus common aliases and
 * producer-specific shapes (e.g., `rationale`, structured `dependsOn`).
 * Unknown fields and aliases are resolved before the record enters the
 * canonical `normalizeTask` coercion path.
 */
export interface RalphNewTaskInput {
  /** Required. Task identifier. */
  id: string;
  /** Required. Human-readable summary. */
  title: string;
  /**
   * Optional. Defaults to `options.defaultStatus` (or `'todo'`).
   * When supplied, must be a valid {@link RalphTaskStatus}.
   */
  status?: RalphTaskStatus;
  parentId?: string;
  /**
   * Dependency list. Accepts either plain task-ID strings or structured
   * objects with a `taskId` property (as produced by decomposition proposals).
   * Structured entries are flattened to their `taskId` before normalization.
   */
  dependsOn?: Array<string | { taskId: string }>;
  notes?: string;
  /**
   * Accepts `string`, `null`, or `undefined`.
   * `null` is coerced to `undefined` before normalization (matching the
   * `RalphSuggestedChildTask` convention).
   */
  validation?: string | null;
  blocker?: string;
  priority?: RalphTaskPriority | string;
  mode?: RalphTaskMode | string;
  tier?: RalphTaskTier | string;
  acceptance?: string[];
  constraints?: string[];
  context?: string[];
  /** Alias for `notes`. Mapped when `notes` is absent. */
  rationale?: string;
  /** Allow additional keys so alias auto-correction can process them. */
  [key: string]: unknown;
}

/**
 * Options that control augmentation and defaults during normalization.
 */
export interface TaskNormalizationOptions {
  /**
   * Parent task for field augmentation. When supplied, derive-if-possible
   * fields (`mode`, `tier`, `validation`) are inherited from the parent
   * when the producer input does not supply them.
   */
  parentTask?: RalphTask;
  /**
   * Default status injected when the input omits `status`.
   * Defaults to `'todo'`.
   */
  defaultStatus?: RalphTaskStatus;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Normalize and optionally augment a producer-supplied task input into a
 * canonical {@link RalphTask}.
 *
 * This is the single entry point that all task producers should use when
 * creating new tasks. It applies — in order:
 *
 * 1. **Alias mapping** — `rationale` → `notes`.
 * 2. **Structured-dependency flattening** — `{ taskId }[]` → `string[]`.
 * 3. **Null coercion** — `validation: null` → `undefined`.
 * 4. **Default status** — injects `'todo'` (or `options.defaultStatus`) when absent.
 * 5. **Field-name auto-correction** — maps known misspellings (e.g., `dependencies` → `dependsOn`).
 * 6. **Parent augmentation** — inherits derive-if-possible fields from `options.parentTask`.
 * 7. **Canonical normalization** — delegates to `normalizeTask` for coercion,
 *    deduplication, enum validation, and unknown-field drop.
 */
export function normalizeNewTask(
  input: RalphNewTaskInput,
  options?: TaskNormalizationOptions
): RalphTask {
  const record: Record<string, unknown> = { ...input };

  // 1. Alias mapping: rationale → notes (when notes is absent).
  if (record.rationale !== undefined && record.notes === undefined) {
    record.notes = record.rationale;
  }
  delete record.rationale;

  // 2. Flatten structured dependsOn entries to plain task-ID strings.
  if (Array.isArray(record.dependsOn)) {
    record.dependsOn = (record.dependsOn as unknown[]).map((dep) => {
      if (typeof dep === 'object' && dep !== null && 'taskId' in dep) {
        return (dep as { taskId: string }).taskId;
      }
      return dep;
    });
  }

  // 3. Null → undefined for validation.
  if (record.validation === null) {
    delete record.validation;
  }

  // 4. Default status injection.
  if (record.status === undefined) {
    record.status = options?.defaultStatus ?? 'todo';
  }

  // 5. Auto-correct known field-name mistakes.
  autoCorrectKnownMistakes(record);

  // 6. Parent augmentation (derive-if-possible fields only).
  const parent = options?.parentTask;
  if (parent) {
    if (record.mode === undefined && parent.mode !== undefined) {
      record.mode = parent.mode;
    }
    if (record.tier === undefined && parent.tier !== undefined) {
      record.tier = parent.tier;
    }
    if (record.validation === undefined && parent.validation !== undefined) {
      record.validation = parent.validation;
    }
  }

  // 7. Canonical normalization (coercion, deduplication, unknown-field drop).
  return normalizeTask(record);
}
