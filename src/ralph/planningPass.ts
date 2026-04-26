import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { RalphSuggestedChildTask, RalphTaskTier } from './types';

export type TaskReadiness = 'ready' | 'needs_decomposition' | 'blocked' | 'needs_human_review';

export interface TaskPlanArtifact {
  reasoning: string;
  approach: string;
  steps: string[];
  risks: string[];
  suggestedValidationCommand?: string;
  readiness?: TaskReadiness;
  readinessReason?: string;
  suggestedChildTasks?: RalphSuggestedChildTask[];
  suggestedAcceptance?: string[];
  suggestedConstraints?: string[];
}

function isImplementerLikeRole(agentRole: RalphCodexConfig['agentRole']): boolean {
  return agentRole === 'implementer' || agentRole === 'build';
}

export function isDedicatedPlanningFallbackSingleAgent(
  config: Pick<RalphCodexConfig, 'agentCount' | 'agentRole' | 'planningPass'>
): boolean {
  return config.planningPass.enabled
    && config.planningPass.mode === 'dedicated'
    && isImplementerLikeRole(config.agentRole)
    && config.agentCount <= 1;
}

export function shouldRequireTaskPlanForSelection(
  config: Pick<RalphCodexConfig, 'agentCount' | 'agentRole' | 'planningPass'>
): boolean {
  return config.planningPass.enabled
    && config.planningPass.mode === 'dedicated'
    && isImplementerLikeRole(config.agentRole)
    && !isDedicatedPlanningFallbackSingleAgent(config);
}

export function shouldRunInlinePlanningPassForConfig(
  config: Pick<RalphCodexConfig, 'agentCount' | 'agentRole' | 'planningPass'>
): boolean {
  if (!config.planningPass.enabled || !isImplementerLikeRole(config.agentRole)) {
    return false;
  }

  return config.planningPass.mode === 'inline' || isDedicatedPlanningFallbackSingleAgent(config);
}

/**
 * Extracts a TaskPlanArtifact from a planning-prompt response.
 *
 * The planner agent is expected to write the artifact itself, but Ralph also
 * parses the response text as a fallback so the inline planning pass can build
 * the artifact from the agent's output without requiring a separate file write.
 *
 * Accepts two formats:
 * 1. A fenced ```json block containing the task-plan object.
 * 2. The raw JSON object at the top level of the text.
 */
export function parsePlanningResponse(text: string): TaskPlanArtifact | null {
  // Try to extract a fenced json block first.
  const fencedMatch = /```json\s*([\s\S]*?)```/.exec(text);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  const reasoning = typeof record.reasoning === 'string' ? record.reasoning.trim() : '';
  const approach = typeof record.approach === 'string' ? record.approach.trim() : '';
  const steps = Array.isArray(record.steps)
    ? record.steps.filter((s): s is string => typeof s === 'string')
    : [];
  const risks = Array.isArray(record.risks)
    ? record.risks.filter((r): r is string => typeof r === 'string')
    : [];
  const suggestedValidationCommand = typeof record.suggestedValidationCommand === 'string' && record.suggestedValidationCommand.trim()
    ? record.suggestedValidationCommand.trim()
    : undefined;
  const readiness = normalizeTaskReadiness(record.readiness);
  const readinessReason = typeof record.readinessReason === 'string' && record.readinessReason.trim()
    ? record.readinessReason.trim()
    : undefined;
  const suggestedChildTasks = parseSuggestedChildTasks(record.suggestedChildTasks);
  const suggestedAcceptance = parseOptionalStringArray(record.suggestedAcceptance);
  const suggestedConstraints = parseOptionalStringArray(record.suggestedConstraints);

  // Require at minimum reasoning or approach to be non-empty.
  const hasMeaningfulPlan = Boolean(reasoning || approach || steps.length > 0);
  if (!hasMeaningfulPlan) {
    return null;
  }

  return {
    reasoning,
    approach,
    steps,
    risks,
    suggestedValidationCommand,
    readiness: readiness ?? 'ready',
    readinessReason,
    ...(suggestedChildTasks !== undefined ? { suggestedChildTasks } : {}),
    ...(suggestedAcceptance ? { suggestedAcceptance } : {}),
    ...(suggestedConstraints ? { suggestedConstraints } : {})
  };
}

