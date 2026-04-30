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
exports.applyDoctrineProposal = applyDoctrineProposal;
exports.detectProtectedTargets = detectProtectedTargets;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const doctrine_1 = require("./doctrine");
const KNOWN_DOCTRINE_FILENAMES = new Set(doctrine_1.DOCTRINE_MARKDOWN_FILES);
const PROTECTED_DOCTRINE_FILENAMES = new Set(doctrine_1.PROTECTED_DOCTRINE_FILES);
function resolveDoctrineFilePath(rootPath, targetFile) {
    const normalized = targetFile.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized.startsWith(`${doctrine_1.DOCTRINE_ROOT_RELATIVE}/`)) {
        return null;
    }
    const fileName = normalized.slice(`${doctrine_1.DOCTRINE_ROOT_RELATIVE}/`.length);
    if (!KNOWN_DOCTRINE_FILENAMES.has(fileName)) {
        return null;
    }
    return path.join(rootPath, '.ralph', 'doctrine', fileName);
}
function isProtectedTarget(targetFile) {
    const normalized = targetFile.replace(/\\/g, '/').replace(/^\.\//, '');
    const fileName = normalized.slice(`${doctrine_1.DOCTRINE_ROOT_RELATIVE}/`.length);
    return PROTECTED_DOCTRINE_FILENAMES.has(fileName);
}
function splitLines(text) {
    return text.split(/\r?\n/);
}
function ensureSingleTrailingNewline(text) {
    return `${text.trimEnd()}\n`;
}
function findSectionBoundaries(lines, section) {
    const headingPattern = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:#*)\\s*$`);
    let headingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (headingPattern.test(lines[i])) {
            headingIndex = i;
            break;
        }
    }
    if (headingIndex === -1) {
        return null;
    }
    let bodyEnd = lines.length;
    for (let i = headingIndex + 1; i < lines.length; i++) {
        if (/^##\s/.test(lines[i])) {
            bodyEnd = i;
            break;
        }
    }
    return { headingIndex, bodyStart: headingIndex + 1, bodyEnd };
}
const APPEND_SECTION_HEADING = '## Applied Doctrine Updates';
async function applyAppend(filePath, proposedText) {
    let existing;
    try {
        existing = await fs.readFile(filePath, 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
    }
    const trimmedProposed = proposedText.trim();
    if (existing.includes(trimmedProposed)) {
        return { warning: `Proposed text already present in ${path.basename(filePath)} — skipped.`, error: null };
    }
    let newContent;
    if (existing.includes(APPEND_SECTION_HEADING)) {
        // Insert inside existing section, before the next ## heading or at end
        const lines = existing.split('\n');
        const sectionIdx = lines.findIndex((l) => l.trim() === APPEND_SECTION_HEADING);
        let insertAt = lines.length;
        for (let i = sectionIdx + 1; i < lines.length; i++) {
            if (lines[i].startsWith('## ')) {
                insertAt = i;
                break;
            }
        }
        const insertLines = trimmedProposed.split('\n');
        lines.splice(insertAt, 0, ...insertLines, '');
        newContent = ensureSingleTrailingNewline(lines.join('\n'));
    }
    else {
        newContent = ensureSingleTrailingNewline(`${existing.trimEnd()}\n\n${APPEND_SECTION_HEADING}\n\n${trimmedProposed}`);
    }
    try {
        await fs.writeFile(filePath, newContent, 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
    }
    return { warning: null, error: null };
}
async function applyAddSectionItem(filePath, section, proposedText) {
    let existing;
    try {
        existing = await fs.readFile(filePath, 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
    }
    const lines = splitLines(existing);
    const boundaries = findSectionBoundaries(lines, section);
    if (!boundaries) {
        return {
            warning: null,
            error: `Section "## ${section}" not found in ${filePath}. Cannot add section item.`
        };
    }
    const bodyLines = lines.slice(boundaries.bodyStart, boundaries.bodyEnd);
    const bodyText = bodyLines.join('\n').trim();
    if (bodyText.includes(proposedText.trim())) {
        return {
            warning: `Proposed text already present in section "## ${section}" of ${filePath}. Skipping duplicate.`,
            error: null
        };
    }
    const insertLines = proposedText.trim().split(/\r?\n/);
    const before = lines.slice(0, boundaries.bodyEnd);
    const after = lines.slice(boundaries.bodyEnd);
    const trailingBlank = before.length > 0 && before[before.length - 1].trim() === '' ? [] : [''];
    const combined = [...before, ...trailingBlank, ...insertLines, ...after];
    try {
        await fs.writeFile(filePath, ensureSingleTrailingNewline(combined.join('\n')), 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
    }
    return { warning: null, error: null };
}
async function applyReplaceSection(filePath, section, proposedText) {
    let existing;
    try {
        existing = await fs.readFile(filePath, 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to read doctrine file: ${filePath}` };
    }
    const lines = splitLines(existing);
    const boundaries = findSectionBoundaries(lines, section);
    if (!boundaries) {
        return {
            warning: null,
            error: `Section "## ${section}" not found in ${filePath}. Cannot replace section.`
        };
    }
    const heading = lines[boundaries.headingIndex];
    const replacementLines = proposedText.trim().split(/\r?\n/);
    const before = lines.slice(0, boundaries.headingIndex);
    const after = lines.slice(boundaries.bodyEnd);
    const combined = [...before, heading, '', ...replacementLines, ...after];
    try {
        await fs.writeFile(filePath, ensureSingleTrailingNewline(combined.join('\n')), 'utf8');
    }
    catch {
        return { warning: null, error: `Failed to write doctrine file: ${filePath}` };
    }
    return { warning: null, error: null };
}
async function applySingleUpdate(update, index, rootPath) {
    const filePath = resolveDoctrineFilePath(rootPath, update.targetFile);
    if (!filePath) {
        return {
            updateIndex: index,
            success: false,
            fileChanged: null,
            warning: null,
            error: `targetFile "${update.targetFile}" is not a known doctrine file. Update rejected.`
        };
    }
    let result;
    if (update.operation === 'append') {
        result = await applyAppend(filePath, update.proposedText);
    }
    else if (update.operation === 'addSectionItem') {
        result = await applyAddSectionItem(filePath, update.section, update.proposedText);
    }
    else if (update.operation === 'replaceSection') {
        result = await applyReplaceSection(filePath, update.section, update.proposedText);
    }
    else {
        return {
            updateIndex: index,
            success: false,
            fileChanged: null,
            warning: null,
            error: `Unknown operation "${update.operation}". Update rejected.`
        };
    }
    if (result.error) {
        return { updateIndex: index, success: false, fileChanged: null, warning: result.warning, error: result.error };
    }
    if (result.warning) {
        return { updateIndex: index, success: false, fileChanged: null, warning: result.warning, error: null };
    }
    return { updateIndex: index, success: true, fileChanged: update.targetFile, warning: null, error: null };
}
async function applyDoctrineProposal(input) {
    const { proposal, rootPath } = input;
    const selectedIndexes = input.selectedUpdateIndexes
        ?? proposal.updates.map((_, i) => i);
    const updateResults = [];
    const appliedUpdateIndexes = [];
    const rejectedUpdateIndexes = [];
    const filesChangedSet = new Set();
    const warnings = [];
    const errors = [];
    for (const index of selectedIndexes) {
        const update = proposal.updates[index];
        if (!update) {
            errors.push(`Update index ${index} is out of range. Skipping.`);
            rejectedUpdateIndexes.push(index);
            updateResults.push({ updateIndex: index, success: false, fileChanged: null, warning: null, error: `Update index ${index} is out of range.` });
            continue;
        }
        const result = await applySingleUpdate(update, index, rootPath);
        updateResults.push(result);
        if (result.success && result.fileChanged) {
            appliedUpdateIndexes.push(index);
            filesChangedSet.add(result.fileChanged);
        }
        else {
            rejectedUpdateIndexes.push(index);
            if (result.warning) {
                warnings.push(`Update ${index + 1}: ${result.warning}`);
            }
            if (result.error) {
                errors.push(`Update ${index + 1}: ${result.error}`);
            }
        }
    }
    let action;
    if (appliedUpdateIndexes.length === 0) {
        action = 'rejected';
    }
    else if (rejectedUpdateIndexes.length === 0) {
        action = 'applied';
    }
    else {
        action = 'partiallyApplied';
    }
    return {
        action,
        appliedUpdateIndexes,
        rejectedUpdateIndexes,
        filesChanged: Array.from(filesChangedSet),
        warnings,
        errors,
        updateResults
    };
}
function detectProtectedTargets(proposal) {
    return proposal.updates
        .filter((update) => isProtectedTarget(update.targetFile))
        .map((update) => update.targetFile);
}
//# sourceMappingURL=doctrineProposalApply.js.map