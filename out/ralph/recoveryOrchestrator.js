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
exports.getRecoveryStatePath = getRecoveryStatePath;
exports.dispatchRecovery = dispatchRecovery;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const failureDiagnostics_1 = require("./failureDiagnostics");
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
async function dispatchRecovery(ctx) {
    const { analysis, artifactRootDir, taskId, taskTitle, maxRecoveryAttempts, autoApplyRemediation } = ctx;
    const canAutoApply = autoApplyRemediation.length > 0;
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