"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewGeneratedTaskShape = reviewGeneratedTaskShape;
exports.reviewGeneratedTaskShapeDetailed = reviewGeneratedTaskShapeDetailed;
const planningPass_1 = require("./planningPass");
function toDiagnosticTask(task) {
    return {
        ...task,
        status: task.status ?? 'todo'
    };
}
function reviewGeneratedTaskShape(input) {
    const warnings = [];
    for (const finding of reviewGeneratedTaskShapeDetailed(input)) {
        warnings.push(`Task ${finding.taskId} "${finding.taskTitle.trim()}": ${finding.message}`);
    }
    return warnings;
}
function reviewGeneratedTaskShapeDetailed(input) {
    const findings = [];
    for (const task of input.tasks) {
        const result = (0, planningPass_1.analyzeTaskShape)({
            task: toDiagnosticTask(task),
            workspaceScan: input.workspaceScan,
            effectiveValidationCommand: input.effectiveValidationCommand
        });
        for (const finding of result.findings) {
            findings.push({
                taskId: task.id,
                taskTitle: task.title,
                severity: finding.severity,
                code: finding.code,
                message: finding.message
            });
        }
    }
    return findings;
}
//# sourceMappingURL=taskGenerationReview.js.map