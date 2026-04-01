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
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new ProjectGenerationError('AI response JSON block must be a non-empty array of tasks.');
    }
    const tasks = parsed.map((item, i) => {
        if (typeof item !== 'object' || item === null ||
            typeof item.id !== 'string' ||
            typeof item.title !== 'string') {
            throw new ProjectGenerationError(`Task at index ${i} is missing required "id" or "title" field.`);
        }
        return {
            id: item.id,
            title: item.title,
            status: 'todo'
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
    result = await (0, processRunner_1.runProcess)(commandPath, launchSpec.args, {
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