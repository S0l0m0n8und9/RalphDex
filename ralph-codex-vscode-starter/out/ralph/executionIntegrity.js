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
exports.StaleTaskContextError = exports.RalphIntegrityFailureError = void 0;
exports.readVerifiedExecutionPlanArtifact = readVerifiedExecutionPlanArtifact;
exports.readVerifiedPromptArtifact = readVerifiedPromptArtifact;
exports.toIntegrityFailureError = toIntegrityFailureError;
const fs = __importStar(require("fs/promises"));
const error_1 = require("../util/error");
const integrity_1 = require("./integrity");
class RalphIntegrityFailureError extends Error {
    details;
    constructor(details) {
        super(details.message);
        this.details = details;
        this.name = 'RalphIntegrityFailureError';
    }
}
exports.RalphIntegrityFailureError = RalphIntegrityFailureError;
// Thrown inside the pre-exec integrity window when the selected task was already
// completed by a concurrent agent between preparation and execution (gap 6).
class StaleTaskContextError extends Error {
    taskId;
    constructor(taskId) {
        super(`Task ${taskId} was already completed by a concurrent agent.`);
        this.taskId = taskId;
        this.name = 'StaleTaskContextError';
    }
}
exports.StaleTaskContextError = StaleTaskContextError;
// ---------------------------------------------------------------------------
// Pre-execution integrity verification
// ---------------------------------------------------------------------------
async function readVerifiedExecutionPlanArtifact(executionPlanPath, expectedExecutionPlanHash) {
    const planText = await fs.readFile(executionPlanPath, 'utf8').catch((error) => {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: could not read execution plan ${executionPlanPath}: ${(0, error_1.toErrorMessage)(error)}`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash: null,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    });
    const actualExecutionPlanHash = (0, integrity_1.hashText)(planText);
    if (actualExecutionPlanHash !== expectedExecutionPlanHash) {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: execution plan hash ${actualExecutionPlanHash} did not match expected plan hash ${expectedExecutionPlanHash}.`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
    try {
        return JSON.parse(planText);
    }
    catch (error) {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: could not parse execution plan ${executionPlanPath}: ${(0, error_1.toErrorMessage)(error)}`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
}
async function readVerifiedPromptArtifact(plan) {
    const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error) => {
        throw new RalphIntegrityFailureError({
            stage: 'promptArtifactHash',
            message: `Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${(0, error_1.toErrorMessage)(error)}`,
            expectedExecutionPlanHash: null,
            actualExecutionPlanHash: null,
            expectedPromptHash: plan.promptHash,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    });
    const artifactHash = (0, integrity_1.hashText)(promptArtifactText);
    if (artifactHash !== plan.promptHash) {
        throw new RalphIntegrityFailureError({
            stage: 'promptArtifactHash',
            message: `Execution integrity check failed before launch: prompt artifact hash ${artifactHash} did not match planned prompt hash ${plan.promptHash}.`,
            expectedExecutionPlanHash: null,
            actualExecutionPlanHash: null,
            expectedPromptHash: plan.promptHash,
            actualPromptHash: artifactHash,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
    return promptArtifactText;
}
function toIntegrityFailureError(error, prepared) {
    if (error instanceof RalphIntegrityFailureError) {
        return error;
    }
    const message = (0, error_1.toErrorMessage)(error);
    const stdinHashMatch = message.match(/stdin payload hash (\S+) did not match planned prompt hash (\S+)\./);
    if (stdinHashMatch) {
        return new RalphIntegrityFailureError({
            stage: 'stdinPayloadHash',
            message,
            expectedExecutionPlanHash: prepared.executionPlanHash,
            actualExecutionPlanHash: prepared.executionPlanHash,
            expectedPromptHash: prepared.executionPlan.promptHash,
            actualPromptHash: prepared.executionPlan.promptHash,
            expectedPayloadHash: stdinHashMatch[2],
            actualPayloadHash: stdinHashMatch[1]
        });
    }
    return null;
}
//# sourceMappingURL=executionIntegrity.js.map