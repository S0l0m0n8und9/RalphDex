#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function resolveWorkspaceRoot() {
  if (process.argv[2]) {
    return path.resolve(process.argv[2]);
  }

  return path.resolve(__dirname, '..');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isTaskStatus(value) {
  return value === 'todo' || value === 'in_progress' || value === 'blocked' || value === 'done';
}

function loadTasks(taskFilePath) {
  const parsed = readJsonFile(taskFilePath);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
    throw new Error(`${taskFilePath} must contain a JSON object with a tasks array.`);
  }

  return parsed.tasks.map((task, index) => {
    if (!task || typeof task !== 'object') {
      throw new Error(`tasks[${index}] must be an object.`);
    }

    if (typeof task.id !== 'string' || task.id.trim().length === 0) {
      throw new Error(`tasks[${index}] must have a non-empty string id.`);
    }

    if (!isTaskStatus(task.status)) {
      throw new Error(`tasks[${index}] must have a valid status.`);
    }

    return {
      id: task.id.trim(),
      status: task.status,
      parentId: typeof task.parentId === 'string' && task.parentId.trim().length > 0
        ? task.parentId.trim()
        : undefined,
      dependsOn: Array.isArray(task.dependsOn)
        ? task.dependsOn.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
        : []
    };
  });
}

function loadClaims(claimFilePath) {
  if (!fs.existsSync(claimFilePath)) {
    return null;
  }

  const parsed = readJsonFile(claimFilePath);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.claims)) {
    throw new Error(`${claimFilePath} must contain a JSON object with a claims array.`);
  }

  return parsed.claims
    .filter((claim) => claim && typeof claim === 'object')
    .filter((claim) => typeof claim.taskId === 'string' && claim.taskId.trim().length > 0)
    .filter((claim) => (claim.status ?? 'active') === 'active')
    .map((claim) => ({
      taskId: claim.taskId.trim(),
      provenanceId: typeof claim.provenanceId === 'string' ? claim.provenanceId.trim() : ''
    }));
}

function isBlockingCliClaim(claim) {
  return claim.provenanceId.length > 0 && !/^run-i\d+-ide-/.test(claim.provenanceId);
}

function collectChildren(tasks) {
  const children = new Map();
  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }

    const siblings = children.get(task.parentId);
    if (siblings) {
      siblings.push(task);
    } else {
      children.set(task.parentId, [task]);
    }
  }

  return children;
}

function collectDescendants(taskId, childrenByParent, seen = new Set()) {
  const descendants = [];
  const children = childrenByParent.get(taskId) ?? [];

  for (const child of children) {
    if (seen.has(child.id)) {
      continue;
    }

    seen.add(child.id);
    descendants.push(child, ...collectDescendants(child.id, childrenByParent, seen));
  }

  return descendants;
}

function detectDependencyCycles(tasksById) {
  const findings = [];
  const visiting = new Set();
  const visited = new Set();
  const reported = new Set();

  function visit(taskId, stack) {
    if (visited.has(taskId)) {
      return;
    }

    const task = tasksById.get(taskId);
    if (!task) {
      return;
    }

    visiting.add(taskId);
    stack.push(taskId);

    for (const dependencyId of task.dependsOn) {
      if (!tasksById.has(dependencyId)) {
        continue;
      }

      if (visiting.has(dependencyId)) {
        const cycleStart = stack.indexOf(dependencyId);
        const cycle = [...stack.slice(cycleStart), dependencyId];
        const cycleKey = cycle.join('->');
        if (!reported.has(cycleKey)) {
          reported.add(cycleKey);
          findings.push({
            taskId,
            message: `dependency cycle detected: ${cycle.join(' -> ')}`
          });
        }
        continue;
      }

      if (!visited.has(dependencyId)) {
        visit(dependencyId, stack);
      }
    }

    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const taskId of tasksById.keys()) {
    visit(taskId, []);
  }

  return findings;
}

function validateLedger(tasks, activeClaims) {
  const findings = [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = collectChildren(tasks);
  const activeBlockingClaimTaskIds = activeClaims
    ? new Set(activeClaims.filter((claim) => isBlockingCliClaim(claim)).map((claim) => claim.taskId))
    : null;

  for (const task of tasks) {
    if (task.parentId && !tasksById.has(task.parentId)) {
      findings.push({
        taskId: task.id,
        message: `references missing parentId ${task.parentId}`
      });
    }

    for (const dependencyId of task.dependsOn) {
      if (!tasksById.has(dependencyId)) {
        findings.push({
          taskId: task.id,
          message: `references missing dependency ${dependencyId}`
        });
      }
    }

    if (task.status === 'done') {
      const unfinishedDescendants = collectDescendants(task.id, childrenByParent)
        .filter((descendant) => descendant.status !== 'done');

      if (unfinishedDescendants.length > 0) {
        findings.push({
          taskId: task.id,
          message: `is marked done but has unfinished descendants: ${unfinishedDescendants.map((descendant) => `${descendant.id} (${descendant.status})`).join(', ')}`
        });
      }
    }

    if (activeBlockingClaimTaskIds && activeBlockingClaimTaskIds.has(task.id) && task.status !== 'in_progress') {
      findings.push({
        taskId: task.id,
        message: 'has an active CLI claim in .ralph/claims.json but is not marked in_progress'
      });
    }
  }

  findings.push(...detectDependencyCycles(tasksById));
  return findings;
}

function runLedgerCheck(workspaceRoot) {
  const taskFilePath = path.join(workspaceRoot, '.ralph', 'tasks.json');
  const claimFilePath = path.join(workspaceRoot, '.ralph', 'claims.json');

  const tasks = loadTasks(taskFilePath);
  const activeClaims = loadClaims(claimFilePath);
  return validateLedger(tasks, activeClaims);
}

function main() {
  const workspaceRoot = resolveWorkspaceRoot();
  try {
    const findings = runLedgerCheck(workspaceRoot);

    if (findings.length === 0) {
      process.exitCode = 0;
      return;
    }

    for (const finding of findings) {
      process.stdout.write(`${finding.taskId}: ${finding.message}\n`);
    }

    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`check-ledger failed: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  runLedgerCheck
};

if (require.main === module) {
  main();
}
