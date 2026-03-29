import * as fs from 'fs/promises';
import { toErrorMessage } from '../util/error';
import { hashText } from './integrity';
import type { PreparedIterationContext } from './iterationPreparation';
import type { RalphExecutionPlan, RalphIntegrityFailure } from './types';

// ---------------------------------------------------------------------------
// Integrity failure types
// ---------------------------------------------------------------------------

export interface IntegrityFailureDetails {
  stage: RalphIntegrityFailure['stage'];
  message: string;
  expectedExecutionPlanHash: string | null;
  actualExecutionPlanHash: string | null;
  expectedPromptHash: string | null;
  actualPromptHash: string | null;
  expectedPayloadHash: string | null;
  actualPayloadHash: string | null;
}

export class RalphIntegrityFailureError extends Error {
  public constructor(public readonly details: IntegrityFailureDetails) {
    super(details.message);
    this.name = 'RalphIntegrityFailureError';
  }
}

// Thrown inside the pre-exec integrity window when the selected task was already
// completed by a concurrent agent between preparation and execution (gap 6).
export class StaleTaskContextError extends Error {
  public constructor(public readonly taskId: string) {
    super(`Task ${taskId} was already completed by a concurrent agent.`);
    this.name = 'StaleTaskContextError';
  }
}

// ---------------------------------------------------------------------------
// Pre-execution integrity verification
// ---------------------------------------------------------------------------

export async function readVerifiedExecutionPlanArtifact(
  executionPlanPath: string,
  expectedExecutionPlanHash: string
): Promise<RalphExecutionPlan> {
  const planText = await fs.readFile(executionPlanPath, 'utf8').catch((error: unknown) => {
    throw new RalphIntegrityFailureError({
      stage: 'executionPlanHash',
      message: `Execution integrity check failed before launch: could not read execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash,
      actualExecutionPlanHash: null,
      expectedPromptHash: null,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  });

  const actualExecutionPlanHash = hashText(planText);
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
    return JSON.parse(planText) as RalphExecutionPlan;
  } catch (error) {
    throw new RalphIntegrityFailureError({
      stage: 'executionPlanHash',
      message: `Execution integrity check failed before launch: could not parse execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash,
      actualExecutionPlanHash,
      expectedPromptHash: null,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  }
}

export async function readVerifiedPromptArtifact(plan: RalphExecutionPlan): Promise<string> {
  const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error: unknown) => {
    throw new RalphIntegrityFailureError({
      stage: 'promptArtifactHash',
      message: `Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${toErrorMessage(error)}`,
      expectedExecutionPlanHash: null,
      actualExecutionPlanHash: null,
      expectedPromptHash: plan.promptHash,
      actualPromptHash: null,
      expectedPayloadHash: null,
      actualPayloadHash: null
    });
  });

  const artifactHash = hashText(promptArtifactText);
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

export function toIntegrityFailureError(
  error: unknown,
  prepared: PreparedIterationContext
): RalphIntegrityFailureError | null {
  if (error instanceof RalphIntegrityFailureError) {
    return error;
  }

  const message = toErrorMessage(error);
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
