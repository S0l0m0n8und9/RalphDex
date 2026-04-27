import type { WorkspaceScan } from '../services/workspaceInspection';
import { analyzeTaskShape } from './planningPass';
import type { RalphNewTaskInput } from './taskNormalization';
import type { RalphTask } from './types';

type TaskGenerationWorkspaceScan = Pick<
  WorkspaceScan,
  'packageJson' | 'manifests' | 'sourceRoots' | 'tests' | 'projectMarkers' | 'validationCommands' | 'packageManagers'
>;

export interface GeneratedTaskReviewInput {
  tasks: RalphNewTaskInput[];
  workspaceScan?: Partial<TaskGenerationWorkspaceScan> | null;
  effectiveValidationCommand?: string | null;
}

function toDiagnosticTask(task: RalphNewTaskInput): RalphTask {
  return {
    ...task,
    status: task.status ?? 'todo'
  } as RalphTask;
}

export function reviewGeneratedTaskShape(input: GeneratedTaskReviewInput): string[] {
  const warnings: string[] = [];

  for (const task of input.tasks) {
    const result = analyzeTaskShape({
      task: toDiagnosticTask(task),
      workspaceScan: input.workspaceScan,
      effectiveValidationCommand: input.effectiveValidationCommand
    });

    for (const finding of result.findings) {
      warnings.push(`Task ${task.id} "${task.title.trim()}": ${finding.message}`);
    }
  }

  return warnings;
}
