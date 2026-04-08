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
exports.WebviewConfigSync = exports.SerialAsyncQueue = void 0;
exports.deepSet = deepSet;
const vscode = __importStar(require("vscode"));
/** Deep-set a dotted path like "simple.model" inside an object. */
function deepSet(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
            cur[key] = {};
        }
        cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
}
/**
 * Serializes config writes so nested updates do not overwrite each other and
 * commands can wait for the latest settings to be persisted before running.
 */
class SerialAsyncQueue {
    pending = Promise.resolve();
    enqueue(task) {
        const next = this.pending.then(task, task);
        this.pending = next.then(() => undefined, () => undefined);
        return next;
    }
    async whenIdle() {
        await this.pending;
    }
}
exports.SerialAsyncQueue = SerialAsyncQueue;
class WebviewConfigSync {
    writes = new SerialAsyncQueue();
    enqueueSettingUpdate(key, value, resourceUri) {
        return this.writes.enqueue(async () => {
            const wsConfig = vscode.workspace.getConfiguration('ralphCodex', resourceUri);
            const target = resourceUri
                ? vscode.ConfigurationTarget.WorkspaceFolder
                : vscode.ConfigurationTarget.Workspace;
            if (key.includes('.')) {
                const dotIdx = key.indexOf('.');
                const parentKey = key.slice(0, dotIdx);
                const subPath = key.slice(dotIdx + 1);
                const current = wsConfig.get(parentKey) ?? {};
                const updated = deepSet(structuredClone(current), subPath, value);
                await wsConfig.update(parentKey, updated, target);
            }
            else {
                await wsConfig.update(key, value, target);
            }
        });
    }
    async whenIdle() {
        await this.writes.whenIdle();
    }
}
exports.WebviewConfigSync = WebviewConfigSync;
//# sourceMappingURL=webviewConfigSync.js.map