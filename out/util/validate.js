"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRecord = validateRecord;
exports.buildPrefixedAgentId = buildPrefixedAgentId;
/**
 * Validates that `candidate` is a non-null object whose fields match the
 * specified type checks. Returns the value cast to `T`, or null on failure.
 *
 * Use for lightweight runtime shape validation at system boundaries (JSON
 * artifacts, external data) without requiring a schema library.
 */
function validateRecord(candidate, checks) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    for (const [key, check] of Object.entries(checks)) {
        if (Array.isArray(check)) {
            // Literal value check: ['literal', expectedValue]
            if (record[key] !== check[1]) {
                return null;
            }
        }
        else if (check === 'array') {
            if (!Array.isArray(record[key])) {
                return null;
            }
        }
        else {
            // eslint-disable-next-line valid-typeof
            if (typeof record[key] !== check) {
                return null;
            }
        }
    }
    return record;
}
/**
 * Consolidates the agent-id prefix builder pattern.
 */
function buildPrefixedAgentId(prefix, agentId) {
    const trimmed = agentId.trim() || 'default';
    return trimmed.startsWith(`${prefix}-`) ? trimmed : `${prefix}-${trimmed}`;
}
//# sourceMappingURL=validate.js.map