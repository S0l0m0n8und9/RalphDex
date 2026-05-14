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
exports.applySelectedDoctrineProposalReview = applySelectedDoctrineProposalReview;
exports.rejectSelectedDoctrineProposalReview = rejectSelectedDoctrineProposalReview;
const fs = __importStar(require("fs/promises"));
const artifactStore_1 = require("./artifactStore");
const doctrineProposalApply_1 = require("./doctrineProposalApply");
const doctrineProposals_1 = require("./doctrineProposals");
function assertProposed(proposal) {
    if (proposal.status !== 'proposed') {
        throw new Error(`Doctrine proposal "${proposal.proposalId}" has already been ${proposal.status}.`);
    }
}
function readIndexes(proposal, selectedUpdateIndexes) {
    const indexes = selectedUpdateIndexes ?? proposal.updates.map((_, index) => index);
    const unique = Array.from(new Set(indexes)).sort((left, right) => left - right);
    if (unique.length === 0) {
        throw new Error('Select at least one doctrine proposal update before applying.');
    }
    for (const index of unique) {
        if (!Number.isInteger(index) || index < 0 || index >= proposal.updates.length) {
            throw new Error(`Doctrine proposal update index ${index} is out of range.`);
        }
    }
    return unique;
}
function requireProtectedApproval(proposal, selectedIndexes, explicitProtectedApproval) {
    const selectedProtectedTargets = selectedIndexes
        .map((index) => proposal.updates[index])
        .flatMap((update) => {
        if (!update || typeof update.targetFile !== 'string') {
            return [];
        }
        const normalizedTarget = (0, doctrineProposals_1.normalizeDoctrineTargetFile)(update.targetFile);
        if (!normalizedTarget || !(0, doctrineProposals_1.isProtectedDoctrineTargetFile)(normalizedTarget)) {
            return [];
        }
        return [normalizedTarget];
    });
    if (selectedProtectedTargets.length > 0 && !explicitProtectedApproval) {
        throw new Error(`Doctrine proposal "${proposal.proposalId}" requires explicit protected approval before mutating ${Array.from(new Set(selectedProtectedTargets)).join(', ')}.`);
    }
}
function assertProposalArtifactShape(proposal) {
    if (!Array.isArray(proposal.updates) || proposal.updates.length === 0) {
        throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates must be a non-empty array.`);
    }
    proposal.updates.forEach((update, index) => {
        if (typeof update !== 'object' || update === null || Array.isArray(update)) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}] must be an object.`);
        }
        const normalizedTarget = typeof update.targetFile === 'string'
            ? (0, doctrineProposals_1.normalizeDoctrineTargetFile)(update.targetFile)
            : null;
        if (!normalizedTarget) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].targetFile is invalid.`);
        }
        if (!['append', 'replaceSection', 'addSectionItem'].includes(update.operation)) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].operation is invalid.`);
        }
        if (typeof update.proposedText !== 'string' || update.proposedText.trim().length === 0) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].proposedText is required.`);
        }
        if (typeof update.rationale !== 'string' || update.rationale.trim().length === 0) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].rationale is required.`);
        }
        if (!Array.isArray(update.evidence) || update.evidence.length === 0 || update.evidence.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].evidence is invalid.`);
        }
        if ((update.operation === 'replaceSection' || update.operation === 'addSectionItem')
            && (typeof update.section !== 'string' || update.section.trim().length === 0)) {
            throw new Error(`Doctrine proposal artifact "${proposal.proposalId}" is malformed: updates[${index}].section is required for ${update.operation}.`);
        }
    });
}
async function readProposal(artifactRootDir, proposalId) {
    const paths = (0, artifactStore_1.resolveDoctrineProposalCanonicalPaths)(artifactRootDir, proposalId);
    const raw = JSON.parse(await fs.readFile(paths.jsonPath, 'utf8'));
    if (raw.kind !== 'doctrineUpdateProposal' || raw.proposalId !== proposalId || !Array.isArray(raw.updates)) {
        throw new Error(`Doctrine proposal artifact "${proposalId}" is malformed.`);
    }
    assertProposalArtifactShape(raw);
    return raw;
}
function deriveAction(input) {
    const selected = new Set(input.selectedIndexes);
    const unselectedIndexes = input.proposal.updates
        .map((_, index) => index)
        .filter((index) => !selected.has(index));
    const rejectedUpdateIndexes = Array.from(new Set([
        ...input.rejectedSelectedIndexes,
        ...unselectedIndexes
    ])).sort((left, right) => left - right);
    if (input.appliedUpdateIndexes.length === 0) {
        return { action: 'rejected', rejectedUpdateIndexes };
    }
    if (rejectedUpdateIndexes.length > 0) {
        return { action: 'partiallyApplied', rejectedUpdateIndexes };
    }
    return { action: 'applied', rejectedUpdateIndexes: [] };
}
async function persistReview(input) {
    const reviewedAt = new Date().toISOString();
    const review = {
        schemaVersion: 1,
        kind: 'doctrineProposalReview',
        proposalId: input.proposal.proposalId,
        action: input.action,
        reviewedAt,
        reviewedBy: 'operator',
        risk: input.proposal.risk,
        selectedTaskId: input.proposal.selectedTaskId,
        provenanceId: input.proposal.provenanceId,
        appliedUpdateIndexes: input.appliedUpdateIndexes,
        rejectedUpdateIndexes: input.rejectedUpdateIndexes,
        filesChanged: input.filesChanged,
        warnings: input.warnings,
        errors: input.errors,
        reviewNotes: input.reviewNotes
    };
    const updatedProposal = {
        ...input.proposal,
        status: input.action,
        reviewedAt,
        reviewedBy: 'operator',
        reviewAction: input.action,
        appliedUpdateIndexes: input.appliedUpdateIndexes,
        rejectedUpdateIndexes: input.rejectedUpdateIndexes,
        reviewNotes: input.reviewNotes,
        applicationWarnings: input.warnings
    };
    const [reviewPaths] = await Promise.all([
        (0, artifactStore_1.writeDoctrineProposalReviewArtifact)({ artifactRootDir: input.artifactRootDir, review }),
        (0, artifactStore_1.writeUpdatedDoctrineProposalArtifact)({ artifactRootDir: input.artifactRootDir, proposal: updatedProposal })
    ]);
    return {
        review,
        updatedProposal,
        reviewPath: reviewPaths.reviewJsonPath,
        reviewMarkdownPath: reviewPaths.reviewMdPath
    };
}
async function applySelectedDoctrineProposalReview(input) {
    const proposal = await readProposal(input.artifactRootDir, input.proposalId);
    assertProposed(proposal);
    const selectedIndexes = readIndexes(proposal, input.selectedUpdateIndexes);
    requireProtectedApproval(proposal, selectedIndexes, input.explicitProtectedApproval);
    const application = await (0, doctrineProposalApply_1.applyDoctrineProposal)({
        proposal,
        rootPath: input.rootPath,
        selectedUpdateIndexes: selectedIndexes
    });
    const derived = deriveAction({
        proposal,
        selectedIndexes,
        appliedUpdateIndexes: application.appliedUpdateIndexes,
        rejectedSelectedIndexes: application.rejectedUpdateIndexes
    });
    return persistReview({
        artifactRootDir: input.artifactRootDir,
        proposal,
        action: derived.action,
        appliedUpdateIndexes: application.appliedUpdateIndexes,
        rejectedUpdateIndexes: derived.rejectedUpdateIndexes,
        filesChanged: application.filesChanged,
        warnings: application.warnings,
        errors: application.errors,
        reviewNotes: input.reviewNotes ?? null
    });
}
async function rejectSelectedDoctrineProposalReview(input) {
    const proposal = await readProposal(input.artifactRootDir, input.proposalId);
    assertProposed(proposal);
    return persistReview({
        artifactRootDir: input.artifactRootDir,
        proposal,
        action: 'rejected',
        appliedUpdateIndexes: [],
        rejectedUpdateIndexes: proposal.updates.map((_, index) => index),
        filesChanged: [],
        warnings: [],
        errors: [],
        reviewNotes: input.reviewNotes ?? null
    });
}
//# sourceMappingURL=doctrineProposalReview.js.map