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
exports.isDedicatedPlanningFallbackSingleAgent = isDedicatedPlanningFallbackSingleAgent;
exports.shouldRequireTaskPlanForSelection = shouldRequireTaskPlanForSelection;
exports.shouldRunInlinePlanningPassForConfig = shouldRunInlinePlanningPassForConfig;
exports.parsePlanningResponse = parsePlanningResponse;
exports.writeTaskPlan = writeTaskPlan;
exports.readTaskPlan = readTaskPlan;
exports.formatTaskPlanContext = formatTaskPlanContext;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
function isImplementerLikeRole(agentRole) {
    return agentRole === 'implementer' || agentRole === 'build';
}
function isDedicatedPlanningFallbackSingleAgent(config) {
    return config.planningPass.enabled
        && config.planningPass.mode === 'dedicated'
        && isImplementerLikeRole(config.agentRole)
        && config.agentCount <= 1;
}
function shouldRequireTaskPlanForSelection(config) {
    return config.planningPass.enabled
        && config.planningPass.mode === 'dedicated'
        && isImplementerLikeRole(config.agentRole)
        && !isDedicatedPlanningFallbackSingleAgent(config);
}
function shouldRunInlinePlanningPassForConfig(config) {
    if (!config.planningPass.enabled || !isImplementerLikeRole(config.agentRole)) {
        return false;
    }
    return config.planningPass.mode === 'inline' || isDedicatedPlanningFallbackSingleAgent(config);
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
function parsePlanningResponse(text) {
    // Try to extract a fenced json block first.
    const fencedMatch = /```json\s*([\s\S]*?)```/.exec(text);
    const jsonText = fencedMatch ? fencedMatch[1].trim() : text.trim();
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }
    const record = parsed;
    const reasoning = typeof record.reasoning === 'string' ? record.reasoning.trim() : '';
    const approach = typeof record.approach === 'string' ? record.approach.trim() : '';
    const steps = Array.isArray(record.steps)
        ? record.steps.filter((s) => typeof s === 'string')
        : [];
    const risks = Array.isArray(record.risks)
        ? record.risks.filter((r) => typeof r === 'string')
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
async function writeTaskPlan(artifactsDir, taskId, plan) {
    const taskArtifactDir = path.join(artifactsDir, taskId);
    await fs.mkdir(taskArtifactDir, { recursive: true });
    const filePath = path.join(taskArtifactDir, 'task-plan.json');
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf8');
    return filePath;
}
/** Reads task-plan.json for a task. Returns null when the file does not exist or is malformed. */
async function readTaskPlan(artifactsDir, taskId) {
    const filePath = path.join(artifactsDir, taskId, 'task-plan.json');
    try {
        const text = await fs.readFile(filePath, 'utf8');
        return parsePlanningResponse(text);
    }
    catch {
        return null;
    }
}
/**
 * Builds a concise "Task Plan" context snippet for injection into the
 * implementer prompt. Returns an empty string when the plan has no content.
 */
function formatTaskPlanContext(plan) {
    const lines = [];
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
//# sourceMappingURL=planningPass.js.map