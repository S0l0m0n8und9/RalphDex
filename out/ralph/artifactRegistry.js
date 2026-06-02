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
exports.ARTIFACT_REGISTRY_FILE = exports.ARTIFACT_REGISTRY_SCHEMA_VERSION = void 0;
exports.resolveArtifactRegistryPath = resolveArtifactRegistryPath;
exports.toRegistryRelativePath = toRegistryRelativePath;
exports.artifactEntryId = artifactEntryId;
exports.createEmptyRegistry = createEmptyRegistry;
exports.upsertArtifactEntry = upsertArtifactEntry;
exports.removeArtifactEntries = removeArtifactEntries;
exports.queryArtifacts = queryArtifacts;
exports.buildArtifactEntry = buildArtifactEntry;
exports.readArtifactRegistry = readArtifactRegistry;
exports.registerArtifacts = registerArtifacts;
exports.reconcileArtifactRegistry = reconcileArtifactRegistry;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const fileLock_1 = require("../util/fileLock");
/**
 * Canonical artifact registry and relationship index (issue #69).
 *
 * Ralph writes many durable artifacts under `.ralph/artifacts/` — per-iteration
 * surfaces, run-level provenance bundles, doctrine proposals, latest-pointer
 * aliases, and diagnostics. Historically the only cross-artifact index was the
 * set of `latest-*.json` pointer files plus directory naming conventions, which
 * forces every consumer (dashboard, sidebar, cleanup) to know the on-disk
 * layout.
 *
 * This module adds a single `index.json` registry that records typed metadata
 * for every registered artifact, so consumers can query by `runId`, `taskId`,
 * `type`, `provider`, or `agentRole` without walking the tree. It is additive:
 * the latest-pointer files stay for backward compatibility, and the registry is
 * a convenience index — never the source of truth for the artifacts themselves.
 *
 * Storage: `<artifactsDir>/index.json`. Writes are serialised with a file lock
 * (`index.json.lock`) because parallel agents persist artifacts concurrently.
 * Paths are stored relative to the artifacts root, in POSIX form, so the index
 * is portable across machines and OSes.
 */
exports.ARTIFACT_REGISTRY_SCHEMA_VERSION = 1;
exports.ARTIFACT_REGISTRY_FILE = 'index.json';
// ---------------------------------------------------------------------------
// Paths and id derivation
// ---------------------------------------------------------------------------
/** Resolves the registry index location under the artifacts root. */
function resolveArtifactRegistryPath(artifactsDir) {
    return path.join(artifactsDir, exports.ARTIFACT_REGISTRY_FILE);
}
/** Normalises an absolute artifact path to a POSIX path relative to the root. */
function toRegistryRelativePath(artifactsDir, artifactPath) {
    const relative = path.isAbsolute(artifactPath)
        ? path.relative(artifactsDir, artifactPath)
        : artifactPath;
    return relative.split(path.sep).join('/');
}
/** Derives a stable entry id from its relative path. */
function artifactEntryId(relativePath) {
    return relativePath.split(path.sep).join('/');
}
// ---------------------------------------------------------------------------
// Pure registry operations
// ---------------------------------------------------------------------------
function createEmptyRegistry() {
    return { schemaVersion: exports.ARTIFACT_REGISTRY_SCHEMA_VERSION, entries: [] };
}
function sortEntries(entries) {
    return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}
/**
 * Inserts or replaces an entry, keyed by its `id` (path-derived). Re-registering
 * the same artifact path updates its metadata in place rather than duplicating.
 * Entries are kept sorted by path so the serialised index is diff-friendly.
 */
