"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopDecisionService = void 0;
const loopLogic_1 = require("../loopLogic");
function controlPlaneRuntimeChanges(changedFiles) {
    const matches = new Set();
    for (const filePath of changedFiles) {
        const normalized = filePath.replace(/\\/g, '/');
        if (/^(?:.+\/)?package\.json$/.test(normalized)
            || /(?:^|\/)(?:src|out|prompt-templates)\//.test(normalized)) {
            matches.add(filePath);
        }
    }
    return Array.from(matches).sort();
}
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
        const runtimeChanges = controlPlaneRuntimeChanges(input.relevantChangedFiles);
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
        if (runtimeChanges.length > 0) {
            loopDecision = {
                shouldContinue: false,
                stopReason: 'control_plane_reload_required',
                message: 'Control-plane runtime files changed; rerun Ralph in a fresh process before continuing.'
            };
            result.stopReason = 'control_plane_reload_required';
            result.followUpAction = 'stop';
            result.remediation = null;
            result.warnings.push(`Control-plane runtime files changed during this iteration; rerun Ralph in a fresh process before continuing. (${runtimeChanges.join(', ')})`);
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
exports.LoopDecisionService = LoopDecisionService;
//# sourceMappingURL=LoopDecisionService.js.map