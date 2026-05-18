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
exports.parseTaskGenerationResponse = parseTaskGenerationResponse;
exports.runPromptThroughConfiguredProvider = runPromptThroughConfiguredProvider;
exports.generatePrdDraft = generatePrdDraft;
exports.generateTasksFromPrd = generateTasksFromPrd;
exports.generateProjectDraft = generateProjectDraft;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const providerFactory_1 = require("../codex/providerFactory");
const processRunner_1 = require("../services/processRunner");
const prdReadiness_1 = require("./prdReadiness");
class ProjectGenerationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProjectGenerationError';
    }
}
exports.ProjectGenerationError = ProjectGenerationError;
function parseTaskGenerationResponse(responseText) {
    const fencePattern = /```json\s*([\s\S]*?)```/g;
    let lastMatch = null;
    let match;
    while ((match = fencePattern.exec(responseText)) !== null) {
        lastMatch = match;
    }
    if (!lastMatch) {
        throw new ProjectGenerationError('AI response did not contain a fenced JSON block.');
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
    if (provider.executeDirectly) {
        const directResult = await provider.executeDirectly(request);
        const directMessage = directResult.lastMessage ||
            (directResult.stdout
                ? await provider.extractResponseText(directResult.stdout, directResult.stderr, request.lastMessagePath)
                : '');
        if (!directResult.success || directResult.exitCode !== 0) {
            throw new ProjectGenerationError(directResult.message || provider.summarizeResult({
                exitCode: directResult.exitCode,
                stderr: directResult.stderr,
                lastMessage: directMessage
            }));
        }
        return {
            responseText: directMessage,
            providerId: provider.id,
            commandPath,
            launchArgs: directResult.args,
            launchCwd: request.executionRoot,
            launchShell: false
        };
    }
    const launchSpec = provider.prepareLaunchSpec
        ? await provider.prepareLaunchSpec(request, true)
        : provider.buildLaunchSpec(request, true);
    let result;
    try {
        result = await (0, processRunner_1.runProcess)(commandPath, launchSpec.args, {
            cwd: launchSpec.cwd,
            stdinText: launchSpec.stdinText,
            shell: launchSpec.shell,
            env: launchSpec.env,
            timeoutMs: request.timeoutMs
        });
    }
    catch (error) {
        if (error instanceof processRunner_1.ProcessLaunchError) {
            throw new ProjectGenerationError(provider.describeLaunchError(commandPath, error));
        }
        throw error;
    }
    const responseText = await provider.extractResponseText(result.stdout, result.stderr, request.lastMessagePath);
    if (result.code !== 0) {
        throw new ProjectGenerationError(provider.summarizeResult({
            exitCode: result.code,
            stderr: result.stderr,
            lastMessage: responseText
        }));
    }
    return {
        responseText,
        providerId: provider.id,
        commandPath,
        launchArgs: launchSpec.args,
        launchCwd: launchSpec.cwd,
        launchShell: Boolean(launchSpec.shell)
    };
}
async function generatePrdDraft(input, config, cwd) {
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
    const warnings = [];
    if (!/^#\s+/m.test(prdText)) {
        warnings.push('Generated PRD is missing a top-level # heading.');
    }
    return {
        prdText,
        ...(warnings.length > 0 ? { generationWarnings: warnings } : {})
    };
}
async function generateTasksFromPrd(input, config, cwd, artifactDir) {
    const readiness = (0, prdReadiness_1.analyzePrdReadiness)(input.prdText);
    if (readiness.blockers.length > 0) {
        throw new ProjectGenerationError(`PRD readiness has blockers; task generation is refused. ${readiness.blockers.join(' ')}`);
    }
    const prompt = TASK_GENERATION_PROMPT_TEMPLATE
        .replace('{PROJECT_TYPE}', input.projectType?.trim() || 'other')
        .replace('{PRD_HASH}', input.prdHash)
        .replace('{CONSTRAINTS}', input.constraints?.trim() || 'none')
        .replace('{PRD_TEXT}', input.prdText.replace(/<\/prd>/gi, '[/prd]'));
    const { responseText } = await runPromptThroughConfiguredProvider(prompt, config, cwd, 'ralph-tasks');
    const parsed = parseTaskGenerationResponse(responseText);
    const planArtifact = {
        schemaVersion: 1,
        kind: 'taskGenerationPlan',
        generatedAt: new Date().toISOString(),
        status: 'draft',
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
        await (0, prdReadiness_1.persistTaskGenerationPlanArtifact)(artifactDir, planArtifact);
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
async function generateProjectDraft(input, config, cwd, artifactDir) {
    const prd = await generatePrdDraft(input, config, cwd);
    const readiness = (0, prdReadiness_1.analyzePrdReadiness)(prd.prdText);
    if (readiness.blockers.length > 0) {
        throw new ProjectGenerationError(`Generated PRD failed readiness review: ${readiness.blockers.join(' ')}`);
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
//# sourceMappingURL=projectGenerator.js.map