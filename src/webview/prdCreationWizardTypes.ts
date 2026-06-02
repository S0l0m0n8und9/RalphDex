import type { RalphTaskStatus } from '../ralph/types';
import type { RalphNewTaskInput } from '../ralph/taskNormalization';

export type PrdWizardMode = 'new' | 'regenerate';
export type PrdWizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export type PrdWizardLegacyStep = PrdWizardStep | 7;

export type StructuredField = 'projectType' | 'objective' | 'techStack' | 'outOfScope' | 'existingConventions';

export interface PrdWizardTaskDraft extends RalphNewTaskInput {
  status: RalphTaskStatus;
}

export interface TaskGenerationPlanArtifact {
  schemaVersion: 1;
  kind: 'taskGenerationPlan';
  generatedAt: string;
  status: 'draft' | 'approved';
  prdHash: string;
  prdTitle: string | null;
  readinessScore: number;
  workAreas: string[];
  generatedTaskIds: string[];
  warnings: string[];
  blockedWorkAreas: string[];
}

export interface PrdReadinessDimension {
  id: string;
  label: string;
  severity: 'pass' | 'warning' | 'blocker';
  message: string;
}

export interface PrdReadinessResult {
  schemaVersion: 1;
  kind: 'prdReadiness';
  generatedAt: string;
  prdHash: string;
  title: string | null;
  score: number;
  dimensions: PrdReadinessDimension[];
  blockers: string[];
  warnings: string[];
  workAreas: string[];
  blockedWorkAreas: string[];
}

export interface PrdWizardPrdGenerateResult {
  prdText: string;
  generationWarnings?: string[];
}

export interface PrdWizardTaskGenerateResult {
  tasks: PrdWizardTaskDraft[];
  taskCountWarning?: string;
  planArtifact: TaskGenerationPlanArtifact;
}

export interface PrdWizardDraftBundle {
  prdText: string;
  tasks: PrdWizardTaskDraft[];
  prdHash?: string;
  taskGenerationPlan?: TaskGenerationPlanArtifact;
}

export interface PrdWizardWriteResult {
  filesWritten: string[];
}

export interface PrdWizardPaths {
  prdPath: string;
  tasksPath: string;
}

export interface ReviewFinding {
  kind: 'warning' | 'blocker';
  message: string;
}

export type GenerationState = 'idle' | 'generated' | 'weak' | 'fallback';
export type OperationStatus = 'idle' | 'running' | 'succeeded' | 'failed';
export type TaskGenerationStatus = 'idle' | 'generated' | 'weak';

export interface WizardState {
  mode: PrdWizardMode;
  step: PrdWizardStep;
  projectType: string;
  objective: string;
  techStack: string;
  outOfScope: string;
  existingConventions: string;
  draft: PrdWizardDraftBundle | null;
  prdReadiness: PrdReadinessResult | null;
  taskGenerationStatus: TaskGenerationStatus;
  taskGenerationMessage: string | null;
  tasksStale: boolean;
  generationState: GenerationState;
  generationMessage: string | null;
  operationStatus: OperationStatus;
  operationMessage: string | null;
  warning: string | null;
  error: string | null;
  currentPrdPreview: string | null;
  comparisonSummary?: string | null;
  prdReviewFindings?: ReviewFinding[];
  taskReviewFindings?: ReviewFinding[];
  writeSummary: PrdWizardWriteResult | null;
  paths: PrdWizardPaths;
}

export type WizardInboundMessage =
  | { type: 'webview-ready'; mode: 'prd-wizard'; mountedText: string; timestamp: string }
  | { type: 'set-step'; step: PrdWizardStep }
  | { type: 'update-field'; field: StructuredField; value: string }
  | { type: 'update-draft-prd-text'; value: string }
  | { type: 'update-task-title'; taskId: string; title: string }
  | { type: 'update-task-dependencies'; taskId: string; value: string }
  | { type: 'update-task-notes'; taskId: string; value: string }
  | { type: 'update-task-acceptance'; taskId: string; value: string }
  | { type: 'update-task-tier'; taskId: string; tier: '' | 'simple' | 'medium' | 'complex' }
  | { type: 'move-task'; taskId: string; direction: 'up' | 'down' }
  | { type: 'delete-task'; taskId: string }
  | { type: 'generate-prd-draft' }
  | { type: 'generate-tasks' }
  | { type: 'confirm-write' };

export type WizardOutboundMessage =
  | { type: 'state'; state: WizardState }
  | { type: 'busy'; value: boolean };
