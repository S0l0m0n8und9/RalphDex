import { RalphTask } from './types';
import { RalphCodexConfig } from '../config/types';

export class ProjectGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProjectGenerationError';
  }
}

export function parseGenerationResponse(responseText: string): {
  prdText: string;
  tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[];
} {
  const fencePattern = /```json\s*([\s\S]*?)```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(responseText)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    throw new ProjectGenerationError('AI response did not contain a fenced JSON block.');
  }

  const prdText = responseText.slice(0, lastMatch.index).trim();
  const jsonText = lastMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ProjectGenerationError(`AI response contained a malformed JSON block: ${jsonText.slice(0, 100)}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ProjectGenerationError('AI response JSON block must be a non-empty array of tasks.');
  }

  const tasks = (parsed as unknown[]).map((item, i) => {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).title !== 'string'
    ) {
      throw new ProjectGenerationError(
        `Task at index ${i} is missing required "id" or "title" field.`
      );
    }
    return {
      id: String((item as Record<string, unknown>).id),
      title: String((item as Record<string, unknown>).title),
      status: 'todo' as const
    };
  });

  return { prdText, tasks };
}

export async function generateProjectDraft(
  _objective: string,
  _config: RalphCodexConfig,
  _cwd: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }> {
  throw new Error('not implemented');
}
