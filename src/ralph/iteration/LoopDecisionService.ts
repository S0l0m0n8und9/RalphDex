import { decideLoopContinuation } from '../loopLogic';
import type { CompletionReconciliationOutcome } from '../reconciliation';
import type { PreparedIterationContext } from '../iterationPreparation';
import type { RalphIterationResult, RalphLoopDecision } from '../types';

function controlPlaneRuntimeChanges(changedFiles: string[]): string[] {
  const matches = new Set<string>();

  for (const filePath of changedFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    if (/^(?:.+\/)?package\.json$/.test(normalized)
      || /(?:^|\/)(?:src|out|prompt-templates)\//.test(normalized)) {
      matches.add(filePath);
    }
  }

  return Array.from(matches).sort();
}

export interface EvaluateLoopDecisionInput {
  prepared: PreparedIterationContext;
  result: RalphIterationResult;
  selectedTaskCompleted: boolean;
  remainingSubtaskCount: number;
  remainingTaskCount: number;
  hasActionableTask: boolean;
  reachedIterationCap: boolean;
  relevantChangedFiles: string[];
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
    const runtimeChanges = controlPlaneRuntimeChanges(input.relevantChangedFiles);
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

    if (runtimeChanges.length > 0) {
      loopDecision = {
        shouldContinue: false,
        stopReason: 'control_plane_reload_required',
        message: 'Control-plane runtime files changed; rerun Ralph in a fresh process before continuing.'
      };
      result.stopReason = 'control_plane_reload_required';
      result.followUpAction = 'stop';
      result.remediation = null;
      result.warnings.push(
        `Control-plane runtime files changed during this iteration; rerun Ralph in a fresh process before continuing. (${runtimeChanges.join(', ')})`
      );
      return {
        loopDecision,
        result,
        shouldBuildRemediation: false
      };
    }

    return {
      loopDecision,
      result,
      shouldBuildRemediation: false
    };
  }
}
