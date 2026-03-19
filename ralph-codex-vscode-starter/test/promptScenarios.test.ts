import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePromptKind } from '../src/prompt/promptBuilder';
import {
  buildWorkspaceStateForScenario,
  findSelectedTaskForScenario,
  promptScenarioList,
  promptScenarios,
  taskCountsForScenario
} from './fixtures/promptScenarios';

test('prompt scenarios provide the required deterministic fixture coverage', () => {
  assert.equal(promptScenarioList.length, 7);
  assert.deepEqual(
    Object.keys(promptScenarios).sort(),
    ['blockedTask', 'fixFailure', 'freshWorkspace', 'humanReview', 'partialProgress', 'repeatedNoProgress', 'replenishBacklog']
  );

  for (const scenario of promptScenarioList) {
    assert.equal(scenario.taskFile.version, 2);
    assert.match(scenario.prd, /# Product \/ project brief/);
    assert.match(scenario.progress, /# Progress/);
    assert.ok(scenario.workspaceScan.rootPath.length > 0);
    assert.ok(scenario.taskFile.tasks.length > 0);

    const decision = decidePromptKind(
      buildWorkspaceStateForScenario(scenario),
      'cliExec',
      {
        selectedTask: findSelectedTaskForScenario(scenario),
        taskCounts: taskCountsForScenario(scenario)
      }
    );

    assert.equal(
      decision.kind,
      scenario.expectedPromptKind,
      `Scenario ${scenario.name} should select ${scenario.expectedPromptKind}.`
    );
  }
});
