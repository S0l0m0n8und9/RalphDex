import * as os from 'os';
import * as path from 'path';
import { getCliCommandPath } from '../config/providers';
import { RalphCodexConfig } from '../config/types';
import { createCliProvider } from '../codex/providerFactory';
import type { CodexExecRequest } from '../codex/types';
import { runProcess } from '../services/processRunner';
import {
  analyzePrdReadiness,
  persistTaskGenerationPlanArtifact,
  type TaskGenerationPlanArtifact
} from './prdReadiness';
import type { RalphNewTaskInput } from './taskNormalization';

export class ProjectGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProjectGenerationError';
  }
}

export interface ProviderPromptExecution {
  responseText: string;
  providerId: string;
  commandPath: string;
  launchArgs: string[];
  launchCwd: string;
  launchShell: boolean;
}

export interface ProjectDraftRequest {
  objective: string;
  projectType?: string;
}

export interface GenerateTasksFromPrdInput {
  prdText: string;
  prdHash: string;
  projectType?: string;
  constraints?: string;
}

export interface GenerateTasksFromPrdResult {
  tasks: RalphNewTaskInput[];
  taskCountWarning?: string;
  planArtifact: TaskGenerationPlanArtifact;
}

export function parseTaskGenerationResponse(responseText: string): {
  tasks: RalphNewTaskInput[];
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

  const jsonText = lastMatch[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ProjectGenerationError(`AI response contained a malformed JSON block: ${jsonText.slice(0, 100)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProjectGenerationError('AI response JSON block must be an object with a "tasks" field.');
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

  const taskCountWarning = tasks.length > 12
    ? `Response contained ${tasks.length} tasks; expected a tighter atomic starter set.`
    : undefined;

  return { tasks, taskCountWarning };
}

const PRD_GENERATION_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Project type: {PROJECT_TYPE}

Write a Product Requirements Document (PRD) in markdown.

Requirements:
- Return markdown only. Do not include JSON or fenced code blocks.
- Start with a # heading for the project title.
- Include sections: ## Overview, ## Goals, ## Scope, ## Non-Goals, ## Success Criteria.
- Include additional ## work-area sections that make implementation taskable.
- Keep the brief specific enough that tasks can be generated later without guessing.
- Avoid placeholder markers (TODO/TBD) and vague filler.
- Include clear sequencing and validation intent where knowable.

Respond ONLY with PRD markdown.`;

const DOCUMENTATION_PRD_GENERATION_PROMPT_TEMPLATE = `You are helping set up a documentation-only repository brief for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Project type: documentation

Write a markdown PRD that documents the repository as it currently exists. The purpose is to help Ralphdex inspect and document the repo in the fashion requested by the operator, not to build or change product behavior.

Requirements:
- Return markdown only. Do not include JSON or fenced code blocks.
- Start with a # heading for the repository documentation brief.
- Include: ## Overview, ## Goals, ## Scope, ## Non-Goals, ## Success Criteria.
- Add work-area sections focused on documentation of existing behavior and structure.
- Do not propose code changes, implementation work, scaffolding, refactors, migrations, or speculative future-state design.

Respond ONLY with PRD markdown.`;

const TASK_GENERATION_PROMPT_TEMPLATE = `You are generating Ralph starter tasks from an approved PRD.

Project type: {PROJECT_TYPE}
PRD hash: {PRD_HASH}

Constraints:
{CONSTRAINTS}

Approved PRD:
<prd>
{PRD_TEXT}
</prd>

Generate starter tasks as JSON.

Requirements:
- Return ONLY one fenced JSON block with a top-level object containing a non-empty "tasks" array.
- Do not map one task per PRD section.
- Do not emit epics.
- Decompose each work area into the smallest independently verifiable tasks.
- Keep flat top-level task output. Do not emit child IDs like T1.1.
- Each task must include: id, title.
- Each task should include acceptance criteria and validation where knowable.
- Include dependencies only when real prerequisites exist.
- Include constraints and context hints where useful.
- Include tier when obvious (simple|medium|complex).
- Prefer 4-12 atomic starter tasks over broad umbrellas.

Disallow broad starter titles such as:
- implement dashboard
- improve UI/UX
- build platform/foundation
- set up infrastructure
- implement authentication and authorization
- create full workflow

Respond with EXACTLY:
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
      "constraints": ["one scope guardrail"],
      "tier": "medium"
    }
  ]
}
\`\`\``;

function resolveProjectDraftRequest(input: string | ProjectDraftRequest): Required<ProjectDraftRequest> {
  if (typeof input === 'string') {
    return {
      objective: input,
      projectType: 'other'
    };
  }

  return {
    objective: input.objective,
    projectType: input.projectType?.trim() || 'other'
  };
}

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

export async function generatePrdDraft(
  input: string | ProjectDraftRequest,
  config: RalphCodexConfig,
  cwd: string
): Promise<{ prdText: string; generationWarnings?: string[] }> {
  const request = resolveProjectDraftRequest(input);
  const safeObjective = request.objective.replace(/<\/objective>/gi, '[/objective]');
  const builtInTemplate = request.projectType === 'documentation'
    ? DOCUMENTATION_PRD_GENERATION_PROMPT_TEMPLATE
    : PRD_GENERATION_PROMPT_TEMPLATE;
  const template = config.prdGenerationTemplate?.trim() || builtInTemplate;
  const prompt = template
    .replace('{OBJECTIVE}', safeObjective)
    .replace('{PROJECT_TYPE}', request.projectType);
  const { responseText } = await runPromptThroughConfiguredProvider(prompt, config, cwd, 'ralph-prd');
  const prdText = responseText.trim();
  if (!prdText) {
    throw new ProjectGenerationError('AI response did not contain PRD markdown.');
  }
  const warnings: string[] = [];
  if (!/^#\s+/m.test(prdText)) {
    warnings.push('Generated PRD is missing a top-level # heading.');
  }
  return {
    prdText,
    ...(warnings.length > 0 ? { generationWarnings: warnings } : {})
  };
}

export async function generateTasksFromPrd(
  input: GenerateTasksFromPrdInput,
  config: RalphCodexConfig,
  cwd: string,
  artifactDir?: string
): Promise<GenerateTasksFromPrdResult> {
  const readiness = analyzePrdReadiness(input.prdText);
  if (readiness.blockers.length > 0) {
    throw new ProjectGenerationError(
      `PRD readiness has blockers; task generation is refused. ${readiness.blockers.join(' ')}`
    );
  }

  const prompt = TASK_GENERATION_PROMPT_TEMPLATE
    .replace('{PROJECT_TYPE}', input.projectType?.trim() || 'other')
    .replace('{PRD_HASH}', input.prdHash)
    .replace('{CONSTRAINTS}', input.constraints?.trim() || 'none')
    .replace('{PRD_TEXT}', input.prdText.replace(/<\/prd>/gi, '[/prd]'));
  const { responseText } = await runPromptThroughConfiguredProvider(prompt, config, cwd, 'ralph-tasks');
  const parsed = parseTaskGenerationResponse(responseText);

  const planArtifact: TaskGenerationPlanArtifact = {
    schemaVersion: 1,
    kind: 'taskGenerationPlan',
    generatedAt: new Date().toISOString(),
    status: 'approved',
    prdHash: input.prdHash,
    prdTitle: readiness.title,
    readinessScore: readiness.score,
    workAreas: readiness.workAreas,
    generatedTaskIds: parsed.tasks.map((task) => task.id),
    warnings: [
      ...(parsed.taskCountWarning ? [parsed.taskCountWarning] : []),
      ...readiness.warnings
    ],
    blockedWorkAreas: readiness.blockedWorkAreas
  };

  if (artifactDir) {
    await persistTaskGenerationPlanArtifact(artifactDir, planArtifact);
  }

  return {
    tasks: parsed.tasks,
    taskCountWarning: parsed.taskCountWarning,
    planArtifact
  };
}

/**
 * Backward-compatible helper kept for legacy callers.
 * This now performs PRD-first generation and runs readiness before task generation.
 */
export async function generateProjectDraft(
  input: string | ProjectDraftRequest,
  config: RalphCodexConfig,
  cwd: string,
  artifactDir?: string
): Promise<{ prdText: string; tasks: RalphNewTaskInput[]; taskCountWarning?: string }> {
  const prd = await generatePrdDraft(input, config, cwd);
  const readiness = analyzePrdReadiness(prd.prdText);
  if (readiness.blockers.length > 0) {
    throw new ProjectGenerationError(
      `Generated PRD failed readiness review: ${readiness.blockers.join(' ')}`
    );
  }
  const tasks = await generateTasksFromPrd({
    prdText: prd.prdText,
    prdHash: readiness.prdHash,
    projectType: resolveProjectDraftRequest(input).projectType
  }, config, cwd, artifactDir);

  return {
    prdText: prd.prdText,
    tasks: tasks.tasks,
    taskCountWarning: tasks.taskCountWarning
  };
}
