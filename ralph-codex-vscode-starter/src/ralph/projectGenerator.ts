import * as os from 'os';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { RalphTask } from './types';
import { createCliProvider } from '../codex/providerFactory';
import { runProcess } from '../services/processRunner';

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
  if (!prdText) {
    throw new ProjectGenerationError('AI response contained no PRD text before the JSON block.');
  }
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
      id: (item as Record<string, unknown>).id as string,
      title: (item as Record<string, unknown>).title as string,
      status: 'todo' as const
    };
  });

  return { prdText, tasks };
}

const GENERATION_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Write a Product Requirements Document (PRD) in markdown for this project. Then, at the very end of your response, output a fenced JSON block containing an array of tasks.

Requirements:
- Start with a # heading for the project title
- Include: ## Overview, ## Goals, then one ## section per major work area (aim for 3-7 sections)
- Keep each section to 2-4 sentences
- Tasks must correspond one-to-one with the ## work area sections
- End your response with EXACTLY this structure (no text after the closing fence):

\`\`\`json
[
  { "id": "T1", "title": "short task title", "status": "todo" },
  { "id": "T2", "title": "short task title", "status": "todo" }
]
\`\`\`

Respond ONLY with the PRD markdown followed by the JSON fence. No preamble, no explanation after the fence.`;

function commandPathForConfig(config: RalphCodexConfig): string {
  if (config.cliProvider === 'claude') { return config.claudeCommandPath; }
  if (config.cliProvider === 'copilot') { return config.copilotCommandPath; }
  return config.codexCommandPath;
}

export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }> {
  const commandPath = commandPathForConfig(config);
  const provider = createCliProvider(config);
  const safeObjective = objective.replace(/<\/objective>/gi, '[/objective]');
  const prompt = GENERATION_PROMPT_TEMPLATE.replace('{OBJECTIVE}', safeObjective);
  const lastMessagePath = path.join(os.tmpdir(), `ralph-gen-${Date.now()}.last-message.txt`);

  const launchSpec = provider.buildLaunchSpec({
    commandPath,
    workspaceRoot: cwd,
    executionRoot: cwd,
    prompt,
    promptPath: '',
    promptHash: '',
    promptByteLength: Buffer.byteLength(prompt, 'utf8'),
    transcriptPath: '',
    lastMessagePath,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    sandboxMode: config.sandboxMode,
    approvalMode: config.approvalMode
  }, true);

  let result;
  result = await runProcess(commandPath, launchSpec.args, {
    cwd: launchSpec.cwd,
    stdinText: launchSpec.stdinText
  });

  if (result.code !== 0) {
    throw new ProjectGenerationError(`CLI exited with code ${result.code}.`);
  }

  const responseText = await provider.extractResponseText(result.stdout, result.stderr, lastMessagePath);
  return parseGenerationResponse(responseText);
}
