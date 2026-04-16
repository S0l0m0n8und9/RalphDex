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
exports.reconcileCompletionReport = reconcileCompletionReport;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const completionReportParser_1 = require("./completionReportParser");
const artifactStore_1 = require("./artifactStore");
const planningPass_1 = require("./planningPass");
const handoffManager_1 = require("./handoffManager");
const taskFile_1 = require("./taskFile");
const taskCreation_1 = require("./taskCreation");
const rolePolicy_1 = require("./rolePolicy");
async function reconcileCompletionReport(input) {
    const parsed = (0, completionReportParser_1.parseCompletionReport)(input.lastMessage);
    const artifactBase = {
        schemaVersion: 1,
        kind: 'completionReport',
        status: parsed.status === 'parsed' ? 'rejected' : parsed.status,
        rejectionReason: null,
        selectedTaskId: input.selectedTask?.id ?? null,
        report: parsed.report,
        rawBlock: parsed.rawBlock,
        parseError: parsed.parseError,
        warnings: []
    };
    if (!input.selectedTask || input.prepared.promptKind === 'replenish-backlog') {
        artifactBase.status = 'missing';
        return {
            artifact: artifactBase,
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            claimContested: false,
            warnings: []
        };
    }
    if (parsed.status !== 'parsed' || !parsed.report) {
        const warnings = parsed.status === 'invalid' && parsed.parseError
            ? [parsed.parseError]
            : parsed.status === 'missing'
                ? ['No completion report JSON block was found at the end of the Codex last message.']
                : [];
        artifactBase.warnings = warnings;
        return {
            artifact: {
                ...artifactBase,
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            claimContested: false,
            warnings
        };
    }
    const warnings = [];
    if (parsed.report.selectedTaskId !== input.selectedTask.id) {
        warnings.push(`Completion report selectedTaskId ${parsed.report.selectedTaskId} did not match the selected task ${input.selectedTask.id}.`);
        return {
            artifact: {
                ...artifactBase,
                rejectionReason: 'task_id_mismatch',
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            claimContested: false,
            warnings
        };
    }
    // Policy enforcement: check requested mutation and proposed actions against
    // the role's allowedTaskStateMutations / allowedNodeKinds before doing any
    // I/O (handoff scan or task-file write).
    {
        const policy = (0, rolePolicy_1.getEffectivePolicy)(input.prepared.config.agentRole ?? 'implementer');
        const reqStatus = parsed.report.requestedStatus;
        // Claim acquisition promotes todo→in_progress as a side effect and returns
        // the original task object (status still 'todo').  Use in_progress as the
        // effective from-status so mutation comparisons are correct.
        const effectiveFromStatus = input.selectedTask.status === 'todo' ? 'in_progress' : input.selectedTask.status;
        // requestedStatus === 'in_progress' is a heartbeat (no-op self-assignment).
        // The structural todo→in_progress transition is handled by claim acquisition,
        // so any role may emit a progress-only report without being policy-gated.
        const isHeartbeat = reqStatus === 'in_progress';
        const mutation = `${effectiveFromStatus}\u2192${reqStatus}`;
        const mutationAllowed = isHeartbeat || policy.allowedTaskStateMutations.includes(mutation);
        const childTasksProposed = (parsed.report.suggestedChildTasks?.length ?? 0) > 0;
        const sourceEditAllowed = policy.allowedNodeKinds.includes('task_exec');
        if (!mutationAllowed || (childTasksProposed && !sourceEditAllowed)) {
            const disallowedAction = !mutationAllowed
                ? `task-state mutation ${mutation}`
                : `suggestedChildTasks (source-edit proposal) by role '${input.prepared.config.agentRole ?? 'implementer'}'`;
            const policyWarning = `Policy violation (source: preset): disallowed ${disallowedAction} for role '${input.prepared.config.agentRole ?? 'implementer'}'.`;
            warnings.push(policyWarning);
            return {
                artifact: {
                    ...artifactBase,
                    status: 'rejected',
                    rejectionReason: 'policy_violation',
                    warnings,
                    needsHumanReview: true
                },
                selectedTask: input.selectedTask,
                progressChanged: false,
                taskFileChanged: false,
                claimContested: false,
                warnings
            };
        }
    }
    const acceptedHandoffs = await scanAcceptedHandoffs((0, handoffManager_1.resolveHandoffDir)(input.prepared.paths.ralphDir));
    let handoffScopeViolation = false;
    if (acceptedHandoffs.some((h) => h.taskId !== parsed.report.selectedTaskId)) {
        warnings.push('Completion report task does not match accepted handoff scope; downgrading to review required');
        handoffScopeViolation = true;
    }
    const requestedStatus = parsed.report.requestedStatus;
    if (requestedStatus === 'done') {
        // Allow reconciliation when the validation command passed, even if gitDiff
        // failed (no code changes needed — the task was already complete).  The
        // taskState verifier runs *after* reconciliation and will confirm the
        // status change in tasks.json, so the final verification still has a
        // meaningful gate.
        //
        // Documentation-mode tasks skip the validation gate entirely because their
        // deliverables (markdown, text) are not verifiable by code-centric commands.
        const validationGatePassed = input.validationCommandStatus === 'passed';
        const docMode = (0, taskFile_1.isDocumentationMode)(input.selectedTask);
        const taskStateOnlyGate = input.prepared.config.verifierModes.includes('taskState')
            && !input.prepared.config.verifierModes.includes('validationCommand')
            && !input.prepared.config.verifierModes.includes('gitDiff')
            && input.prepared.config.gitCheckpointMode !== 'snapshotAndDiff';
        if (!validationGatePassed
            && input.verificationStatus !== 'passed'
            && !docMode
            && !taskStateOnlyGate) {
            warnings.push(`Completion report requested done, but verification status was ${input.verificationStatus}.`);
        }
        if (parsed.report.needsHumanReview) {
            warnings.push('Completion report requested done while also declaring needsHumanReview.');
        }
        if (warnings.length > 0) {
            return {
                artifact: {
                    ...artifactBase,
                    rejectionReason: parsed.report.needsHumanReview
                        ? 'needs_human_review_with_done'
                        : 'verification_failed',
                    warnings
                },
                selectedTask: input.selectedTask,
                progressChanged: false,
                taskFileChanged: false,
                claimContested: false,
                warnings
            };
        }
        // Non-blocking observability: surface when an agent marks a task done without
        // reporting that it ran the configured validation command.  Ralph's own
        // verifierStatus already provides the hard enforcement gate; this warning
        // makes skipped validation self-reporting visible in parallel-run artefacts.
        if (input.prepared.validationCommand && !parsed.report.validationRan) {
            warnings.push(`Completed task without reporting validationRan; configured validation command was '${input.prepared.validationCommand}'.`);
        }
    }
    if (requestedStatus === 'blocked' && input.preliminaryClassification === 'complete') {
        warnings.push('Completion report requested blocked, but the preliminary outcome already classified the task as complete.');
        return {
            artifact: {
                ...artifactBase,
                rejectionReason: 'blocked_overrides_complete',
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            claimContested: false,
            warnings
        };
    }
    let taskFileChanged = false;
    let progressChanged = false;
    // If task-plan.json has a suggestedValidationCommand and the task's validation
    // field is currently empty, populate it so future iterations use it.
    const taskPlan = await (0, planningPass_1.readTaskPlan)(input.prepared.paths.artifactDir, input.selectedTask.id);
    const suggestedValidationFromPlan = taskPlan?.suggestedValidationCommand ?? null;
    // Claim ownership re-check, task-file write, and progress.md append all happen inside a
    // single task-file lock to eliminate the TOCTOU window and the unprotected progress.md
    // read-modify-write that existed when these operations ran sequentially outside any lock.
    const verificationResult = await updateTaskFileWithVerification(input.taskFilePath, input.prepared.paths.claimFilePath, input.selectedTask.id, input.prepared.config.agentId, input.prepared.provenanceId, input.prepared.paths.progressPath, parsed.report.progressNote ?? null, (taskFile) => {
        const selectedTaskUpdated = {
            ...taskFile,
            tasks: taskFile.tasks.map((task) => {
                if (task.id !== input.selectedTask.id) {
                    return task;
                }
                const nextTask = {
                    ...task,
                    status: requestedStatus,
                    notes: parsed.report.progressNote ?? task.notes,
                    blocker: requestedStatus === 'blocked'
                        ? parsed.report.blocker ?? task.blocker
                        : task.blocker
                };
                if (requestedStatus !== 'blocked' && parsed.report.blocker) {
                    nextTask.blocker = parsed.report.blocker;
                }
                // Populate validation from task-plan.json suggestedValidationCommand
                // only when the task's validation field was empty.
                if (!nextTask.validation && suggestedValidationFromPlan) {
                    nextTask.validation = suggestedValidationFromPlan;
                }
                taskFileChanged = nextTask.status !== task.status
                    || nextTask.notes !== task.notes
                    || nextTask.blocker !== task.blocker
                    || nextTask.validation !== task.validation;
                return nextTask;
            })
        };
        if (requestedStatus !== 'done') {
            return selectedTaskUpdated;
        }
        const ancestorCompletion = (0, taskFile_1.autoCompleteSatisfiedAncestors)(selectedTaskUpdated, input.selectedTask.id);
        if (ancestorCompletion.completedAncestorIds.length > 0) {
            taskFileChanged = true;
        }
        return ancestorCompletion.taskFile;
    });
    if (verificationResult.claimContested) {
        warnings.push(`Completion report claim ownership check failed for ${input.selectedTask.id}; canonical holder was ${verificationResult.canonicalHolder ?? 'none'}.`);
        return {
            artifact: {
                ...artifactBase,
                rejectionReason: 'claim_contested',
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            claimContested: true,
            warnings
        };
    }
    progressChanged = verificationResult.progressChanged;
    if (input.prepared.config.agentRole === 'watchdog' && parsed.report.watchdog_actions?.length) {
        const watchdogOutcome = await processWatchdogActions(input, parsed.report.watchdog_actions);
        taskFileChanged = taskFileChanged || watchdogOutcome.taskFileChanged;
        progressChanged = progressChanged || watchdogOutcome.progressChanged;
        warnings.push(...watchdogOutcome.warnings);
    }
    // Gap 7: Detect completed_parent_with_incomplete_descendants drift immediately
    // after reconciliation instead of waiting for the next preflight cycle.
    // autoCompleteSatisfiedAncestors can produce this state when it marks an ancestor
    // done while a sibling child remains open; parallel runs make the window worse.
    const postReconciliationTaskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(input.taskFilePath, 'utf8'));
    const selectedTask = (0, taskFile_1.findTaskById)(postReconciliationTaskFile, input.selectedTask.id);
    const driftDiagnostics = (0, taskFile_1.inspectTaskGraph)(postReconciliationTaskFile)
        .filter((d) => d.severity === 'error' && d.code === 'completed_parent_with_incomplete_descendants');
    for (const diagnostic of driftDiagnostics) {
        warnings.push(`Ledger drift after reconciliation: ${diagnostic.message}`);
    }
    if (warnings.length > 0) {
        input.logger.warn('Completion report reconciliation recorded warnings.', {
            selectedTaskId: input.selectedTask.id,
            warnings
        });
    }
    return {
        artifact: {
            ...artifactBase,
            status: 'applied',
            warnings,
            ...(handoffScopeViolation ? { needsHumanReview: true } : {})
        },
        selectedTask,
        progressChanged,
        taskFileChanged,
        claimContested: false,
        warnings
    };
}
// Acquires the task-file lock once and, inside that critical section, writes both
// tasks.json and the progress bullet.  Used by the watchdog escalate_to_human path so
// the progress.md append is never interleaved with concurrent task-file writes.
async function updateTaskFileWithProgress(taskFilePath, progressPath, progressNote, transform) {
    const locked = await (0, taskFile_1.withTaskFileLock)(taskFilePath, undefined, async () => {
        const nextTaskFile = (0, taskFile_1.bumpMutationCount)(transform((0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8'))));
        await fs.writeFile(taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
        const trimmed = progressNote.trim();
        if (trimmed) {
            const current = await fs.readFile(progressPath, 'utf8');
            await fs.writeFile(progressPath, `${current.trimEnd()}\n- ${trimmed}\n`, 'utf8');
        }
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
// Acquires the task-file lock once and, inside that single critical section:
// 1. Re-verifies claim ownership (eliminates the TOCTOU window between the prior standalone
//    inspectClaimOwnership call and the subsequent updateTaskFile call).
// 2. Applies the task transform and persists tasks.json.
// 3. Appends the progress bullet to progress.md (eliminates the unprotected read-modify-write
//    that existed when appendProgressBullet ran outside any lock).
async function updateTaskFileWithVerification(taskFilePath, claimFilePath, taskId, agentId, provenanceId, progressPath, progressNote, transform) {
    let claimContested = false;
    let canonicalHolder = null;
    let progressChanged = false;
    const locked = await (0, taskFile_1.withTaskFileLock)(taskFilePath, undefined, async () => {
        const claimOwnership = await (0, taskFile_1.inspectClaimOwnership)(claimFilePath, taskId, agentId, provenanceId);
        if (!claimOwnership.holdsActiveClaim) {
            const canonicalClaim = claimOwnership.canonicalClaim?.claim;
            canonicalHolder = canonicalClaim
                ? `${canonicalClaim.agentId}/${canonicalClaim.provenanceId}/${canonicalClaim.status}`
                : 'none';
            claimContested = true;
            return;
        }
        const nextTaskFile = (0, taskFile_1.bumpMutationCount)(transform((0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8'))));
        await fs.writeFile(taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
        if (progressNote) {
            const trimmed = progressNote.trim();
            if (trimmed) {
                const current = await fs.readFile(progressPath, 'utf8');
                await fs.writeFile(progressPath, `${current.trimEnd()}\n- ${trimmed}\n`, 'utf8');
                progressChanged = true;
            }
        }
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
    return { claimContested, canonicalHolder, progressChanged };
}
async function processWatchdogActions(input, watchdogActions) {
    let taskFileChanged = false;
    let progressChanged = false;
    const warnings = [];
    await (0, artifactStore_1.writeWatchdogDiagnosticArtifact)({
        artifactRootDir: input.prepared.paths.artifactDir,
        agentId: input.prepared.config.agentId,
        provenanceId: input.prepared.provenanceId,
        iteration: input.prepared.iteration,
        actions: watchdogActions
    }).catch((err) => {
        warnings.push(`Failed to write watchdog diagnostic artifact: ${err instanceof Error ? err.message : String(err)}`);
    });
    for (const action of watchdogActions) {
        if (action.action === 'resolve_stale_claim') {
            const resolved = await (0, taskFile_1.resolveStaleClaimByTask)(input.prepared.paths.claimFilePath, action.taskId, action.agentId, {
                resolutionReason: buildWatchdogResolutionReason(action),
                resolvedBy: input.prepared.config.agentId,
                status: 'stale'
            });
            if (resolved.lookupMiss) {
                warnings.push(`Watchdog action resolve_stale_claim could not find a canonical active claim for ${action.taskId} held by ${action.agentId}.`);
            }
            else if (resolved.outcome !== 'resolved') {
                warnings.push(`Watchdog action resolve_stale_claim was not eligible for ${action.taskId} held by ${action.agentId}.`);
            }
            continue;
        }
        if (action.action === 'decompose_task') {
            if (!action.suggestedChildTasks || action.suggestedChildTasks.length === 0) {
                warnings.push(`Watchdog action decompose_task for ${action.taskId} did not include suggestedChildTasks.`);
                continue;
            }
            if (!(await taskExists(input.taskFilePath, action.taskId))) {
                warnings.push(`Watchdog action decompose_task could not find task ${action.taskId}.`);
                continue;
            }
            await (0, taskCreation_1.applySuggestedChildTasksToFile)(input.taskFilePath, action.taskId, action.suggestedChildTasks);
            taskFileChanged = true;
            continue;
        }
        if (!(await taskExists(input.taskFilePath, action.taskId))) {
            warnings.push(`Watchdog action escalate_to_human could not find task ${action.taskId}.`);
            continue;
        }
        await updateTaskFileWithProgress(input.taskFilePath, input.prepared.paths.progressPath, buildWatchdogEscalationEntry(action), (taskFile) => ({
            ...taskFile,
            tasks: taskFile.tasks.map((task) => {
                if (task.id !== action.taskId) {
                    return task;
                }
                return {
                    ...task,
                    blocker: buildWatchdogBlocker(action)
                };
            })
        }));
        progressChanged = true;
        taskFileChanged = true;
    }
    return {
        taskFileChanged,
        progressChanged,
        warnings
    };
}
function buildWatchdogResolutionReason(action) {
    return `${action.severity} watchdog recovery: ${action.reason} Evidence: ${action.evidence}`;
}
function buildWatchdogEscalationEntry(action) {
    return `[watchdog][${action.severity}][${action.action}] task=${action.taskId} agent=${action.agentId} reason=${action.reason} evidence=${action.evidence} trailingNoProgress=${action.trailingNoProgressCount} trailingRepeatedFailure=${action.trailingRepeatedFailureCount}`;
}
function buildWatchdogBlocker(action) {
    return `Watchdog escalation (${action.severity}) for ${action.agentId}: ${action.reason}`;
}
async function taskExists(taskFilePath, taskId) {
    return (0, taskFile_1.findTaskById)((0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8')), taskId) !== null;
}
async function scanAcceptedHandoffs(handoffsDir) {
    let entries;
    try {
        entries = await fs.readdir(handoffsDir);
    }
    catch {
        return [];
    }
    const results = [];
    for (const entry of entries) {
        if (!entry.endsWith('.json')) {
            continue;
        }
        try {
            const raw = await fs.readFile(path.join(handoffsDir, entry), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed.status === 'accepted') {
                results.push(parsed);
            }
        }
        catch {
            // Skip malformed or unreadable files without crashing the loop.
        }
    }
    return results;
}
//# sourceMappingURL=reconciliation.js.map