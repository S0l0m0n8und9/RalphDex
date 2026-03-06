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
exports.Logger = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
function serializeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
    return { value: String(error) };
}
class Logger {
    channel;
    logFilePath;
    constructor(channel) {
        this.channel = channel;
    }
    async setWorkspaceLogFile(logFilePath) {
        this.logFilePath = logFilePath;
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    }
    info(message, meta) {
        this.write('INFO', message, meta);
    }
    warn(message, meta) {
        this.write('WARN', message, meta);
    }
    error(message, error, meta) {
        const payload = error === undefined ? meta : { ...meta, error: serializeError(error) };
        this.write('ERROR', message, payload);
    }
    show(preserveFocus = true) {
        this.channel.show(preserveFocus);
    }
    dispose() {
        this.channel.dispose();
    }
    write(level, message, meta) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(meta ?? {})
        };
        const line = JSON.stringify(entry);
        this.channel.appendLine(line);
        if (this.logFilePath) {
            void fs.appendFile(this.logFilePath, `${line}\n`, 'utf8').catch(() => undefined);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map