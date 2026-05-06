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

export interface GeneratedTaskReviewFinding {
  taskId: string;
  taskTitle: string;
  severity: 'info' | 'warning' | 'blocking';
  code: string;
  message: string;
}

function toDiagnosticTask(task: RalphNewTaskInput): RalphTask {
  return {
    ...task,
    status: task.status ?? 'todo'
  } as RalphTask;
}

export function reviewGeneratedTaskShape(input: GeneratedTaskReviewInput): string[] {
  const warnings: string[] = [];

  for (const finding of reviewGeneratedTaskShapeDetailed(input)) {
    warnings.push(`Task ${finding.taskId} "${finding.taskTitle.trim()}": ${finding.message}`);
  }

  return warnings;
}

export function reviewGeneratedTaskShapeDetailed(input: GeneratedTaskReviewInput): GeneratedTaskReviewFinding[] {
  const findings: GeneratedTaskReviewFinding[] = [];
  for (const task of input.tasks) {
    const result = analyzeTaskShape({
      task: toDiagnosticTask(task),
      workspaceScan: input.workspaceScan,
      effectiveValidationCommand: input.effectiveValidationCommand
    });

    for (const finding of result.findings) {
      findings.push({
        taskId: task.id,
        taskTitle: task.title,
        severity: finding.severity,
        code: finding.code,
        message: finding.message
      });
    }
  }

  return findings;
}
