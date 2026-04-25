"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopDecisionService = void 0;
const loopLogic_1 = require("../loopLogic");
class LoopDecisionService {
    evaluate(input) {
        let loopDecision = (0, loopLogic_1.decideLoopContinuation)({
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
        const result = {
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
exports.LoopDecisionService = LoopDecisionService;
//# sourceMappingURL=LoopDecisionService.js.map