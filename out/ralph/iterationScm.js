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
exports.commitOnDone = commitOnDone;
exports.listGitConflictPaths = listGitConflictPaths;
exports.reconcileBranchPerTaskScm = reconcileBranchPerTaskScm;
const fs = __importStar(require("fs/promises"));
const error_1 = require("../util/error");
const processRunner_1 = require("../services/processRunner");
const taskFile_1 = require("./taskFile");
function formatScmCommitMessage(input) {
    return {
        subject: `ralph(${input.taskId}): ${input.taskTitle.replace(/\s+/g, ' ').trim()}`,
        body: `Agent: ${input.agentId} | Iteration: ${input.iteration} | Validation: ${input.validationStatus}`
    };
}
function scmAuthorEnv(agentId) {
    return {
        GIT_AUTHOR_NAME: `ralph/${agentId}`,
        GIT_COMMITTER_NAME: `ralph/${agentId}`
    };
}
function normalizeParentClaimRecord(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (typeof record.taskId !== 'string' || typeof record.claimedAt !== 'string') {
        return null;
    }
    return {
        taskId: record.taskId,
        claimedAt: record.claimedAt,
        baseBranch: typeof record.baseBranch === 'string' ? record.baseBranch : undefined,
        integrationBranch: typeof record.integrationBranch === 'string' ? record.integrationBranch : undefined
    };
}
function buildParentPullRequestBody(childTasks) {
    return [
        'Completed child tasks:',
        ...childTasks.map((task) => {
            const summary = (task.notes ?? '').trim() || 'No completion summary recorded.';
            return `- ${task.id}: ${summary}`;
        })
    ].join('\n');
}
async function resolveParentPullRequestBaseBranch(input) {
    const childTaskIds = new Set(input.childTasks.map((task) => task.id));
    try {
        const raw = await fs.readFile(input.claimFilePath, 'utf8');
        if (!raw.trim()) {
            return input.fallbackBaseBranch;
        }
        const parsed = JSON.parse(raw);
        const matchingClaim = (Array.isArray(parsed.claims) ? parsed.claims : [])
            .map((claim) => normalizeParentClaimRecord(claim))
            .filter((claim) => claim !== null)
            .filter((claim) => childTaskIds.has(claim.taskId)
            && claim.integrationBranch === input.integrationBranch
            && typeof claim.baseBranch === 'string'
            && claim.baseBranch.trim().length > 0)
            .sort((left, right) => {
            const leftTime = Date.parse(left.claimedAt);
            const rightTime = Date.parse(right.claimedAt);
            if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
                return 0;
            }
            if (Number.isNaN(leftTime)) {
                return 1;
            }
            if (Number.isNaN(rightTime)) {
                return -1;
            }
            return leftTime - rightTime;
        })[0];
        return matchingClaim?.baseBranch?.trim() || input.fallbackBaseBranch;
    }
    catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : '';
        if (code === 'ENOENT') {
            return input.fallbackBaseBranch;
        }
        throw error;
    }
}
async function createParentPullRequestOnDone(input) {
    if (!input.prepared.config.scmPrOnParentDone) {
        return [];
    }
    const prBaseBranch = await resolveParentPullRequestBaseBranch({
        claimFilePath: input.prepared.paths.claimFilePath,
        integrationBranch: input.integrationBranch,
        childTasks: input.childTasks,
        fallbackBaseBranch: input.fallbackBaseBranch
    });
    const pushResult = await (0, processRunner_1.runProcess)('git', ['push', '--set-upstream', 'origin', input.integrationBranch], { cwd: input.prepared.rootPath });
    if (pushResult.code !== 0) {
        const failure = (pushResult.stderr || pushResult.stdout || `exit code ${pushResult.code}`).trim();
        return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: git push failed: ${failure}`];
    }
    try {
        const prResult = await (0, processRunner_1.runProcess)('gh', [
            'pr',
            'create',
            '--base',
            prBaseBranch,
            '--head',
            input.integrationBranch,
            '--title',
            input.parentTask.title,
            '--body',
            buildParentPullRequestBody(input.childTasks)
        ], { cwd: input.prepared.rootPath });
        if (prResult.code !== 0) {
            const failure = (prResult.stderr || prResult.stdout || `exit code ${prResult.code}`).trim();
            return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: gh pr create failed: ${failure}`];
        }
    }
    catch (error) {
        return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: ${(0, error_1.toErrorMessage)(error)}`];
    }
    return [`SCM branch-per-task opened PR for parent ${input.parentTask.id} from ${input.integrationBranch} to ${prBaseBranch}.`];
}
async function commitOnDone(input) {
    const message = formatScmCommitMessage(input);
    const addResult = await (0, processRunner_1.runProcess)('git', ['add', '-A'], { cwd: input.rootPath });
    if (addResult.code !== 0) {
        const failure = (addResult.stderr || addResult.stdout || `exit code ${addResult.code}`).trim();
        throw new Error(`git add -A failed: ${failure}`);
    }
    const commitResult = await (0, processRunner_1.runProcess)('git', ['commit', '-m', message.subject, '-m', message.body], {
        cwd: input.rootPath,
        env: scmAuthorEnv(input.agentId)
    });
    if (commitResult.code !== 0) {
        const failure = (commitResult.stderr || commitResult.stdout || `exit code ${commitResult.code}`).trim();
        throw new Error(`git commit failed: ${failure}`);
    }
    return `SCM commit-on-done succeeded: ${message.subject}`;
}
async function checkoutGitBranch(rootPath, branchName) {
    const result = await (0, processRunner_1.runProcess)('git', ['checkout', branchName], { cwd: rootPath });
    if (result.code !== 0) {
        const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        throw new Error(`git checkout ${branchName} failed: ${failure}`);
    }
}
async function mergeGitBranch(input) {
    await checkoutGitBranch(input.rootPath, input.targetBranch);
    const result = await (0, processRunner_1.runProcess)('git', ['merge', '--no-ff', input.sourceBranch, '-m', input.subject, '-m', input.body], {
        cwd: input.rootPath,
        env: scmAuthorEnv(input.agentId)
    });
    if (result.code !== 0) {
        const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        throw new Error(failure);
    }
}
async function listGitConflictPaths(rootPath) {
    const result = await (0, processRunner_1.runProcess)('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: rootPath });
    if (result.code !== 0) {
        return [];
    }
    return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function reopenTaskWithMergeBlocker(input) {
    const locked = await (0, taskFile_1.withTaskFileLock)(input.taskFilePath, undefined, async () => {
        const taskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(input.taskFilePath, 'utf8'));
        const nextTaskFile = {
            ...taskFile,
            tasks: taskFile.tasks.map((task) => (task.id === input.taskId
                ? {
                    ...task,
                    status: 'in_progress',
                    blocker: input.blocker
                }
                : task))
        };
        await fs.writeFile(input.taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
async function reconcileBranchPerTaskScm(input) {
    const selectedTask = input.prepared.selectedTask;
    const selectedClaim = input.prepared.selectedTaskClaim?.claim;
    if (!selectedTask || !selectedClaim?.featureBranch || !selectedClaim.baseBranch) {
        return { warnings: [], parentCompletedAndMerged: false, parentTask: null };
    }
    const warnings = [];
    let parentCompletedAndMerged = false;
    let completedParentTask = null;
    // Track the branches involved in the most recent merge attempt so the
    // conflict resolver has accurate context if that merge throws.
    let lastMergeSource = selectedClaim.featureBranch;
    let lastMergeTarget = selectedClaim.integrationBranch ?? selectedClaim.baseBranch;
    const runMerge = async (mergeInput) => {
        lastMergeSource = mergeInput.sourceBranch;
        lastMergeTarget = mergeInput.targetBranch;
        await mergeGitBranch(mergeInput);
    };
    try {
        await checkoutGitBranch(input.prepared.rootPath, selectedClaim.featureBranch);
        warnings.push(await commitOnDone({
            rootPath: input.prepared.rootPath,
            taskId: selectedTask.id,
            taskTitle: selectedTask.title,
            agentId: input.prepared.config.agentId,
            iteration: input.prepared.iteration,
            validationStatus: input.validationStatus
        }));
        if (selectedClaim.integrationBranch) {
            await runMerge({
                rootPath: input.prepared.rootPath,
                targetBranch: selectedClaim.integrationBranch,
                sourceBranch: selectedClaim.featureBranch,
                subject: `ralph(${selectedTask.id}): merge ${selectedClaim.featureBranch} into ${selectedClaim.integrationBranch}`,
                body: `Agent: ${input.prepared.config.agentId} | Iteration: ${input.prepared.iteration} | Validation: ${input.validationStatus}`,
                agentId: input.prepared.config.agentId
            });
            warnings.push(`SCM branch-per-task merged ${selectedClaim.featureBranch} into ${selectedClaim.integrationBranch}.`);
            const parentTask = selectedTask.parentId
                ? (0, taskFile_1.findTaskById)(input.taskFileAfter, selectedTask.parentId)
                : null;
            const parentTaskBefore = selectedTask.parentId
                ? (0, taskFile_1.findTaskById)(input.prepared.taskFile, selectedTask.parentId)
                : null;
            if (parentTask && parentTask.status === 'done' && parentTaskBefore?.status !== 'done') {
                await runMerge({
                    rootPath: input.prepared.rootPath,
                    targetBranch: selectedClaim.baseBranch,
                    sourceBranch: selectedClaim.integrationBranch,
                    subject: `ralph(${parentTask.id}): ${parentTask.title.replace(/\s+/g, ' ').trim()}`,
                    body: `Atomic integration merge from ${selectedClaim.integrationBranch} for parent ${parentTask.id}`,
                    agentId: input.prepared.config.agentId
                });
                warnings.push(`SCM branch-per-task merged ${selectedClaim.integrationBranch} into ${selectedClaim.baseBranch} for parent ${parentTask.id}.`);
                parentCompletedAndMerged = true;
                completedParentTask = parentTask;
                const childTasks = input.taskFileAfter.tasks.filter((task) => task.parentId === parentTask.id);
                warnings.push(...await createParentPullRequestOnDone({
                    prepared: input.prepared,
                    parentTask,
                    integrationBranch: selectedClaim.integrationBranch,
                    fallbackBaseBranch: selectedClaim.baseBranch,
                    childTasks
                }));
            }
            else {
                await checkoutGitBranch(input.prepared.rootPath, selectedClaim.baseBranch);
            }
        }
        else {
            await runMerge({
                rootPath: input.prepared.rootPath,
                targetBranch: selectedClaim.baseBranch,
                sourceBranch: selectedClaim.featureBranch,
                subject: `ralph(${selectedTask.id}): ${selectedTask.title.replace(/\s+/g, ' ').trim()}`,
                body: `Atomic merge from ${selectedClaim.featureBranch} for top-level task ${selectedTask.id}`,
                agentId: input.prepared.config.agentId
            });
            warnings.push(`SCM branch-per-task merged ${selectedClaim.featureBranch} into ${selectedClaim.baseBranch}.`);
        }
    }
    catch (error) {
        const conflictPaths = await listGitConflictPaths(input.prepared.rootPath);
        const mergeTargetTaskId = conflictPaths.length > 0
            && selectedTask.parentId
            && (0, taskFile_1.findTaskById)(input.taskFileAfter, selectedTask.parentId)?.status === 'done'
            && (0, taskFile_1.findTaskById)(input.prepared.taskFile, selectedTask.parentId)?.status !== 'done'
            ? selectedTask.parentId
            : selectedTask.id;
        let resolved = false;
        if (conflictPaths.length > 0 && input.conflictResolver) {
            try {
                const resolverResult = await input.conflictResolver({
                    rootPath: input.prepared.rootPath,
                    conflictedFiles: conflictPaths,
                    taskId: mergeTargetTaskId,
                    sourceBranch: lastMergeSource,
                    targetBranch: lastMergeTarget,
                    agentId: input.prepared.config.agentId
                });
                resolved = resolverResult.resolved;
                if (resolved) {
                    warnings.push(`SCM conflict resolver resolved conflicts in: ${conflictPaths.join(', ')}`);
                }
            }
            catch (resolverError) {
                warnings.push(`SCM conflict resolver failed: ${(0, error_1.toErrorMessage)(resolverError)}`);
            }
        }
        if (!resolved) {
            const blocker = conflictPaths.length > 0
                ? `Merge conflict while reconciling branch-per-task SCM: ${conflictPaths.join(', ')}`
                : `Merge conflict while reconciling branch-per-task SCM: ${(0, error_1.toErrorMessage)(error)}`;
            await reopenTaskWithMergeBlocker({
                taskFilePath: input.prepared.paths.taskFilePath,
                taskId: mergeTargetTaskId,
                blocker
            });
            warnings.push(`SCM branch-per-task failed for ${selectedTask.id}: ${blocker}`);
        }
    }
    return { warnings, parentCompletedAndMerged, parentTask: completedParentTask };
}
//# sourceMappingURL=iterationScm.js.map