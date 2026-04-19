import * as os from 'os';
import * as path from 'path';
import { getCliCommandPath } from '../config/providers';
import { RalphCodexConfig } from '../config/types';
import { createCliProvider } from '../codex/providerFactory';
import type { CodexExecRequest } from '../codex/types';
import { runProcess } from '../services/processRunner';
import type { RalphNewTaskInput } from './taskNormalization';

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

export interface ProviderPromptExecution {
  responseText: string;
  providerId: string;
  commandPath: string;
  launchArgs: string[];
  launchCwd: string;
  launchShell: boolean;
}

export function parseGenerationResponse(responseText: string): {
  prdText: string;
  tasks: RalphNewTaskInput[];
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
    const itemRecord = item as Record<string, unknown>;
    if (
      typeof item !== 'object' || item === null ||
      typeof itemRecord.id !== 'string' ||
      typeof itemRecord.title !== 'string'
    ) {
      throw new ProjectGenerationError(
        `Task at index ${i} is missing required "id" or "title" field.`
      );
    }
    const taskRecord = { ...itemRecord };
    const rawValidation = taskRecord.suggestedValidationCommand;
    const validation = typeof rawValidation === 'string' && rawValidation.trim()
      ? rawValidation.trim()
      : undefined;
    delete taskRecord.status;
    delete taskRecord.suggestedValidationCommand;
    return {
      id: itemRecord.id,
      title: itemRecord.title,
      ...taskRecord,
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
- Each task must include required fields \`id\` and \`title\`. Ralph will force \`status\` to \`todo\` during import, so treat any emitted status as informational only.

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
- You may also include any of these optional task fields when they materially improve autonomous execution: \`notes\`, \`rationale\` (alias for notes), \`dependsOn\`, \`acceptance\`, \`constraints\`, \`context\`, \`priority\`, \`mode\`, and \`tier\`.
- Keep optional fields concise and deterministic. Use \`dependsOn\` only for true prerequisites. Use \`context\` for specific files/modules. Use \`acceptance\` for concrete done criteria. Use \`tier\` only when complexity is obvious (\`simple\`, \`medium\`, \`complex\`).

- End your response with EXACTLY this structure (no text after the closing fence):

\`\`\`json
{
  "tasks": [
    {
      "id": "T1",
      "title": "short task title",
      "status": "todo",
      "suggestedValidationCommand": "npm run validate",
      "acceptance": ["one concrete done check"],
      "context": ["src/example.ts"],
      "tier": "medium"
    },
    { "id": "T2", "title": "short task title", "status": "todo", "dependsOn": ["T1"] }
  ],
  "recommendedSkills": [
    { "name": "skill-name", "description": "one-line description of the skill", "rationale": "why this skill suits the project type and tasks" }
  ]
}
\`\`\`

Respond ONLY with the PRD markdown followed by the JSON fence. No preamble, no explanation after the fence.`;

function buildProviderPromptRequest(
  prompt: string,
  config: RalphCodexConfig,
  cwd: string,
  lastMessagePrefix: string
): { provider: ReturnType<typeof createCliProvider>; commandPath: string; request: CodexExecRequest } {
  const commandPath = getCliCommandPath(config);
  const provider = createCliProvider(config);
  const lastMessagePath = path.join(os.tmpdir(), `${lastMessagePrefix}-${Date.now()}.last-message.txt`);

  return {
    provider,
    commandPath,
    request: {
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
      approvalMode: config.approvalMode,
      timeoutMs: config.cliExecutionTimeoutMs
    }
  };
}

export async function runPromptThroughConfiguredProvider(
  prompt: string,
  config: RalphCodexConfig,
  cwd: string,
  lastMessagePrefix: string
): Promise<ProviderPromptExecution> {
  const { provider, commandPath, request } = buildProviderPromptRequest(prompt, config, cwd, lastMessagePrefix);

  const launchSpec = provider.prepareLaunchSpec
    ? await provider.prepareLaunchSpec(request, true)
    : provider.buildLaunchSpec(request, true);

  const result = await runProcess(commandPath, launchSpec.args, {
    cwd: launchSpec.cwd,
    stdinText: launchSpec.stdinText,
    shell: launchSpec.shell,
    env: launchSpec.env,
    timeoutMs: request.timeoutMs
  });

  if (result.code !== 0) {
    throw new ProjectGenerationError(`CLI exited with code ${result.code}.`);
  }

  const responseText = await provider.extractResponseText(result.stdout, result.stderr, request.lastMessagePath);

  return {
    responseText,
    providerId: provider.id,
    commandPath,
    launchArgs: launchSpec.args,
    launchCwd: launchSpec.cwd,
    launchShell: Boolean(launchSpec.shell)
  };
}

export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string
): Promise<{ prdText: string; tasks: RalphNewTaskInput[]; recommendedSkills: RecommendedSkill[]; taskCountWarning?: string }> {
  const safeObjective = objective.replace(/<\/objective>/gi, '[/objective]');
  const template = config.prdGenerationTemplate?.trim() || GENERATION_PROMPT_TEMPLATE;
  const prompt = template.replace('{OBJECTIVE}', safeObjective);
  const { responseText } = await runPromptThroughConfiguredProvider(prompt, config, cwd, 'ralph-gen');
  return parseGenerationResponse(responseText);
}
