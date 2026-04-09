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
exports.SHIM_CONFIG_FILENAME = void 0;
exports.readShimConfig = readShimConfig;
exports.createShimWorkspaceConfiguration = createShimWorkspaceConfiguration;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const defaults_1 = require("../config/defaults");
const SHIM_CONFIG_FILENAME = '.ralph-config.json';
exports.SHIM_CONFIG_FILENAME = SHIM_CONFIG_FILENAME;
const CONFIG_PREFIX = 'ralphCodex.';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneDefaultConfig() {
    return JSON.parse(JSON.stringify(defaults_1.DEFAULT_CONFIG));
}
function normalizeEnvVarName(key) {
    return `RALPH_CODEX_${key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toUpperCase()}`;
}
function parseBoolean(value) {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return undefined;
}
function parseNumber(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function coerceValue(rawValue, fallback) {
    if (typeof fallback === 'string') {
        return typeof rawValue === 'string' ? rawValue : fallback;
    }
    if (typeof fallback === 'number') {
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            return rawValue;
        }
        if (typeof rawValue === 'string') {
            return parseNumber(rawValue) ?? fallback;
        }
        return fallback;
    }
    if (typeof fallback === 'boolean') {
        if (typeof rawValue === 'boolean') {
            return rawValue;
        }
        if (typeof rawValue === 'string') {
            return parseBoolean(rawValue) ?? fallback;
        }
        return fallback;
    }
    if (Array.isArray(fallback)) {
        if (Array.isArray(rawValue)) {
            return rawValue;
        }
        if (typeof rawValue === 'string') {
            const parsed = parseJson(rawValue);
            return Array.isArray(parsed) ? parsed : fallback;
        }
        return fallback;
    }
    if (isRecord(fallback)) {
        if (isRecord(rawValue)) {
            return rawValue;
        }
        if (typeof rawValue === 'string') {
            const parsed = parseJson(rawValue);
            return isRecord(parsed) ? parsed : fallback;
        }
    }
    return rawValue ?? fallback;
}
function readConfigFile(workspaceRoot) {
    const configPath = path.join(workspaceRoot, SHIM_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return {};
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!isRecord(parsed)) {
        throw new Error(`${SHIM_CONFIG_FILENAME} must contain a JSON object.`);
    }
    return parsed;
}
function readFileOverride(fileConfig, key) {
    if (Object.prototype.hasOwnProperty.call(fileConfig, key)) {
        return fileConfig[key];
    }
    const namespacedKey = `${CONFIG_PREFIX}${key}`;
    if (Object.prototype.hasOwnProperty.call(fileConfig, namespacedKey)) {
        return fileConfig[namespacedKey];
    }
    const nestedConfig = fileConfig.ralphCodex;
    if (isRecord(nestedConfig) && Object.prototype.hasOwnProperty.call(nestedConfig, key)) {
        return nestedConfig[key];
    }
    return undefined;
}
function readEnvOverride(env, key) {
    const value = env[normalizeEnvVarName(key)];
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }
    return value;
}
function normalizeSectionKey(section) {
    const normalized = section.startsWith(CONFIG_PREFIX) ? section.slice(CONFIG_PREFIX.length) : section;
    return Object.prototype.hasOwnProperty.call(defaults_1.DEFAULT_CONFIG, normalized)
        ? normalized
        : undefined;
}
function readShimConfig(workspaceRoot, env = process.env) {
    const config = cloneDefaultConfig();
    const mutableConfig = config;
    const fileConfig = readConfigFile(workspaceRoot);
    for (const key of Object.keys(defaults_1.DEFAULT_CONFIG)) {
        const fallback = defaults_1.DEFAULT_CONFIG[key];
        const fileOverride = readFileOverride(fileConfig, key);
        if (fileOverride !== undefined) {
            mutableConfig[key] = coerceValue(fileOverride, fallback);
            continue;
        }
        const envOverride = readEnvOverride(env, key);
        if (envOverride !== undefined) {
            mutableConfig[key] = coerceValue(envOverride, fallback);
        }
    }
    return config;
}
function createShimWorkspaceConfiguration(workspaceRoot, env = process.env) {
    const config = readShimConfig(workspaceRoot, env);
    const fileConfig = readConfigFile(workspaceRoot);
    function isExplicitlySet(section) {
        const key = normalizeSectionKey(section);
        if (!key) {
            return false;
        }
        return readFileOverride(fileConfig, key) !== undefined || readEnvOverride(env, key) !== undefined;
    }
    return {
        get(section, defaultValue) {
            const key = normalizeSectionKey(section);
            if (!key) {
                return defaultValue;
            }
            return config[key];
        },
        inspect(section) {
            const key = normalizeSectionKey(section);
            if (!key) {
                return { key: section };
            }
            const workspaceValue = isExplicitlySet(section) ? config[key] : undefined;
            return { key: section, workspaceValue };
        }
    };
}
//# sourceMappingURL=shimConfig.js.map