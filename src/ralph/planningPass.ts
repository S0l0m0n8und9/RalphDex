import * as fs from 'fs/promises';
import * as path from 'path';

export interface TaskPlanArtifact {
  reasoning: string;
  approach: string;
  steps: string[];
  risks: string[];
  suggestedValidationCommand?: string;
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

  // Require at minimum reasoning or approach to be non-empty.
  if (!reasoning && !approach && steps.length === 0) {
    return null;
  }

  return { reasoning, approach, steps, risks, suggestedValidationCommand };
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
