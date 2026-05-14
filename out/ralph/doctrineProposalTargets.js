"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectDoctrineProposalTargetFiles = selectDoctrineProposalTargetFiles;
function selectDoctrineProposalTargetFiles(proposal, selectedUpdateIndexes) {
    const indexes = Array.isArray(selectedUpdateIndexes) && selectedUpdateIndexes.length > 0
        ? selectedUpdateIndexes
        : proposal.updates.map((_, index) => index);
    return Array.from(new Set(indexes
        .map((index) => proposal.updates[index]?.targetFile)
        .filter((target) => typeof target === 'string' && target.length > 0)));
}
//# sourceMappingURL=doctrineProposalTargets.js.map