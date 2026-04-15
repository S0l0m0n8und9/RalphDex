import * as fs from 'fs/promises';
import { toErrorMessage } from '../util/error';
import { runProcess } from '../services/processRunner';
import {
  findTaskById,
  parseTaskFile,
  stringifyTaskFile,
  withTaskFileLock
} from './taskFile';
import type { PreparedIterationContext } from './iterationPreparation';
import type {
  RalphTask,
  RalphTaskFile,
  RalphVerificationStatus,
} from './types';

function formatScmCommitMessage(input: {
  taskId: string;
  taskTitle: string;
  agentId: string;
  iteration: number;
  validationStatus: RalphVerificationStatus;
}): { subject: string; body: string } {
  return {
    subject: `ralph(${input.taskId}): ${input.taskTitle.replace(/\s+/g, ' ').trim()}`,
    body: `Agent: ${input.agentId} | Iteration: ${input.iteration} | Validation: ${input.validationStatus}`
  };
}

function scmAuthorEnv(agentId: string): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_NAME: `ralph/${agentId}`,
    GIT_COMMITTER_NAME: `ralph/${agentId}`
  };
}

function normalizeParentClaimRecord(candidate: unknown): {
  taskId: string;
  claimedAt: string;
  baseBranch?: string;
  integrationBranch?: string;
} | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
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

function buildParentPullRequestBody(childTasks: RalphTask[]): string {
  return [
    'Completed child tasks:',
    ...childTasks.map((task) => {
      const summary = (task.notes ?? '').trim() || 'No completion summary recorded.';
      return `- ${task.id}: ${summary}`;
    })
  ].join('\n');
}

async function resolveParentPullRequestBaseBranch(input: {
  claimFilePath: string;
  integrationBranch: string;
  childTasks: RalphTask[];
  fallbackBaseBranch: string;
}): Promise<string> {
  const childTaskIds = new Set(input.childTasks.map((task) => task.id));

  try {
    const raw = await fs.readFile(input.claimFilePath, 'utf8');
    if (!raw.trim()) {
      return input.fallbackBaseBranch;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const matchingClaim = (Array.isArray(parsed.claims) ? parsed.claims : [])
      .map((claim) => normalizeParentClaimRecord(claim))
      .filter((claim): claim is NonNullable<ReturnType<typeof normalizeParentClaimRecord>> => claim !== null)
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
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'ENOENT') {
      return input.fallbackBaseBranch;
    }

    throw error;
  }
}

async function createParentPullRequestOnDone(input: {
  prepared: PreparedIterationContext;
  parentTask: RalphTask;
  integrationBranch: string;
  fallbackBaseBranch: string;
  childTasks: RalphTask[];
}): Promise<string[]> {
  if (!input.prepared.config.scmPrOnParentDone) {
    return [];
  }

  const prBaseBranch = await resolveParentPullRequestBaseBranch({
    claimFilePath: input.prepared.paths.claimFilePath,
    integrationBranch: input.integrationBranch,
    childTasks: input.childTasks,
    fallbackBaseBranch: input.fallbackBaseBranch
  });

  const pushResult = await runProcess(
    'git',
    ['push', '--set-upstream', 'origin', input.integrationBranch],
    { cwd: input.prepared.rootPath }
  );
  if (pushResult.code !== 0) {
    const failure = (pushResult.stderr || pushResult.stdout || `exit code ${pushResult.code}`).trim();
    return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: git push failed: ${failure}`];
  }

  try {
    const prResult = await runProcess(
      'gh',
      [
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
      ],
      { cwd: input.prepared.rootPath }
    );
    if (prResult.code !== 0) {
      const failure = (prResult.stderr || prResult.stdout || `exit code ${prResult.code}`).trim();
      return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: gh pr create failed: ${failure}`];
    }
  } catch (error) {
    return [`SCM branch-per-task PR creation failed for parent ${input.parentTask.id}: ${toErrorMessage(error)}`];
  }

  return [`SCM branch-per-task opened PR for parent ${input.parentTask.id} from ${input.integrationBranch} to ${prBaseBranch}.`];
}

export async function commitOnDone(input: {
  rootPath: string;
  taskId: string;
  taskTitle: string;
  agentId: string;
  iteration: number;
  validationStatus: RalphVerificationStatus;
}): Promise<string> {
  const message = formatScmCommitMessage(input);
  const addResult = await runProcess('git', ['add', '-A'], { cwd: input.rootPath });
  if (addResult.code !== 0) {
    const failure = (addResult.stderr || addResult.stdout || `exit code ${addResult.code}`).trim();
    throw new Error(`git add -A failed: ${failure}`);
  }

  const commitResult = await runProcess(
    'git',
    ['commit', '-m', message.subject, '-m', message.body],
    {
      cwd: input.rootPath,
      env: scmAuthorEnv(input.agentId)
    }
  );
  if (commitResult.code !== 0) {
    const failure = (commitResult.stderr || commitResult.stdout || `exit code ${commitResult.code}`).trim();
    throw new Error(`git commit failed: ${failure}`);
  }

  return `SCM commit-on-done succeeded: ${message.subject}`;
}

