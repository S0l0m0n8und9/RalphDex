import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  applyTaskDecompositionProposalArtifact,
  resolveApplicableTaskDecompositionProposal
} from '../src/ralph/taskDecomposition';
import { RalphTaskRemediationArtifact } from '../src/ralph/types';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-decomposition-'));
}

function remediationArtifact(overrides: Partial<RalphTaskRemediationArtifact> = {}): RalphTaskRemediationArtifact {
  return {
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_no_progress',
    attemptCount: 2,
    action: 'decompose_task',
    humanReviewRecommended: false,
    summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task.',
    rationale: 'The task is compound and needs a bounded first step.',
    proposedAction: 'Accept the child-task proposal before retrying T1.',
    evidence: ['same_task_selected_repeatedly'],
    triggeringHistory: [],
    suggestedChildTasks: [
      {
        id: 'T1.1',
        title: 'Reproduce the blocker',
        parentId: 'T1',
        dependsOn: [],
        validation: 'npm test',
        rationale: 'First bounded step.'
      },
      {
        id: 'T1.2',
        title: 'Implement the smallest fix',
        parentId: 'T1',
        dependsOn: [{ taskId: 'T1.1', reason: 'blocks_sequence' }],
        validation: 'npm test',
        rationale: 'Second bounded step.'
      }
    ],
    artifactDir: 'artifact-dir',
    iterationResultPath: 'iteration-result.json',
    createdAt: '2026-03-10T09:11:48.574Z',
    ...overrides
  };
}

test('resolveApplicableTaskDecompositionProposal accepts only applicable decomposition artifacts', () => {
  assert.equal(resolveApplicableTaskDecompositionProposal(null), null);
  assert.equal(
    resolveApplicableTaskDecompositionProposal(remediationArtifact({ action: 'request_human_review' })),
    null
  );
  assert.equal(
    resolveApplicableTaskDecompositionProposal(remediationArtifact({ selectedTaskId: null })),
    null
  );
  assert.equal(
    resolveApplicableTaskDecompositionProposal(remediationArtifact({ suggestedChildTasks: [] })),
    null
  );

  assert.deepEqual(resolveApplicableTaskDecompositionProposal(remediationArtifact()), {
    parentTaskId: 'T1',
    suggestedChildTasks: remediationArtifact().suggestedChildTasks
  });
});

test('applyTaskDecompositionProposalArtifact writes tasks.json through the shared proposal path', async () => {
  const rootPath = await makeTempRoot();
  const taskFilePath = path.join(rootPath, 'tasks.json');
  await fs.writeFile(taskFilePath, JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T0', title: 'Foundation', status: 'done' },
      { id: 'T1', title: 'Inspect guardrails', status: 'todo', dependsOn: ['T0'] }
    ]
  }, null, 2), 'utf8');

  const result = await applyTaskDecompositionProposalArtifact(taskFilePath, remediationArtifact());

  assert.equal(result.parentTaskId, 'T1');
  assert.deepEqual(result.childTaskIds, ['T1.1', 'T1.2']);
  assert.deepEqual(result.taskFile.tasks.map((task) => task.id), ['T0', 'T1', 'T1.1', 'T1.2']);
  assert.deepEqual(result.taskFile.tasks[1]?.dependsOn, ['T0', 'T1.1', 'T1.2']);
});
