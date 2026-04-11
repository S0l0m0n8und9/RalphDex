"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFailureEvent = recordFailureEvent;
exports.detectSystemicCategory = detectSystemicCategory;
exports.getSystemicAlertPath = getSystemicAlertPath;
exports.getRecoveryStatePath = getRecoveryStatePath;
exports.dispatchRecovery = dispatchRecovery;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const failureDiagnostics_1 = require("./failureDiagnostics");
// ---------------------------------------------------------------------------
// In-memory failure-chain rolling window (not persisted between runs)
//
// Keyed by artifactRootDir so each Ralph run (and each test's tmpDir) has an
// isolated window, preventing cross-run interference.
// ---------------------------------------------------------------------------
const WINDOW_SIZE = 10;
const SYSTEMIC_CATEGORY_THRESHOLD = 3;
const CONFIDENCE_NUMERIC_THRESHOLD = 0.7;
const failureWindowsByRun = new Map();
function getRunWindow(artifactRootDir) {
    let window = failureWindowsByRun.get(artifactRootDir);
    if (!window) {
        window = [];
        failureWindowsByRun.set(artifactRootDir, window);
    }
    return window;
}
function confidenceToNumeric(confidence) {
    switch (confidence) {
        case 'high': return 1.0;
        case 'medium': return 0.7;
        case 'low': return 0.3;
    }
}
/** Appends a failure event to the rolling window for the given run, evicting the oldest when full. */
function recordFailureEvent(artifactRootDir, taskId, category, confidence) {
    const window = getRunWindow(artifactRootDir);
    window.push({ taskId, category, confidenceNumeric: confidenceToNumeric(confidence) });
    if (window.length > WINDOW_SIZE) {
        window.shift();
    }
}
/**
 * Returns the first category (if any) in the window for the given run where
 * 3+ *distinct* task IDs share the same category and have confidence >= 0.7.
 *
 * Distinct-task counting prevents repeated retries of one task from being
 * mistaken for a cross-task systemic pattern.
 */
