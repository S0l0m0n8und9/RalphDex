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
exports.normalizeDoctrineTargetFile = normalizeDoctrineTargetFile;
exports.isProtectedDoctrineTargetFile = isProtectedDoctrineTargetFile;
exports.parseDoctrineUpdatesFromCompletionReport = parseDoctrineUpdatesFromCompletionReport;
exports.renderDoctrineProposalMarkdown = renderDoctrineProposalMarkdown;
exports.createDoctrineProposalArtifact = createDoctrineProposalArtifact;
exports.renderDoctrineProposalReviewMarkdown = renderDoctrineProposalReviewMarkdown;
const path = __importStar(require("path"));
const doctrine_1 = require("./doctrine");
const ALLOWED_OPERATIONS = new Set(['append', 'replaceSection', 'addSectionItem']);
const KNOWN_DOCTRINE_TARGETS = new Set(doctrine_1.DOCTRINE_MARKDOWN_FILES.map((fileName) => `${doctrine_1.DOCTRINE_ROOT_RELATIVE}/${fileName}`));
const PROTECTED_DOCTRINE_TARGETS = new Set(doctrine_1.PROTECTED_DOCTRINE_FILES.map((fileName) => `${doctrine_1.DOCTRINE_ROOT_RELATIVE}/${fileName}`));
const MAX_PROPOSED_TEXT_LENGTH = 4000;
const WARN_PROPOSED_TEXT_LENGTH = 1200;
const MAX_RATIONALE_LENGTH = 1600;
const WARN_RATIONALE_LENGTH = 600;
const MAX_EVIDENCE_ITEMS = 8;
const WARN_EVIDENCE_ITEMS = 4;
const MAX_EVIDENCE_ITEM_LENGTH = 400;
function normalizeTargetFile(value) {
    const trimmed = value.trim().replace(/\\/g, '/');
    if (!trimmed) {
        return null;
    }
    const withoutLeadingDotSlash = trimmed.replace(/^\.\//, '');
    const normalized = path.posix.normalize(withoutLeadingDotSlash);
    if (!normalized.startsWith(`${doctrine_1.DOCTRINE_ROOT_RELATIVE}/`)) {
        return null;
    }
    return KNOWN_DOCTRINE_TARGETS.has(normalized) ? normalized : null;
}
function normalizeDoctrineTargetFile(value) {
    return normalizeTargetFile(value);
}
function isProtectedDoctrineTargetFile(targetFile) {
    const normalized = normalizeTargetFile(targetFile);
    return normalized ? PROTECTED_DOCTRINE_TARGETS.has(normalized) : false;
}
function normalizeOptionalSection(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeBoundedText(value, maximumLength) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (!normalized || normalized.length > maximumLength) {
        return null;
    }
    return normalized;
}
function parseEvidence(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_ITEMS) {
        return null;
    }
    const normalized = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            return null;
        }
        const trimmed = item.trim();
        if (!trimmed || trimmed.length > MAX_EVIDENCE_ITEM_LENGTH) {
            return null;
        }
        normalized.push(trimmed);
    }
    return normalized;
}
function maxRisk(left, right) {
    const order = { low: 0, medium: 1, high: 2 };
    return order[left] >= order[right] ? left : right;
}
function classifyDoctrineUpdate(update) {
    const protectedTarget = PROTECTED_DOCTRINE_TARGETS.has(update.targetFile);
    let risk = protectedTarget ? 'high' : 'low';
    if (update.operation === 'replaceSection' && risk === 'low') {
        risk = 'medium';
    }
    return {
        ...update,
        requiresApproval: protectedTarget,
        protectedTarget,
        risk
    };
}
function summarizeProposalUpdates(updates) {
    const uniqueTargets = Array.from(new Set(updates.map((update) => update.targetFile)));
    if (updates.length === 1) {
        return `1 proposed doctrine update for ${uniqueTargets[0]}.`;
    }
    return `${updates.length} proposed doctrine updates across ${uniqueTargets.length} doctrine file(s).`;
}
function parseDoctrineUpdate(candidate, index) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: expected an object.`
        };
    }
    const record = candidate;
    const targetFile = typeof record.targetFile === 'string'
        ? normalizeTargetFile(record.targetFile)
        : null;
    if (!targetFile) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: targetFile must reference a known doctrine file under ${doctrine_1.DOCTRINE_ROOT_RELATIVE}/.`
        };
    }
    if (typeof record.operation !== 'string' || !ALLOWED_OPERATIONS.has(record.operation)) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: operation must be one of append, replaceSection, or addSectionItem.`
        };
    }
    const operation = record.operation;
    const section = normalizeOptionalSection(record.section);
    if ((operation === 'replaceSection' || operation === 'addSectionItem') && !section) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: ${operation} requires a non-empty section.`
        };
    }
    const proposedText = normalizeBoundedText(record.proposedText, MAX_PROPOSED_TEXT_LENGTH);
    if (!proposedText) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: proposedText must be non-empty and at most ${MAX_PROPOSED_TEXT_LENGTH} characters.`
        };
    }
    const rationale = normalizeBoundedText(record.rationale, MAX_RATIONALE_LENGTH);
    if (!rationale) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: rationale must be non-empty and at most ${MAX_RATIONALE_LENGTH} characters.`
        };
    }
    const evidence = parseEvidence(record.evidence);
    if (!evidence) {
        return {
            update: null,
            warnings: [],
            error: `Ignored invalid doctrineUpdates[${index}]: evidence must be a non-empty array of short strings.`
        };
    }
    const warnings = [];
    if (proposedText.length > WARN_PROPOSED_TEXT_LENGTH) {
        warnings.push(`Doctrine update ${index + 1} proposedText is unusually long (${proposedText.length} chars).`);
    }
    if (rationale.length > WARN_RATIONALE_LENGTH) {
        warnings.push(`Doctrine update ${index + 1} rationale is unusually long (${rationale.length} chars).`);
    }
    if (evidence.length > WARN_EVIDENCE_ITEMS) {
        warnings.push(`Doctrine update ${index + 1} includes ${evidence.length} evidence entries; review for unnecessary breadth.`);
    }
    return {
        update: classifyDoctrineUpdate({
            targetFile,
            operation,
            section,
            proposedText,
            rationale,
            evidence
        }),
        warnings,
        error: null
    };
}
function parseDoctrineUpdatesFromCompletionReport(candidate) {
    if (candidate === undefined) {
        return { updates: [], warnings: [] };
    }
    if (!Array.isArray(candidate)) {
        return {
            updates: [],
            warnings: ['Ignored invalid doctrineUpdates: expected an array.']
        };
    }
    const updates = [];
    const warnings = [];
    candidate.forEach((entry, index) => {
        const parsed = parseDoctrineUpdate(entry, index);
        if (parsed.update) {
            updates.push(parsed.update);
        }
        if (parsed.error) {
            warnings.push(parsed.error);
        }
        warnings.push(...parsed.warnings);
    });
    return { updates, warnings };
}
function renderDoctrineProposalMarkdown(proposal) {
    const selectedTask = proposal.selectedTaskId
        ? `${proposal.selectedTaskId}${proposal.selectedTaskTitle ? ` - ${proposal.selectedTaskTitle}` : ''}`
        : 'none';
    const lines = [
        '# Doctrine Update Proposal',
        '',
        `- **Proposal ID**: ${proposal.proposalId}`,
        `- **Created**: ${proposal.createdAt}`,
        `- **Risk**: ${proposal.risk}`,
        `- **Source**: ${proposal.source}`,
        `- **Status**: ${proposal.status}`,
        `- **Provenance ID**: ${proposal.provenanceId ?? 'none'}`,
        `- **Iteration**: ${proposal.iteration ?? 'none'}`,
        `- **Selected task**: ${selectedTask}`,
        `- **Updates**: ${proposal.updates.length}`,
        ''
    ];
    if (proposal.warnings.length > 0) {
        lines.push('## Warnings', '');
        for (const warning of proposal.warnings) {
            lines.push(`- ${warning}`);
        }
        lines.push('');
    }
    lines.push('## Updates', '');
    for (let i = 0; i < proposal.updates.length; i++) {
        const update = proposal.updates[i];
        lines.push(`### Update ${i + 1}: ${update.targetFile}`, '', `- **Target file**: ${update.targetFile}`, `- **Operation**: ${update.operation}`, `- **Section**: ${update.section ?? 'none'}`, `- **Risk**: ${update.risk}`, `- **Protected target**: ${update.protectedTarget ? 'yes' : 'no'}`, `- **Approval required**: ${update.requiresApproval ? 'yes' : 'no'}`, '', '**Proposed text:**', '', '```', update.proposedText, '```', '', `**Rationale:** ${update.rationale}`, '', '**Evidence:**', '');
        for (const item of update.evidence) {
            lines.push(`- ${item}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
function createDoctrineProposalArtifact(input) {
    const risk = input.updates.reduce((current, update) => maxRisk(current, update.risk), 'low');
    const proposalId = input.proposalId
        ?? `doctrine-proposal-${input.provenanceId ?? `iteration-${input.iteration ?? 'unknown'}`}`;
    return {
        schemaVersion: 1,
        kind: 'doctrineUpdateProposal',
        proposalId,
        createdAt: input.createdAt ?? new Date().toISOString(),
        provenanceId: input.provenanceId,
        iteration: input.iteration,
        selectedTaskId: input.selectedTaskId,
        selectedTaskTitle: input.selectedTaskTitle,
        source: input.source,
        status: 'proposed',
        risk,
        summary: summarizeProposalUpdates(input.updates),
        updates: input.updates,
        warnings: input.warnings ?? []
    };
}
function renderDoctrineProposalReviewMarkdown(review) {
    const actionLabel = review.action === 'applied'
        ? 'Applied'
        : review.action === 'rejected'
            ? 'Rejected'
            : 'Partially Applied';
    const lines = [
        '# Doctrine Proposal Review',
        '',
        `- **Proposal ID**: ${review.proposalId}`,
        `- **Action**: ${actionLabel}`,
        `- **Reviewed at**: ${review.reviewedAt}`,
        `- **Reviewed by**: ${review.reviewedBy}`,
        `- **Risk**: ${review.risk}`,
        `- **Provenance ID**: ${review.provenanceId ?? 'none'}`,
        `- **Selected task**: ${review.selectedTaskId ?? 'none'}`,
        `- **Applied updates**: ${review.appliedUpdateIndexes.length > 0 ? review.appliedUpdateIndexes.map((i) => i + 1).join(', ') : 'none'}`,
        `- **Rejected updates**: ${review.rejectedUpdateIndexes.length > 0 ? review.rejectedUpdateIndexes.map((i) => i + 1).join(', ') : 'none'}`,
        `- **Files changed**: ${review.filesChanged.length > 0 ? review.filesChanged.join(', ') : 'none'}`,
        `- **Review notes**: ${review.reviewNotes ?? 'none'}`,
        ''
    ];
    if (review.warnings.length > 0) {
        lines.push('## Warnings', '');
        for (const warning of review.warnings) {
            lines.push(`- ${warning}`);
        }
        lines.push('');
    }
    if (review.errors.length > 0) {
        lines.push('## Errors', '');
        for (const error of review.errors) {
            lines.push(`- ${error}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=doctrineProposals.js.map