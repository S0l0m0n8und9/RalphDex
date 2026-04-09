"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = sleep;
/**
 * Returns a promise that resolves after `delayMs` milliseconds.
 */
function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}
//# sourceMappingURL=async.js.map