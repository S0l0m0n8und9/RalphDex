import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults';
import { RalphCodexConfig } from '../config/types';
import { IWorkspaceConfiguration } from './types';

const SHIM_CONFIG_FILENAME = '.ralph-config.json';
const CONFIG_PREFIX = 'ralphCodex.';

type ShimConfigRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ShimConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefaultConfig(): RalphCodexConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as RalphCodexConfig;
}

function normalizeEnvVarName(key: string): string {
  return `RALPH_CODEX_${key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase()}`;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function coerceValue(rawValue: unknown, fallback: unknown): unknown {
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

function readConfigFile(workspaceRoot: string): ShimConfigRecord {
  const configPath = path.join(workspaceRoot, SHIM_CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${SHIM_CONFIG_FILENAME} must contain a JSON object.`);
  }

  return parsed;
}

function readFileOverride(fileConfig: ShimConfigRecord, key: keyof RalphCodexConfig): unknown {
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

function readEnvOverride(env: NodeJS.ProcessEnv, key: keyof RalphCodexConfig): string | undefined {
  const value = env[normalizeEnvVarName(key)];
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  return value;
}

function normalizeSectionKey(section: string): keyof RalphCodexConfig | undefined {
  const normalized = section.startsWith(CONFIG_PREFIX) ? section.slice(CONFIG_PREFIX.length) : section;
  return Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, normalized)
    ? (normalized as keyof RalphCodexConfig)
    : undefined;
}

export function readShimConfig(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env
): RalphCodexConfig {
  const config = cloneDefaultConfig();
  const mutableConfig = config as unknown as Record<string, unknown>;
  const fileConfig = readConfigFile(workspaceRoot);

  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof RalphCodexConfig>) {
    const fallback = DEFAULT_CONFIG[key];
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

export function createShimWorkspaceConfiguration(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env
): IWorkspaceConfiguration {
  const config = readShimConfig(workspaceRoot, env);
  const fileConfig = readConfigFile(workspaceRoot);

  function isExplicitlySet(section: string): boolean {
    const key = normalizeSectionKey(section);
    if (!key) {
      return false;
    }

    return readFileOverride(fileConfig, key) !== undefined || readEnvOverride(env, key) !== undefined;
  }

  return {
    get<T>(section: string, defaultValue?: T): T | undefined {
      const key = normalizeSectionKey(section);
      if (!key) {
        return defaultValue;
      }

      return config[key] as T;
    },
    inspect<T>(section: string): { key: string; workspaceValue?: T; globalValue?: T } | undefined {
      const key = normalizeSectionKey(section);
      if (!key) {
        return { key: section };
      }

      const workspaceValue = isExplicitlySet(section) ? (config[key] as T) : undefined;
      return { key: section, workspaceValue };
    }
  };
}

export { SHIM_CONFIG_FILENAME };
