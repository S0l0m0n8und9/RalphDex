"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewGeneratedTaskShape = reviewGeneratedTaskShape;
const planningPass_1 = require("./planningPass");
function toDiagnosticTask(task) {
    return {
        ...task,
        status: task.status ?? 'todo'
    };
}
function reviewGeneratedTaskShape(input) {
    const warnings = [];
    for (const task of input.tasks) {
        const result = (0, planningPass_1.analyzeTaskShape)({
            task: toDiagnosticTask(task),
            workspaceScan: input.workspaceScan,
            effectiveValidationCommand: input.effectiveValidationCommand
        });
        for (const finding of result.findings) {
            warnings.push(`Task ${task.id} "${task.title.trim()}": ${finding.message}`);
        }
    }
    return warnings;
}
//# sourceMappingURL=taskGenerationReview.js.map