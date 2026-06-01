"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShimError = exports.SHIM_EXIT_CODES = exports.SHIM_REPORT_SCHEMA_VERSION = void 0;
exports.exitCodeForCategory = exitCodeForCategory;
exports.categoryForError = categoryForError;
exports.categoryForIterationResult = categoryForIterationResult;
exports.buildIterationReport = buildIterationReport;
exports.buildErrorReport = buildErrorReport;
const transcriptSafety_1 = require("../codex/transcriptSafety");
/**
 * Stable automation contract for the headless CLI shim (`node out/shim/main.js`).
 *
 * The shim is an automation surface, not a second product: a single non-interactive
 * Ralph iteration outside the VS Code host. This module defines its deterministic
 * exit codes and the machine-readable report emitted in `--json` mode so automation
 * consumers can branch on the outcome without scraping human-readable text.
 */
exports.SHIM_REPORT_SCHEMA_VERSION = 1;
/**
 * Deterministic exit codes. Each failure mode maps to a stable, documented code so
 * automation can distinguish *why* a run failed without parsing output.
 */
exports.SHIM_EXIT_CODES = {
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
};
function exitCodeForCategory(category) {
    return exports.SHIM_EXIT_CODES[category];
}
/**
 * Error raised by the shim for configuration/usage problems. Carries a stable
 * {@link ShimResultCategory} so the top-level handler can map it to an exit code
 * and report category instead of collapsing everything to `internal`.
 */
class ShimError extends Error {
    category;
    constructor(message, category = 'config') {
        super(message);
        this.name = 'ShimError';
        this.category = category;
    }
}
exports.ShimError = ShimError;
function categoryForError(error) {
    return error instanceof ShimError ? error.category : 'internal';
}
function messageForError(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Maps a completed iteration result to a result category. This reflects whether
 * the *run* succeeded, not whether the task is finished — a successfully executed
 * and verified iteration whose task is still `blocked` is a `success` for the
 * shim (the blocked state is reported in the JSON body, not the exit code).
 */
function categoryForIterationResult(result) {
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
function redact(value) {
    return (0, transcriptSafety_1.redactSensitiveTranscriptData)(value);
}
/** Builds the machine-readable report for a completed iteration. All free text is redacted. */
function buildIterationReport(result) {
    const category = categoryForIterationResult(result);
    return {
        schemaVersion: exports.SHIM_REPORT_SCHEMA_VERSION,
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
function buildErrorReport(error) {
    const category = categoryForError(error);
    return {
        schemaVersion: exports.SHIM_REPORT_SCHEMA_VERSION,
        ok: false,
        category,
        exitCode: exitCodeForCategory(category),
        error: { message: redact(messageForError(error)), category }
    };
}
//# sourceMappingURL=contract.js.map