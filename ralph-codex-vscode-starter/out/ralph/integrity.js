"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashText = hashText;
exports.utf8ByteLength = utf8ByteLength;
const node_crypto_1 = require("node:crypto");
function hashText(value) {
    return `sha256:${(0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex')}`;
}
function utf8ByteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}
//# sourceMappingURL=integrity.js.map