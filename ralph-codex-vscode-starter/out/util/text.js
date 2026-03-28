"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstNonEmptyLine = firstNonEmptyLine;
exports.truncateSummary = truncateSummary;
/**
 * Returns the first non-empty line from `text`, trimmed, or null if none.
 */
function firstNonEmptyLine(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
        ?? null;
}
/**
 * Truncates `value` to `maxLength` characters, appending '...' if needed.
 */
function truncateSummary(value, maxLength = 240) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
//# sourceMappingURL=text.js.map