import { decideLoopContinuation } from '../loopLogic';
import type { CompletionReconciliationOutcome } from '../reconciliation';
import type { PreparedIterationContext } from '../iterationPreparation';
import type { RalphIterationResult, RalphLoopDecision } from '../types';

export interface EvaluateLoopDecisionInput {
  prepared: PreparedIterationContext;
  result: RalphIterationResult;
  selectedTaskCompleted: boolean;
  remainingSubtaskCount: number;
  remainingTaskCount: number;
  hasActionableTask: boolean;
  reachedIterationCap: boolean;
  completionReconciliation: CompletionReconciliationOutcome;
}

export interface EvaluatedLoopDecision {
  loopDecision: RalphLoopDecision;
  result: RalphIterationResult;
  shouldBuildRemediation: boolean;
}

export class LoopDecisionService {
  public evaluate(input: EvaluateLoopDecisionInput): EvaluatedLoopDecision {
    let loopDecision = decideLoopContinuation({
      currentResult: input.result,
      selectedTaskCompleted: input.selectedTaskCompleted,
      remainingSubtaskCount: input.remainingSubtaskCount,
      remainingTaskCount: input.remainingTaskCount,
      hasActionableTask: input.hasActionableTask,
      preflightDiagnostics: input.prepared.preflightReport.diagnostics,
      noProgressThreshold: input.prepared.config.noProgressThreshold,
      repeatedFailureThreshold: input.prepared.config.repeatedFailureThreshold,
      stopOnHumanReviewNeeded: input.prepared.config.stopOnHumanReviewNeeded,
      autoReplenishBacklog: input.prepared.config.autoReplenishBacklog,
      reachedIterationCap: input.reachedIterationCap,
      previousIterations: input.prepared.state.iterationHistory
    });
    const result: RalphIterationResult = {
      ...input.result,
      warnings: [...input.result.warnings]
    };

    if (input.completionReconciliation.claimContested) {
      loopDecision = {
        shouldContinue: false,
        stopReason: 'claim_contested',
        message: `Selected task claim was no longer owned by ${input.prepared.provenanceId} during completion reconciliation.`
      };
      result.stopReason = 'claim_contested';
      result.followUpAction = 'stop';
      result.remediation = null;
      return {
        loopDecision,
        result,
        shouldBuildRemediation: false
      };
    }

    if (input.completionReconciliation.artifact.rejectionReason === 'policy_violation') {
      loopDecision = {
        shouldContinue: false,
        stopReason: 'policy_violation',
        message: 'Completion report requested a disallowed role mutation; downgraded to blocked.'
      };
      result.stopReason = 'policy_violation';
      result.followUpAction = 'stop';
      result.remediation = null;
      return {
        loopDecision,
        result,
        shouldBuildRemediation: false
      };
    }

    if (!loopDecision.shouldContinue) {
      result.stopReason = loopDecision.stopReason;
      result.followUpAction = 'stop';
      return {
        loopDecision,
        result,
        shouldBuildRemediation: true
      };
    }

    return {
      loopDecision,
      result,
      shouldBuildRemediation: false
    };
  }
}
