"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashText = hashText;
exports.utf8ByteLength = utf8ByteLength;
exports.stableJson = stableJson;
exports.hashJson = hashJson;
exports.createProvenanceId = createProvenanceId;
const node_crypto_1 = require("node:crypto");
function hashText(value) {
    return `sha256:${(0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex')}`;
}
function utf8ByteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}
function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function hashJson(value) {
    return hashText(stableJson(value));
}
function createProvenanceId(input) {
    const compactTimestamp = input.createdAt
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace('T', 'T');
    const targetLabel = input.promptTarget === 'cliExec' ? 'cli' : 'ide';
    return `run-i${String(input.iteration).padStart(3, '0')}-${targetLabel}-${compactTimestamp}`;
}
//# sourceMappingURL=integrity.js.map