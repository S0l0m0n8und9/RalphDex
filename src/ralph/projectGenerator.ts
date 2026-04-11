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

export interface RecommendedSkill {
  name: string;
  description: string;
  rationale: string;
}

export function parseGenerationResponse(responseText: string): {
  prdText: string;
  tasks: Pick<RalphTask, 'id' | 'title' | 'status' | 'validation'>[];
  recommendedSkills: RecommendedSkill[];
  taskCountWarning?: string;
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProjectGenerationError('AI response JSON block must be an object with "tasks" and optional "recommendedSkills" fields.');
  }

  const parsedObj = parsed as Record<string, unknown>;

  if (!Array.isArray(parsedObj.tasks) || (parsedObj.tasks as unknown[]).length === 0) {
    throw new ProjectGenerationError('AI response JSON block must contain a non-empty "tasks" array.');
  }

  const tasks = (parsedObj.tasks as unknown[]).map((item, i) => {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).title !== 'string'
    ) {
      throw new ProjectGenerationError(
        `Task at index ${i} is missing required "id" or "title" field.`
      );
    }
    const rawValidation = (item as Record<string, unknown>).suggestedValidationCommand;
    const validation = typeof rawValidation === 'string' && rawValidation.trim()
      ? rawValidation.trim()
      : undefined;
    return {
      id: (item as Record<string, unknown>).id as string,
      title: (item as Record<string, unknown>).title as string,
      status: 'todo' as const,
      ...(validation !== undefined ? { validation } : {})
    };
  });

  const recommendedSkills: RecommendedSkill[] = [];
  if (Array.isArray(parsedObj.recommendedSkills)) {
    for (const skill of parsedObj.recommendedSkills as unknown[]) {
      if (
        typeof skill === 'object' && skill !== null &&
        typeof (skill as Record<string, unknown>).name === 'string' &&
        typeof (skill as Record<string, unknown>).description === 'string' &&
        typeof (skill as Record<string, unknown>).rationale === 'string'
      ) {
        recommendedSkills.push({
          name: (skill as Record<string, unknown>).name as string,
          description: (skill as Record<string, unknown>).description as string,
          rationale: (skill as Record<string, unknown>).rationale as string
        });
      }
    }
  }

  const taskCountWarning = tasks.length > 8
    ? `Response contained ${tasks.length} tasks; expected 5–8. Excess tasks may reduce autonomous execution quality.`
    : undefined;

  return { prdText, tasks, recommendedSkills, taskCountWarning };
}

const GENERATION_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Write a Product Requirements Document (PRD) in markdown for this project. Then, at the very end of your response, output a fenced JSON block containing an object with tasks and recommended skills.

Requirements:
- Start with a # heading for the project title
- Include: ## Overview, ## Goals, then one ## section per major work area (aim for 3-7 sections)
- Keep each section to 2-4 sentences
- Tasks must correspond one-to-one with the ## work area sections
- Output between 5 and 8 tasks. Fewer than 5 leaves the project under-specified; more than 8 creates excessive granularity that hinders autonomous execution and makes the backlog unwieldy for a single agentic loop.
- Recommend 2-5 skills that would be valuable for this project type (e.g. testing frameworks, deployment tools, domain-specific libraries)

## Good vs bad task formulation

Write tasks that are atomic (one coherent deliverable), testable (there is a concrete command or check that confirms completion), and outcome-focused (what the repo gains, not what the developer does).

Good examples:
- "Implement JWT authentication middleware with token validation and expiry checks" — atomic, the validation command \`npm test -- auth\` can confirm it
- "Add CLI flag --output-format json|text and plumb it through the render pipeline" — a single change path, testable with \`npm run validate\`
- "Write unit tests for the task-file read/write cycle covering happy path and concurrent-write collision" — concrete deliverable, runnable with \`npm test\`

Bad examples:
- "Set up project infrastructure" — too vague; covers files, tooling, CI, docs — cannot be confirmed with a single command
- "Implement everything in Phase 2" — spans multiple deliverables; one task failure blocks unrelated work
- "Add logging" — no scope or acceptance bar; an agent could add one log line and declare done

For each task, supply a \`suggestedValidationCommand\`: the shell command an agent should run to confirm the task is complete (e.g. \`npm run validate\`, \`npm test -- <suite>\`, \`npm run build\`). Omit if no single command applies.

- End your response with EXACTLY this structure (no text after the closing fence):

\`\`\`json
{
  "tasks": [
    { "id": "T1", "title": "short task title", "status": "todo", "suggestedValidationCommand": "npm run validate" },
    { "id": "T2", "title": "short task title", "status": "todo" }
  ],
  "recommendedSkills": [
    { "name": "skill-name", "description": "one-line description of the skill", "rationale": "why this skill suits the project type and tasks" }
  ]
}
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
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status' | 'validation'>[]; recommendedSkills: RecommendedSkill[]; taskCountWarning?: string }> {
  const commandPath = commandPathForConfig(config);
  const provider = createCliProvider(config);
  const safeObjective = objective.replace(/<\/objective>/gi, '[/objective]');
  const template = config.prdGenerationTemplate?.trim() || GENERATION_PROMPT_TEMPLATE;
  const prompt = template.replace('{OBJECTIVE}', safeObjective);
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

  const result = await runProcess(commandPath, launchSpec.args, {
    cwd: launchSpec.cwd,
    stdinText: launchSpec.stdinText
  });

  if (result.code !== 0) {
    throw new ProjectGenerationError(`CLI exited with code ${result.code}.`);
  }

  const responseText = await provider.extractResponseText(result.stdout, result.stderr, lastMessagePath);
  return parseGenerationResponse(responseText);
}