function normalizeTaskReadiness(candidate: unknown): TaskReadiness | undefined {
  if (candidate !== 'ready'
    && candidate !== 'needs_decomposition'
    && candidate !== 'blocked'
    && candidate !== 'needs_human_review') {
    return undefined;
  }

  return candidate;
}

function parseOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function parseTier(value: unknown): RalphTaskTier | undefined {
  return value === 'simple' || value === 'medium' || value === 'complex'
    ? value
    : undefined;
}

function parseSuggestedChildTasks(candidate: unknown): RalphSuggestedChildTask[] | undefined {
  if (!Array.isArray(candidate)) {
    return undefined;
  }

  const tasks = candidate
    .map(parseSuggestedChildTask)
    .filter((task): task is RalphSuggestedChildTask => task !== null);

  return tasks.length > 0 ? tasks : undefined;
}

function parseSuggestedChildTask(candidate: unknown): RalphSuggestedChildTask | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const parentId = typeof record.parentId === 'string' ? record.parentId.trim() : '';
  const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : '';
  if (!id || !title || !parentId || !rationale) {
    return null;
  }

  const dependsOn = Array.isArray(record.dependsOn)
    ? record.dependsOn
      .map((dependency) => {
        if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) {
          return null;
        }
        const dependencyRecord = dependency as Record<string, unknown>;
        if (typeof dependencyRecord.taskId !== 'string' || !dependencyRecord.taskId.trim()) {
          return null;
        }
        if (dependencyRecord.reason !== 'blocks_sequence' && dependencyRecord.reason !== 'inherits_parent_dependency') {
          return null;
        }
        return {
          taskId: dependencyRecord.taskId.trim(),
          reason: dependencyRecord.reason
        };
      })
      .filter((dependency): dependency is RalphSuggestedChildTask['dependsOn'][number] => dependency !== null)
    : [];

  if (record.validation !== null && record.validation !== undefined && typeof record.validation !== 'string') {
    return null;
  }

  return {
    id,
    title,
    parentId,
    dependsOn,
    validation: typeof record.validation === 'string' ? record.validation.trim() : null,
    rationale,
    acceptance: parseOptionalStringArray(record.acceptance),
    constraints: parseOptionalStringArray(record.constraints),
    context: parseOptionalStringArray(record.context),
    tier: parseTier(record.tier)
  };
}

/** Writes a task-plan.json artifact under `.ralph/artifacts/<taskId>/`. */
export async function writeTaskPlan(
  artifactsDir: string,
  taskId: string,
  plan: TaskPlanArtifact
): Promise<string> {
  const taskArtifactDir = path.join(artifactsDir, taskId);
  await fs.mkdir(taskArtifactDir, { recursive: true });
  const filePath = path.join(taskArtifactDir, 'task-plan.json');
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf8');
  return filePath;
}

/** Reads task-plan.json for a task. Returns null when the file does not exist or is malformed. */
export async function readTaskPlan(
  artifactsDir: string,
  taskId: string
): Promise<TaskPlanArtifact | null> {
  const filePath = path.join(artifactsDir, taskId, 'task-plan.json');
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return parsePlanningResponse(text);
  } catch {
    return null;
  }
}

/**
 * Builds a concise "Task Plan" context snippet for injection into the
 * implementer prompt. Returns an empty string when the plan has no content.
 */
export function formatTaskPlanContext(plan: TaskPlanArtifact): string {
  const lines: string[] = [];

  if (plan.reasoning) {
    lines.push(`- Reasoning: ${plan.reasoning}`);
  }

  if (plan.approach) {
    lines.push(`- Approach: ${plan.approach}`);
  }

  if (plan.steps.length > 0) {
    lines.push(`- Steps: ${plan.steps.slice(0, 5).join(' → ')}`);
  }

  if (plan.risks.length > 0) {
    lines.push(`- Risks: ${plan.risks.slice(0, 3).join('; ')}`);
  }

  if (plan.suggestedValidationCommand) {
    lines.push(`- Suggested validation: ${plan.suggestedValidationCommand}`);
  }

  return lines.join('\n');
}
