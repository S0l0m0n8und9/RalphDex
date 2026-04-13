"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeNewTask = normalizeNewTask;
const taskFile_1 = require("./taskFile");
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
function normalizeNewTask(input, options) {
    const record = { ...input };
    // 1. Alias mapping: rationale → notes (when notes is absent).
    if (record.rationale !== undefined && record.notes === undefined) {
        record.notes = record.rationale;
    }
    delete record.rationale;
    // 2. Flatten structured dependsOn entries to plain task-ID strings.
    if (Array.isArray(record.dependsOn)) {
        record.dependsOn = record.dependsOn.map((dep) => {
            if (typeof dep === 'object' && dep !== null && 'taskId' in dep) {
                return dep.taskId;
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
    (0, taskFile_1.autoCorrectKnownMistakes)(record);
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
    return (0, taskFile_1.normalizeTask)(record);
}
//# sourceMappingURL=taskNormalization.js.map