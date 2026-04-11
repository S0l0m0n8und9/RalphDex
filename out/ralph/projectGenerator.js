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
exports.generateProjectDraft = generateProjectDraft;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
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
        throw new ProjectGenerationError('AI response JSON block must be an object with "tasks" and optional "recommendedSkills" fields.');
    }
    const parsedObj = parsed;
    if (!Array.isArray(parsedObj.tasks) || parsedObj.tasks.length === 0) {
        throw new ProjectGenerationError('AI response JSON block must contain a non-empty "tasks" array.');
    }
    const tasks = parsedObj.tasks.map((item, i) => {
        if (typeof item !== 'object' || item === null ||
            typeof item.id !== 'string' ||
            typeof item.title !== 'string') {
            throw new ProjectGenerationError(`Task at index ${i} is missing required "id" or "title" field.`);
        }
        const rawValidation = item.suggestedValidationCommand;
        const validation = typeof rawValidation === 'string' && rawValidation.trim()
            ? rawValidation.trim()
            : undefined;
        return {
            id: item.id,
            title: item.title,
            status: 'todo',
            ...(validation !== undefined ? { validation } : {})
        };
    });
    const recommendedSkills = [];
    if (Array.isArray(parsedObj.recommendedSkills)) {
        for (const skill of parsedObj.recommendedSkills) {
            if (typeof skill === 'object' && skill !== null &&
                typeof skill.name === 'string' &&
                typeof skill.description === 'string' &&
                typeof skill.rationale === 'string') {
                recommendedSkills.push({
                    name: skill.name,
                    description: skill.description,
                    rationale: skill.rationale
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
function commandPathForConfig(config) {
    if (config.cliProvider === 'claude') {
        return config.claudeCommandPath;
    }
    if (config.cliProvider === 'copilot') {
        return config.copilotCommandPath;
    }
    return config.codexCommandPath;
}
async function generateProjectDraft(objective, config, cwd) {
    const commandPath = commandPathForConfig(config);
    const provider = (0, providerFactory_1.createCliProvider)(config);
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
    const result = await (0, processRunner_1.runProcess)(commandPath, launchSpec.args, {
        cwd: launchSpec.cwd,
        stdinText: launchSpec.stdinText
    });
    if (result.code !== 0) {
        throw new ProjectGenerationError(`CLI exited with code ${result.code}.`);
    }
    const responseText = await provider.extractResponseText(result.stdout, result.stderr, lastMessagePath);
    return parseGenerationResponse(responseText);
}
//# sourceMappingURL=projectGenerator.js.map