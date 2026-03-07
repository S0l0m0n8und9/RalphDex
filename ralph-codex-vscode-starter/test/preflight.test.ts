import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { buildPreflightReport } from '../src/ralph/preflight';
import { inspectTaskFileText, selectNextTask } from '../src/ralph/taskFile';

const fileStatus = {
  prdPath: true,
  progressPath: true,
  taskFilePath: true,
  stateFilePath: true,
  promptDir: true,
  runDir: true,
  logDir: true,
  artifactDir: true
};

test('buildPreflightReport surfaces likely schema drift as a task-graph error', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broken alias', status: 'todo', dependencies: ['T0'] }
    ]
  }, null, 2));

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: null,
    selectedTask: null,
    validationCommand: null,
    validationCommandReadiness: {
      command: null,
      status: 'missing',
      executable: null
    },
    fileStatus
  });

  assert.equal(report.ready, false);
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported_task_field'));
  assert.match(report.summary, /Task graph: 1 error/);
});

test('buildPreflightReport distinguishes selected validation commands from confirmed executables', () => {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Run checks', status: 'todo' }
    ]
  }));
  const selectedTask = taskInspection.taskFile ? selectNextTask(taskInspection.taskFile) : null;

  const report = buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config: DEFAULT_CONFIG,
    taskInspection,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    selectedTask,
    validationCommand: 'pytest',
    validationCommandReadiness: {
      command: 'pytest',
      status: 'executableNotConfirmed',
      executable: 'pytest'
    },
    fileStatus
  });

  assert.equal(report.ready, true);
  assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'validation_command_executable_not_confirmed'));
  assert.match(report.summary, /Validation pytest\. Executable not confirmed\./);
});
