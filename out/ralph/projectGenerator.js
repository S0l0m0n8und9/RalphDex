"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectGenerationError = void 0;
exports.parseGenerationResponse = parseGenerationResponse;
exports.runPromptThroughConfiguredProvider = runPromptThroughConfiguredProvider;
exports.generateProjectDraft = generateProjectDraft;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const providerFactory_1 = require("../codex/providerFactory");
const processRunner_1 = require("../services/processRunner");
class ProjectGenerationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProjectGenerationError';
    }
}
exports.ProjectGenerationError = ProjectGenerationError;
function parseGenerationResponse(responseText) {
    const fencePattern = /```json\s*([\s\S]*?)```/g;
    let lastMatch = null;
    let match;
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
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        throw new ProjectGenerationError(`AI response contained a malformed JSON block: ${jsonText.slice(0, 100)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ProjectGenerationError('AI response JSON block must be an object with a "tasks" field.');
    }
    const parsedObj = parsed;
    if (!Array.isArray(parsedObj.tasks) || parsedObj.tasks.length === 0) {
        throw new ProjectGenerationError('AI response JSON block must contain a non-empty "tasks" array.');
    }
    const tasks = parsedObj.tasks.map((item, i) => {
        const itemRecord = item;
        if (typeof item !== 'object' || item === null ||
            typeof itemRecord.id !== 'string' ||
            typeof itemRecord.title !== 'string') {
            throw new ProjectGenerationError(`Task at index ${i} is missing required "id" or "title" field.`);
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
            status: 'todo',
            ...(validation !== undefined ? { validation } : {})
        };
    });
    const taskCountWarning = tasks.length > 8
        ? `Response contained ${tasks.length} tasks; expected 5–8. Excess tasks may reduce autonomous execution quality.`
        : undefined;
    return { prdText, tasks, taskCountWarning };
}
const GENERATION_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Project type: {PROJECT_TYPE}

Write a Product Requirements Document (PRD) in markdown for this project. Then, at the very end of your response, output a fenced JSON block containing an object with tasks.

Requirements:
- Start with a # heading for the project title
- Include: ## Overview, ## Goals, then one ## section per major work area (aim for 3-7 sections)
- Keep each section to 2-4 sentences
- Tasks must correspond one-to-one with the ## work area sections
- Output between 5 and 8 tasks. Fewer than 5 leaves the project under-specified; more than 8 creates excessive granularity that hinders autonomous execution and makes the backlog unwieldy for a single agentic loop.
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
  ]
}
\`\`\`

Respond ONLY with the PRD markdown followed by the JSON fence. No preamble, no explanation after the fence.`;
const DOCUMENTATION_GENERATION_PROMPT_TEMPLATE = `You are helping set up a documentation-only repository brief for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Project type: documentation

Write a markdown PRD that documents the repository as it currently exists. The purpose is to help Ralphdex inspect and document the repo in the fashion requested by the operator, not to build or change product behavior.

Requirements:
- Start with a # heading for the repository documentation brief
- Include: ## Overview, ## Goals, ## Documentation Scope, ## Existing Structure, and ## Success Criteria
- Keep each section to 2-4 sentences grounded in what should be documented from the current repository state
- The PRD must not propose code changes, implementation work, scaffolding, refactors, migrations, or speculative future-state design
- Tasks must correspond to documentation work areas and stay limited to inspecting the current repo and writing documentation about it
- Output between 3 and 7 tasks
- Each task must include required fields \`id\` and \`title\`
- Set "mode" to "documentation" on every task
- Ralph will force \`status\` to \`todo\` during import, so treat any emitted status as informational only

For each task:
- Focus on documenting existing modules, workflows, boundaries, commands, architecture, or operational behavior already present in the repo
- Do not ask the agent to modify source code except for documentation files requested by the operator
- Supply a \`suggestedValidationCommand\` only when one helps verify the documentation artifact or consistency check
- You may include optional fields \`notes\`, \`rationale\`, \`dependsOn\`, \`acceptance\`, \`constraints\`, \`context\`, \`priority\`, and \`tier\` when they materially improve execution

End your response with EXACTLY this structure (no text after the closing fence):

\`\`\`json
{
  "tasks": [
    {
      "id": "T1",
      "title": "document a current repo area",
      "status": "todo",
      "mode": "documentation",
      "suggestedValidationCommand": "npm run check:docs",
      "acceptance": ["one concrete documentation outcome"],
      "context": ["docs/example.md"]
    }
  ]
}
\`\`\`

Respond ONLY with the PRD markdown followed by the JSON fence. No preamble, no explanation after the fence.`;
function resolveProjectDraftRequest(input) {
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
function buildProviderPromptRequest(prompt, config, cwd, lastMessagePrefix) {
    const commandPath = (0, providers_1.getCliCommandPath)(config);
    const provider = (0, providerFactory_1.createCliProvider)(config);
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
async function runPromptThroughConfiguredProvider(prompt, config, cwd, lastMessagePrefix) {
    const { provider, commandPath, request } = buildProviderPromptRequest(prompt, config, cwd, lastMessagePrefix);
    const launchSpec = provider.prepareLaunchSpec
        ? await provider.prepareLaunchSpec(request, true)
        : provider.buildLaunchSpec(request, true);
    const result = await (0, processRunner_1.runProcess)(commandPath, launchSpec.args, {
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
async function generateProjectDraft(input, config, cwd) {
    const request = resolveProjectDraftRequest(input);
    const safeObjective = request.objective.replace(/<\/objective>/gi, '[/objective]');
    const builtInTemplate = request.projectType === 'documentation'
        ? DOCUMENTATION_GENERATION_PROMPT_TEMPLATE
        : GENERATION_PROMPT_TEMPLATE;
    const template = config.prdGenerationTemplate?.trim() || builtInTemplate;
    const prompt = template
        .replace('{OBJECTIVE}', safeObjective)
        .replace('{PROJECT_TYPE}', request.projectType);
    const { responseText } = await runPromptThroughConfiguredProvider(prompt, config, cwd, 'ralph-gen');
    return parseGenerationResponse(responseText);
}
//# sourceMappingURL=projectGenerator.js.map