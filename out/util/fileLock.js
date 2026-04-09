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
exports.withFileLock = withFileLock;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const async_1 = require("./async");
const DEFAULT_LOCK_RETRY_COUNT = 120;
const DEFAULT_LOCK_RETRY_DELAY_MS = 250;
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;
/**
 * Acquires an exclusive file lock at `lockPath`, runs `fn`, and releases the
 * lock. Returns a discriminated result instead of throwing on timeout.
 *
 * Consolidates the lock patterns previously duplicated in stateManager,
 * taskFile (withTaskFileLock), and taskFile (withClaimFileLock).
 */
async function withFileLock(lockPath, options, fn) {
    const retryCount = Math.max(0, Math.floor(options?.lockRetryCount ?? DEFAULT_LOCK_RETRY_COUNT));
    const retryDelayMs = Math.max(0, Math.floor(options?.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS));
    const staleThreshold = options?.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
    const treatEperm = options?.treatEpermAsContention ?? true;
    for (let attempt = 0;; attempt += 1) {
        let handle = null;
        try {
            await fs.mkdir(path.dirname(lockPath), { recursive: true });
            handle = await fs.open(lockPath, 'wx');
            try {
                return {
                    outcome: 'ok',
                    value: await fn()
                };
            }
            finally {
                await handle.close();
                await fs.rm(lockPath, { force: true });
            }
        }
        catch (error) {
            if (handle) {
                await handle.close().catch(() => undefined);
            }
            const code = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : '';
            const isContention = code === 'EEXIST' || (treatEperm && code === 'EPERM');
            if (!isContention) {
                throw error;
            }
            if (attempt >= retryCount) {
                return {
                    outcome: 'lock_timeout',
                    lockPath,
                    attempts: attempt + 1
                };
            }
            // Stale-lock recovery: if the lock file is older than the threshold it
            // was likely left by a crashed process. Remove it and retry immediately.
            if (staleThreshold > 0) {
                try {
                    const lockStat = await fs.stat(lockPath);
                    if (Date.now() - lockStat.mtimeMs > staleThreshold) {
                        await fs.rm(lockPath, { force: true });
                        continue;
                    }
                }
                catch {
                    // lock was already removed between EEXIST and stat; retry normally
                }
            }
            await (0, async_1.sleep)(retryDelayMs);
        }
    }
}
//# sourceMappingURL=fileLock.js.map