async function checkoutGitBranch(rootPath: string, branchName: string): Promise<void> {
  const result = await runProcess('git', ['checkout', branchName], { cwd: rootPath });
  if (result.code !== 0) {
    const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
    throw new Error(`git checkout ${branchName} failed: ${failure}`);
  }
}

async function mergeGitBranch(input: {
  rootPath: string;
  targetBranch: string;
  sourceBranch: string;
  subject: string;
  body: string;
  agentId: string;
}): Promise<void> {
  await checkoutGitBranch(input.rootPath, input.targetBranch);
  const result = await runProcess(
    'git',
    ['merge', '--no-ff', input.sourceBranch, '-m', input.subject, '-m', input.body],
    {
      cwd: input.rootPath,
      env: scmAuthorEnv(input.agentId)
    }
  );
  if (result.code !== 0) {
    const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
    throw new Error(failure);
  }
}

export async function listGitConflictPaths(rootPath: string): Promise<string[]> {
  const result = await runProcess('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: rootPath });
  if (result.code !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function reopenTaskWithMergeBlocker(input: {
  taskFilePath: string;
  taskId: string;
  blocker: string;
}): Promise<void> {
  const locked = await withTaskFileLock(input.taskFilePath, undefined, async () => {
    const taskFile = parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8'));
    const nextTaskFile: RalphTaskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) => (
        task.id === input.taskId
          ? {
            ...task,
            status: 'in_progress',
            blocker: input.blocker
          }
          : task
      ))
    };

    await fs.writeFile(input.taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }
}

export interface BranchPerTaskScmResult {
  warnings: string[];
  parentCompletedAndMerged: boolean;
  parentTask: RalphTask | null;
}

/**
 * Callback passed by iterationEngine when autoScmOnConflict is enabled.
 * The resolver should attempt to resolve all conflicts in the working tree,
 * stage resolved files, and return whether all conflicts were cleared.
 */
export type ScmConflictResolver = (context: {
  rootPath: string;
  conflictedFiles: string[];
  taskId: string;
  sourceBranch: string;
  targetBranch: string;
  agentId: string;
}) => Promise<{ resolved: boolean }>;

export async function reconcileBranchPerTaskScm(input: {
  prepared: PreparedIterationContext;
  validationStatus: RalphVerificationStatus;
  taskFileAfter: RalphTaskFile;
  conflictResolver?: ScmConflictResolver;
}): Promise<BranchPerTaskScmResult> {
  const selectedTask = input.prepared.selectedTask;
  const selectedClaim = input.prepared.selectedTaskClaim?.claim;
  if (!selectedTask || !selectedClaim?.featureBranch || !selectedClaim.baseBranch) {
    return { warnings: [], parentCompletedAndMerged: false, parentTask: null };
  }

  const warnings: string[] = [];
  let parentCompletedAndMerged = false;
  let completedParentTask: RalphTask | null = null;

  // Track the branches involved in the most recent merge attempt so the
  // conflict resolver has accurate context if that merge throws.
  let lastMergeSource = selectedClaim.featureBranch;
  let lastMergeTarget = selectedClaim.integrationBranch ?? selectedClaim.baseBranch;

  const runMerge = async (mergeInput: Parameters<typeof mergeGitBranch>[0]): Promise<void> => {
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
        ? findTaskById(input.taskFileAfter, selectedTask.parentId)
        : null;
      const parentTaskBefore = selectedTask.parentId
        ? findTaskById(input.prepared.taskFile, selectedTask.parentId)
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
      } else {
        await checkoutGitBranch(input.prepared.rootPath, selectedClaim.baseBranch);
      }
    } else {
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
  } catch (error) {
    const conflictPaths = await listGitConflictPaths(input.prepared.rootPath);
    const mergeTargetTaskId = conflictPaths.length > 0
      && selectedTask.parentId
      && findTaskById(input.taskFileAfter, selectedTask.parentId)?.status === 'done'
      && findTaskById(input.prepared.taskFile, selectedTask.parentId)?.status !== 'done'
      ? selectedTask.parentId
      : selectedTask.id;

    let resolved = false;
    if (conflictPaths.length > 0
      && input.conflictResolver
      && mergeTargetTaskId !== selectedTask.id) {
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
      } catch (resolverError) {
        warnings.push(`SCM conflict resolver failed: ${toErrorMessage(resolverError)}`);
      }
    }

    if (!resolved) {
      const blocker = conflictPaths.length > 0
        ? `Merge conflict while reconciling branch-per-task SCM: ${conflictPaths.join(', ')}`
        : `Merge conflict while reconciling branch-per-task SCM: ${toErrorMessage(error)}`;
      await reopenTaskWithMergeBlocker({
        taskFilePath: input.prepared.paths.taskFilePath,
        taskId: mergeTargetTaskId,
        blocker
      });
      warnings.push(
        `SCM branch-per-task failed for ${selectedTask.id}: ${blocker}`
      );
    }
  }

  return { warnings, parentCompletedAndMerged, parentTask: completedParentTask };
}
