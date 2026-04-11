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
exports.readDeadLetterQueue = readDeadLetterQueue;
exports.appendDeadLetterEntry = appendDeadLetterEntry;
exports.removeDeadLetterEntry = removeDeadLetterEntry;
const fs = __importStar(require("fs/promises"));
const EMPTY_QUEUE = {
    schemaVersion: 1,
    kind: 'deadLetterQueue',
    entries: []
};
async function readDeadLetterQueue(deadLetterPath) {
    try {
        const text = await fs.readFile(deadLetterPath, 'utf8');
        return JSON.parse(text);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { ...EMPTY_QUEUE, entries: [] };
        }
        throw err;
    }
}
async function appendDeadLetterEntry(deadLetterPath, entry) {
    const queue = await readDeadLetterQueue(deadLetterPath);
    queue.entries.push(entry);
    await fs.writeFile(deadLetterPath, JSON.stringify(queue, null, 2), 'utf8');
}
/**
 * Remove the entry with the given taskId from the dead-letter queue.
 * Returns true if an entry was removed, false if taskId was not present.
 */
async function removeDeadLetterEntry(deadLetterPath, taskId) {
    const queue = await readDeadLetterQueue(deadLetterPath);
    const before = queue.entries.length;
    queue.entries = queue.entries.filter((entry) => entry.taskId !== taskId);
    if (queue.entries.length === before) {
        return false;
    }
    await fs.writeFile(deadLetterPath, JSON.stringify(queue, null, 2), 'utf8');
    return true;
}
//# sourceMappingURL=deadLetter.js.map