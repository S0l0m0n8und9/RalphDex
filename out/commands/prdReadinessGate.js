"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RALPH_PRD_PLACEHOLDER = void 0;
exports.isMissingOrDefaultPrd = isMissingOrDefaultPrd;
exports.evaluatePrdReadinessGate = evaluatePrdReadinessGate;
const prdReadiness_1 = require("../ralph/prdReadiness");
exports.RALPH_PRD_PLACEHOLDER = '<!-- TODO: Replace with your Ralph objective before running iterations. -->\n';
function isMissingOrDefaultPrd(text, stateManager) {
    const trimmed = text.trim();
    return trimmed.length === 0
        || stateManager.isDefaultObjective(text)
        || trimmed === exports.RALPH_PRD_PLACEHOLDER.trim()
        || (trimmed.includes('Describe the current objective for Ralph here.')
            && trimmed.includes('What should Codex change?')
            && trimmed.includes('What constraints matter?'));
}
async function evaluatePrdReadinessGate(input) {
    const snapshot = await input.stateManager.ensureWorkspace(input.workspaceFolder.uri.fsPath, input.config);
    if (input.logger) {
        await input.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
    }
    const prdText = await input.stateManager.readObjectiveText(snapshot.paths);
    if (isMissingOrDefaultPrd(prdText, input.stateManager)) {
        return {
            status: 'missing_or_default',
            paths: snapshot.paths,
            prdText,
            readiness: null,
            readinessArtifactPaths: null
        };
    }
    const readiness = (0, prdReadiness_1.analyzePrdReadiness)(prdText);
    if (readiness.blockers.length > 0) {
        const readinessArtifactPaths = await (0, prdReadiness_1.persistLatestPrdReadinessArtifacts)(snapshot.paths.artifactDir, readiness);
        return {
            status: 'readiness_blocked',
            paths: snapshot.paths,
            prdText,
            readiness,
            readinessArtifactPaths
        };
    }
    return {
        status: 'ready',
        paths: snapshot.paths,
        prdText,
        readiness,
        readinessArtifactPaths: null
    };
}
//# sourceMappingURL=prdReadinessGate.js.map