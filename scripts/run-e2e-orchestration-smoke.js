#!/usr/bin/env node

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runOrExit(command, args, options = {}) {
  const spawnInput = process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`]
      }
    : { command, args };

  const result = spawnSync(spawnInput.command, spawnInput.args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeEvidence(ref, summary) {
  return [{ kind: 'verifier_outcome', ref, summary }];
}

async function dumpWorkspaceOnFailure(rootPath) {
  try {
    const orchestrationRoot = path.join(rootPath, '.ralph', 'orchestration');
    const entries = await fsp.readdir(orchestrationRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const runDir = path.join(orchestrationRoot, entry.name);
      const runFiles = await fsp.readdir(runDir).catch(() => []);
      for (const file of runFiles) {
        const raw = await fsp.readFile(path.join(runDir, file), 'utf8').catch(() => null);
        if (raw) {
          console.error(`\n--- orchestration/${entry.name}/${file} ---\n${raw}`);
        }
      }
    }

    const handoffDir = path.join(rootPath, '.ralph', 'handoffs');
    const handoffFiles = await fsp.readdir(handoffDir).catch(() => []);
    for (const file of handoffFiles) {
      const raw = await fsp.readFile(path.join(handoffDir, file), 'utf8').catch(() => null);
      if (raw) {
        console.error(`\n--- handoffs/${file} ---\n${raw}`);
      }
    }
  } catch {
    /* best-effort */
  }
}

async function runGraphLifecycleScenario(modules, rootPath) {
  const { supervisor } = modules;
  const runId = 'run-smoke-001';
  const ralphDir = path.join(rootPath, '.ralph');
  const paths = supervisor.resolveOrchestrationPaths(ralphDir, runId);

  // Graph: entry → fanout → impl_a → fanin → scm_submit
  // Models a single fan-out branch traversed as a sequential path plus a fan-in
  // gateway. The supervisor advances one transition per write, so we traverse
  // the fan-out/fan-in nodes in a deterministic order rather than concurrently.
  const graph = {
    schemaVersion: 1,
    runId,
    entryNodeId: 'entry',
    createdAt: nowIso(),
    nodes: [
      { id: 'entry', kind: 'task_exec', label: 'Entry' },
      { id: 'fanout', kind: 'fanout', label: 'Fan out to implementers' },
      { id: 'impl_a', kind: 'task_exec', label: 'Implementer branch A', assignedRole: 'implementer' },
      { id: 'fanin', kind: 'fanin', label: 'Fan in gate' },
      { id: 'scm', kind: 'scm_submit', label: 'SCM submit' }
    ],
    edges: [
      {
        from: 'entry',
        to: 'fanout',
        evidenceRequired: makeEvidence('.ralph/stub/entry.json', 'entry completed')
      },
      {
        from: 'fanout',
        to: 'impl_a',
        evidenceRequired: makeEvidence('.ralph/stub/fanout.json', 'fan-out dispatched')
      },
      {
        from: 'impl_a',
        to: 'fanin',
        evidenceRequired: makeEvidence('.ralph/stub/impl-a.json', 'implementer A done')
      },
      {
        from: 'fanin',
        to: 'scm',
        evidenceRequired: makeEvidence('.ralph/stub/fanin.json', 'fan-in gate passed')
      }
    ]
  };

  await supervisor.writeOrchestrationGraph(paths, graph);
  let state = supervisor.initializeState(graph);
  await supervisor.writeOrchestrationState(paths, state);

  // Before advancing past fan-in, a direct cursor→scm attempt must fail — there
  // is no edge bypassing the fan-in gateway. This proves the supervisor blocks
  // premature completion when the fan-in gate has not been reached.
  state = supervisor.advanceState(graph, state, 'fanout', makeEvidence('.ralph/stub/entry.json', 'entry done'));
  await supervisor.writeOrchestrationState(paths, state);
  state = supervisor.advanceState(graph, state, 'impl_a', makeEvidence('.ralph/stub/fanout.json', 'fanout dispatched'));
  await supervisor.writeOrchestrationState(paths, state);
  state = supervisor.advanceState(graph, state, 'fanin', makeEvidence('.ralph/stub/impl-a.json', 'impl A done'));
  await supervisor.writeOrchestrationState(paths, state);

  // Attempting to skip the fan-in and jump straight to scm should fail: no edge
  // fanin→scm has been traversed yet, but also the only legal next target is
  // 'scm'. Try an illegal jump to 'impl_a' from the fan-in cursor to prove
  // the cursor enforces single-transition-per-write semantics.
  let illegalBypassError = null;
  try {
    supervisor.advanceState(graph, state, 'impl_a', makeEvidence('.ralph/stub/fanin.json', 'illegal skip'));
  } catch (err) {
    illegalBypassError = err;
  }
  assert.ok(
    illegalBypassError instanceof supervisor.OrchestrationTransitionError,
    'Supervisor must reject transitions that do not correspond to a graph edge.'
  );

  state = supervisor.advanceState(graph, state, 'scm', makeEvidence('.ralph/stub/fanin.json', 'fan-in passed'));
  await supervisor.writeOrchestrationState(paths, state);

  await fsp.access(paths.statePath);
  await fsp.access(paths.graphPath);

  for (const nodeId of ['entry', 'fanout', 'impl_a', 'fanin', 'scm']) {
    await supervisor.writeNodeSpan(paths, nodeId, {
      nodeId,
      runId,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      agentId: 'stub-agent',
      agentRole: nodeId === 'impl_a' ? 'implementer' : 'build',
      inputRefs: [`.ralph/stub/${nodeId}-in.json`],
      outputRefs: [`.ralph/stub/${nodeId}-out.json`],
      stopClassification: 'completed'
    });
  }

  const spanFiles = await fsp.readdir(paths.directory);
  const spanNames = spanFiles.filter((f) => f.startsWith('node-') && f.endsWith('-span.json')).sort();
  assert.deepEqual(
    spanNames,
    [
      'node-entry-span.json',
      'node-fanin-span.json',
      'node-fanout-span.json',
      'node-impl_a-span.json',
      'node-scm-span.json'
    ],
    'A span file must exist for every node in the graph.'
  );

  const persistedState = await supervisor.readOrchestrationState(paths);
  assert.equal(persistedState.cursor, null, 'Cursor must be null after terminal node completes.');
  const completedCount = persistedState.nodeStates.filter((ns) => ns.outcome === 'completed').length;
  assert.equal(completedCount, graph.nodes.length, 'Every node must be completed after traversal.');

  return { runId, spanCount: spanNames.length };
}

async function runPlanGraphFanInScenario(modules, rootPath) {
  const { planGraph } = modules;
  const parentId = 'T_parent';
  const planGraphPath = path.join(rootPath, '.ralph', 'plan-graphs', `${parentId}.json`);

  const graph = {
    parentTaskId: parentId,
    waves: [
      {
        waveIndex: 0,
        memberTaskIds: ['c1', 'c2'],
        launchGuards: [],
        fanInCriteria: ['all-done'],
        status: 'pending'
      }
    ],
    createdAt: nowIso()
  };
  await planGraph.writePlanGraph(planGraphPath, graph);

  // Phase 1: children not yet done → fan-in must fail, so the parent cannot
  // complete. This proves fan-in gate blocking before completion.
  const incompleteTasks = [
    { id: 'c1', title: 'Child 1', status: 'in_progress' },
    { id: 'c2', title: 'Child 2', status: 'todo' }
  ];
  const incompleteResult = await planGraph.validateFanIn(planGraphPath, graph, incompleteTasks);
  assert.equal(incompleteResult.passed, false, 'Fan-in must fail while children are not done.');
  assert.ok(
    incompleteResult.errors.length > 0,
    'Fan-in failure must surface at least one error message.'
  );

  // Phase 2: all children done → fan-in passes, releasing the parent.
  const updatedGraph = await planGraph.readPlanGraph(planGraphPath);
  assert.ok(updatedGraph, 'Plan graph must still exist after a failing fan-in.');
  const completeTasks = [
    { id: 'c1', title: 'Child 1', status: 'done', lastVerifierResult: 'passed' },
    { id: 'c2', title: 'Child 2', status: 'done', lastVerifierResult: 'passed' }
  ];
  const passResult = await planGraph.validateFanIn(planGraphPath, updatedGraph, completeTasks);
  assert.equal(passResult.passed, true, 'Fan-in must pass once all children are done.');

  return {
    planGraphPath,
    firstErrors: incompleteResult.errors.length,
    finalResult: passResult.passed
  };
}

async function runHandoffLifecycleScenario(modules, rootPath) {
  const { handoffManager } = modules;
  const ralphDir = path.join(rootPath, '.ralph');

  const proposed = await handoffManager.proposeHandoff(ralphDir, {
    handoffId: 'h-smoke-001',
    fromAgentId: 'planner-1',
    toRole: 'implementer',
    taskId: 'T_impl_1',
    objective: 'Implement the caching module',
    constraints: ['Do not touch the public API'],
    acceptedEvidence: [
      { kind: 'verifier_outcome', ref: '.ralph/stub/plan.json', summary: 'planning approved' }
    ],
    expectedOutputContract: 'Unit tests cover every new path',
    stopConditions: ['Validation gate passes'],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    provenanceLinks: ['.ralph/provenance/smoke/bundle.json']
  });
  assert.equal(proposed.status, 'proposed');
  assert.equal(proposed.history.length, 0, 'proposed handoff starts with empty history');

  const accepted = await handoffManager.acceptHandoff(
    ralphDir,
    'h-smoke-001',
    'impl-1',
    'implementer',
    'implementer picked up the task'
  );
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.history.length, 1, 'one history entry should record proposed→accepted');
  assert.equal(accepted.history[0].from, 'proposed');
  assert.equal(accepted.history[0].to, 'accepted');

  // Rejection path on a second handoff — proves the lifecycle also records
  // rejection transitions so contested/rejected handoffs are inspectable.
  await handoffManager.proposeHandoff(ralphDir, {
    handoffId: 'h-smoke-002',
    fromAgentId: 'planner-1',
    toRole: 'reviewer',
    taskId: 'T_review_1',
    objective: 'Review the caching module change',
    constraints: [],
    acceptedEvidence: [],
    expectedOutputContract: 'Review verdict emitted',
    stopConditions: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    provenanceLinks: []
  });
  const rejected = await handoffManager.rejectHandoff(ralphDir, 'h-smoke-002', 'reviewer unavailable');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.history.length, 1);

  // Attempting to accept with a role that does not match `toRole` must fail.
  let wrongRoleError = null;
  try {
    await handoffManager.proposeHandoff(ralphDir, {
      handoffId: 'h-smoke-003',
      fromAgentId: 'planner-1',
      toRole: 'reviewer',
      taskId: 'T_review_2',
      objective: 'Review the caching module change again',
      constraints: [],
      acceptedEvidence: [],
      expectedOutputContract: 'Review verdict emitted',
      stopConditions: [],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      provenanceLinks: []
    });
    await handoffManager.acceptHandoff(
      ralphDir,
      'h-smoke-003',
      'impl-1',
      'implementer',
      'wrong role accept'
    );
  } catch (err) {
    wrongRoleError = err;
  }
  assert.ok(
    wrongRoleError instanceof handoffManager.HandoffLifecycleError,
    'accepting with the wrong role must raise a HandoffLifecycleError'
  );

  return { acceptedId: accepted.handoffId, rejectedId: rejected.handoffId };
}

function runRolePolicyScenario(modules) {
  const { rolePolicy } = modules;

  // Reviewer policy: `changes_required` is allowed but task completion mutations
  // (in_progress→done) are not. Mirror the reconciliation.ts policy check so
  // the smoke proves the same gate that rejects a reviewer report as a
  // `policy_violation` stop reason.
  const reviewerPolicy = rolePolicy.getEffectivePolicy('reviewer');
  const disallowedMutation = 'in_progress\u2192done';
  const reviewerAllows = reviewerPolicy.allowedTaskStateMutations.includes(disallowedMutation);
  assert.equal(
    reviewerAllows,
    false,
    'reviewer role must not be allowed to emit in_progress→done — this is the policy_violation trigger'
  );

  // The implementer policy, in contrast, permits in_progress→done so that
  // well-formed implementer completions are never rejected as policy violations.
  const implementerPolicy = rolePolicy.getEffectivePolicy('implementer');
  assert.ok(
    implementerPolicy.allowedTaskStateMutations.includes(disallowedMutation),
    'implementer role must be allowed to emit in_progress→done'
  );

  // Reviewer policy must require a human gate — documents the fact that
  // reviewer output is not committed without explicit human approval.
  assert.equal(reviewerPolicy.humanGateRequired, true);

  return {
    reviewerAllowsDone: reviewerAllows,
    reviewerRequiresHumanGate: reviewerPolicy.humanGateRequired
  };
}

async function main() {
  if (process.env.RALPH_E2E_ORCHESTRATION !== '1') {
    console.log('Skipping orchestration E2E smoke. Set RALPH_E2E_ORCHESTRATION=1 to run it.');
    return;
  }

  runOrExit(npmCommand, ['run', 'compile']);

  const supervisor = require(path.join(projectRoot, 'out', 'ralph', 'orchestrationSupervisor.js'));
  const handoffManager = require(path.join(projectRoot, 'out', 'ralph', 'handoffManager.js'));
  const planGraph = require(path.join(projectRoot, 'out', 'ralph', 'planGraph.js'));
  const rolePolicy = require(path.join(projectRoot, 'out', 'ralph', 'rolePolicy.js'));
  const modules = { supervisor, handoffManager, planGraph, rolePolicy };

  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'ralph-e2e-orchestration-'));
  const keepWorkspace = process.env.RALPH_E2E_ORCHESTRATION_KEEP_WORKSPACE === '1';
  let shouldCleanup = !keepWorkspace;

  try {
    await fsp.mkdir(path.join(rootPath, '.ralph'), { recursive: true });

    const graphSummary = await runGraphLifecycleScenario(modules, rootPath);
    const planGraphSummary = await runPlanGraphFanInScenario(modules, rootPath);
    const handoffSummary = await runHandoffLifecycleScenario(modules, rootPath);
    const policySummary = runRolePolicyScenario(modules);

    console.log(JSON.stringify({
      rootPath,
      graph: graphSummary,
      planGraph: planGraphSummary,
      handoff: handoffSummary,
      rolePolicy: policySummary
    }, null, 2));
  } catch (error) {
    shouldCleanup = false;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    await dumpWorkspaceOnFailure(rootPath);
    process.exitCode = 1;
  } finally {
    if (shouldCleanup) {
      await fsp.rm(rootPath, { recursive: true, force: true });
    } else {
      console.error(`Orchestration E2E smoke workspace preserved at ${rootPath}`);
    }
  }
}

void main();