function detectSystemicCategory(artifactRootDir) {
    const window = getRunWindow(artifactRootDir);
    const categoryMap = new Map();
    for (const entry of window) {
        if (entry.confidenceNumeric >= CONFIDENCE_NUMERIC_THRESHOLD) {
            const taskIdSet = categoryMap.get(entry.category) ?? new Set();
            taskIdSet.add(entry.taskId);
            categoryMap.set(entry.category, taskIdSet);
        }
    }
    for (const [category, taskIdSet] of categoryMap) {
        if (taskIdSet.size >= SYSTEMIC_CATEGORY_THRESHOLD) {
            return { category, affectedTaskIds: [...taskIdSet] };
        }
    }
    return null;
}
/** Returns the path where systemic-failure-alert.json is written. */
function getSystemicAlertPath(artifactRootDir) {
    return path.join(artifactRootDir, 'systemic-failure-alert.json');
}
async function writeSystemicAlert(artifactRootDir, category, affectedTaskIds) {
    const alert = {
        schemaVersion: 1,
        kind: 'systemicFailureAlert',
        detectedAt: new Date().toISOString(),
        sharedCategory: category,
        affectedTaskIds,
        recommendedOperatorAction: `Systemic "${category}" failures detected across ${affectedTaskIds.length} tasks. ` +
            `Investigate shared infrastructure, dependencies, or prompt configuration before resuming.`
    };
    await fs.mkdir(artifactRootDir, { recursive: true });
    await fs.writeFile(getSystemicAlertPath(artifactRootDir), JSON.stringify(alert, null, 2), 'utf8');
}
// ---------------------------------------------------------------------------
// Backoff helpers
// ---------------------------------------------------------------------------
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
/** Computes exponential backoff: 1s, 2s, 4s, … capped at 30s. */
function computeBackoffMs(attemptCount) {
    return Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1), MAX_BACKOFF_MS);
}
/** Returns the path where recovery-state.json is stored for a task. */
function getRecoveryStatePath(artifactRootDir, taskId) {
    return path.join(artifactRootDir, taskId, 'recovery-state.json');
}
async function loadRecoveryState(artifactRootDir, taskId, category) {
    const statePath = getRecoveryStatePath(artifactRootDir, taskId);
    try {
        const text = await fs.readFile(statePath, 'utf8');
        const parsed = JSON.parse(text);
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
    }
    catch {
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
async function writeRecoveryState(artifactRootDir, taskId, state) {
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
async function maybeWriteDeadLetter(ctx, attemptCount) {
    if (!ctx.writeDeadLetterEntry) {
        return;
    }
    const history = ctx.diagnosticHistory ?? [ctx.analysis];
    const entry = {
        schemaVersion: 1,
        kind: 'deadLetterEntry',
        taskId: ctx.taskId,
        taskTitle: ctx.taskTitle,
        deadLetteredAt: new Date().toISOString(),
        diagnosticHistory: history,
        recoveryAttemptCount: attemptCount
    };
    await ctx.writeDeadLetterEntry(entry);
}
async function dispatchRecovery(ctx) {
    const { analysis, artifactRootDir, taskId, taskTitle, maxRecoveryAttempts, autoApplyRemediation } = ctx;
    const canAutoApply = autoApplyRemediation.length > 0;
    // Record this failure in the in-memory rolling window before any playbook logic.
    recordFailureEvent(artifactRootDir, taskId, analysis.rootCauseCategory, analysis.confidence);
    // Check for systemic failure pattern before dispatching the per-task playbook.
    const systemic = detectSystemicCategory(artifactRootDir);
    if (systemic) {
        await writeSystemicAlert(artifactRootDir, systemic.category, systemic.affectedTaskIds);
        return {
            action: 'escalate_to_operator',
            pauseAgent: true,
            summary: `Systemic "${systemic.category}" failures detected across tasks ` +
                `[${systemic.affectedTaskIds.join(', ')}]. Alert written to systemic-failure-alert.json. ` +
                `All agents paused — investigate before resuming.`,
            attemptCount: 0,
            escalated: true,
            autoApplied: canAutoApply
        };
    }
    const state = await loadRecoveryState(artifactRootDir, taskId, analysis.rootCauseCategory);
    const newAttemptCount = state.attemptCount + 1;
    // Max recovery attempts exceeded → escalate regardless of category.
    if (newAttemptCount > maxRecoveryAttempts) {
        const newState = {
            ...state,
            attemptCount: newAttemptCount,
            lastAttemptAt: new Date().toISOString(),
            escalated: true
        };
        await writeRecoveryState(artifactRootDir, taskId, newState);
        if (canAutoApply) {
            const analysisPath = (0, failureDiagnostics_1.getFailureAnalysisPath)(artifactRootDir, taskId);
            await ctx.emitOperatorNotification(`Task ${taskId} (${taskTitle}) has exceeded the maximum recovery attempts ` +
                `(${maxRecoveryAttempts}) for "${analysis.rootCauseCategory}". Manual intervention is required.`, analysisPath);
        }
        await maybeWriteDeadLetter(ctx, newAttemptCount);
        return {
            action: 'escalate_to_operator',
            pauseAgent: true,
            summary: `Max recovery attempts (${maxRecoveryAttempts}) exceeded for ` +
                `"${analysis.rootCauseCategory}"; escalating to operator.`,
            attemptCount: newAttemptCount,
            escalated: true,
            autoApplied: canAutoApply
        };
    }
    const newState = {
        ...state,
        attemptCount: newAttemptCount,
        lastAttemptAt: new Date().toISOString(),
        escalated: false
    };
    let decision;
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
                const analysisPath = (0, failureDiagnostics_1.getFailureAnalysisPath)(artifactRootDir, taskId);
                await ctx.emitOperatorNotification(`Task ${taskId} (${taskTitle}) encountered an unrecognised failure category ` +
                    `"${analysis.rootCauseCategory}". Manual review required.`, analysisPath);
            }
            newState.escalated = true;
            await maybeWriteDeadLetter(ctx, newAttemptCount);
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
//# sourceMappingURL=recoveryOrchestrator.js.map