function upsertArtifactEntry(registry, entry) {
    const next = registry.entries.filter((existing) => existing.id !== entry.id);
    next.push(entry);
    return { ...registry, entries: sortEntries(next) };
}
/** Removes every entry whose relative path is in `relativePaths`. */
function removeArtifactEntries(registry, relativePaths) {
    const removeIds = new Set(relativePaths.map((p) => artifactEntryId(p)));
    return {
        ...registry,
        entries: registry.entries.filter((entry) => !removeIds.has(entry.id))
    };
}
/** Returns entries matching every provided filter field (AND semantics). */
function queryArtifacts(registry, query = {}) {
    return registry.entries.filter((entry) => {
        if (query.runId !== undefined && (entry.runId ?? null) !== query.runId) {
            return false;
        }
        if (query.taskId !== undefined && (entry.taskId ?? null) !== query.taskId) {
            return false;
        }
        if (query.type !== undefined && entry.type !== query.type) {
            return false;
        }
        if (query.provider !== undefined && (entry.provider ?? null) !== query.provider) {
            return false;
        }
        if (query.agentRole !== undefined && (entry.agentRole ?? null) !== query.agentRole) {
            return false;
        }
        if (query.agentId !== undefined && (entry.agentId ?? null) !== query.agentId) {
            return false;
        }
        if (query.pinned !== undefined && entry.pinned !== query.pinned) {
            return false;
        }
        return true;
    });
}
/** Builds a fully-formed entry from input, filling id/createdAt/pinned defaults. */
function buildArtifactEntry(artifactsDir, input, now = () => new Date()) {
    const relativePath = toRegistryRelativePath(artifactsDir, input.path);
    return {
        id: artifactEntryId(relativePath),
        type: input.type,
        path: relativePath,
        createdAt: input.createdAt ?? now().toISOString(),
        runId: input.runId ?? null,
        taskId: input.taskId ?? null,
        agentId: input.agentId ?? null,
        agentRole: input.agentRole ?? null,
        provider: input.provider ?? null,
        iteration: input.iteration ?? null,
        latestAlias: input.latestAlias ?? null,
        retentionClass: input.retentionClass,
        pinned: input.pinned ?? input.retentionClass === 'pinned',
        ...(input.related ? { related: input.related } : {})
    };
}
// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------
/** Reads the registry; returns an empty registry when none exists yet. */
async function readArtifactRegistry(artifactsDir) {
    const registryPath = resolveArtifactRegistryPath(artifactsDir);
    try {
        const parsed = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        return {
            schemaVersion: exports.ARTIFACT_REGISTRY_SCHEMA_VERSION,
            entries: Array.isArray(parsed.entries) ? parsed.entries : []
        };
    }
    catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            return createEmptyRegistry();
        }
        throw err;
    }
}
async function writeRegistry(artifactsDir, registry) {
    const registryPath = resolveArtifactRegistryPath(artifactsDir);
    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(registryPath, (0, integrity_1.stableJson)(registry), 'utf8');
}
/**
 * Registers (upserts) one or more artifacts under a file lock so concurrent
 * agents cannot lose each other's writes. Returns the updated registry.
 *
 * Throws on lock timeout; callers that treat registration as best-effort should
 * catch and continue — the registry can be rebuilt/reconciled from disk later.
 */
async function registerArtifacts(artifactsDir, inputs, options = {}) {
    if (inputs.length === 0) {
        return readArtifactRegistry(artifactsDir);
    }
    const lockPath = `${resolveArtifactRegistryPath(artifactsDir)}.lock`;
    const result = await (0, fileLock_1.withFileLock)(lockPath, options.lock, async () => {
        let registry = await readArtifactRegistry(artifactsDir);
        for (const input of inputs) {
            registry = upsertArtifactEntry(registry, buildArtifactEntry(artifactsDir, input, options.now));
        }
        await writeRegistry(artifactsDir, registry);
        return registry;
    });
    if (result.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring artifact-registry lock at ${result.lockPath} after ${result.attempts} attempts`);
    }
    return result.value;
}
/**
 * Reconciles the registry against the filesystem: drops entries whose backing
 * file no longer exists, so the index stays consistent after cleanup/reset.
 * Lock-guarded. Returns the reconciled registry plus the dropped relative paths.
 */
async function reconcileArtifactRegistry(artifactsDir, options = {}) {
    const lockPath = `${resolveArtifactRegistryPath(artifactsDir)}.lock`;
    const result = await (0, fileLock_1.withFileLock)(lockPath, options.lock, async () => {
        const registry = await readArtifactRegistry(artifactsDir);
        const removed = [];
        const kept = [];
        for (const entry of registry.entries) {
            const exists = await fileExists(path.join(artifactsDir, entry.path));
            if (exists) {
                kept.push(entry);
            }
            else {
                removed.push(entry.path);
            }
        }
        const reconciled = { ...registry, entries: sortEntries(kept) };
        if (removed.length > 0) {
            await writeRegistry(artifactsDir, reconciled);
        }
        return { registry: reconciled, removed };
    });
    if (result.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring artifact-registry lock at ${result.lockPath} after ${result.attempts} attempts`);
    }
    return result.value;
}
async function fileExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=artifactRegistry.js.map