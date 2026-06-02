import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import { withFileLock } from '../util/fileLock';

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

export const ARTIFACT_REGISTRY_SCHEMA_VERSION = 1 as const;

export const ARTIFACT_REGISTRY_FILE = 'index.json';

/**
 * Retention class describes how the retention/cleanup system should treat an
 * artifact, independent of the per-artifact `pinned` override.
 *
 * - `pinned`: never auto-deleted (e.g. an artifact an operator chose to keep).
 * - `durable`: run/provenance-scoped; kept by the provenance retention policy.
 * - `iteration`: per-iteration surface; eligible for generated-artifact cleanup.
 * - `latest`: a latest-pointer alias, regenerated on each run.
 */
export type ArtifactRetentionClass = 'pinned' | 'durable' | 'iteration' | 'latest';

/** Cross-references linking an artifact to the artifacts it derives from. */
export interface ArtifactRelationships {
  /** The artifact this one was generated from (e.g. prompt -> evidence). */
  generatedFrom?: string;
  /** A prior artifact this one replaces (e.g. a regenerated latest pointer). */
  supersedes?: string;
  /** The artifact of a prior attempt this one retries. */
  retryOf?: string;
  /** The artifact this one reviews (e.g. a doctrine-proposal review). */
  reviewOf?: string;
}

export interface ArtifactRegistryEntry {
  /** Stable identifier; derived from the relative path so re-registration upserts. */
  id: string;
  /** Artifact kind, e.g. `iteration-result`, `provenance-bundle`, `doctrine-proposal`. */
  type: string;
  /** Artifact location relative to the artifacts root, in POSIX form. */
  path: string;
  /** ISO-8601 creation/registration timestamp. */
  createdAt: string;
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  agentRole?: string | null;
  provider?: string | null;
  iteration?: number | null;
  /** The latest-pointer file name this artifact is currently aliased by, if any. */
  latestAlias?: string | null;
  retentionClass: ArtifactRetentionClass;
  pinned: boolean;
  related?: ArtifactRelationships;
}

export interface ArtifactRegistry {
  schemaVersion: typeof ARTIFACT_REGISTRY_SCHEMA_VERSION;
  entries: ArtifactRegistryEntry[];
}

/** A registry entry without the registry-derived `id`/`createdAt`/`pinned` bookkeeping. */
export interface ArtifactRegistryEntryInput extends Omit<ArtifactRegistryEntry, 'id' | 'createdAt' | 'pinned'> {
  /** Optional explicit timestamp; defaults to now at registration time. */
  createdAt?: string;
  /** Optional explicit pin; defaults to `retentionClass === 'pinned'`. */
  pinned?: boolean;
}

export interface ArtifactQuery {
  runId?: string;
  taskId?: string;
  type?: string;
  provider?: string;
  agentRole?: string;
  agentId?: string;
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Paths and id derivation
// ---------------------------------------------------------------------------

/** Resolves the registry index location under the artifacts root. */
export function resolveArtifactRegistryPath(artifactsDir: string): string {
  return path.join(artifactsDir, ARTIFACT_REGISTRY_FILE);
}

/** Normalises an absolute artifact path to a POSIX path relative to the root. */
export function toRegistryRelativePath(artifactsDir: string, artifactPath: string): string {
  const relative = path.isAbsolute(artifactPath)
    ? path.relative(artifactsDir, artifactPath)
    : artifactPath;
  return relative.split(path.sep).join('/');
}

/** Derives a stable entry id from its relative path. */
export function artifactEntryId(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Pure registry operations
// ---------------------------------------------------------------------------

export function createEmptyRegistry(): ArtifactRegistry {
  return { schemaVersion: ARTIFACT_REGISTRY_SCHEMA_VERSION, entries: [] };
}

function sortEntries(entries: ArtifactRegistryEntry[]): ArtifactRegistryEntry[] {
  return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Inserts or replaces an entry, keyed by its `id` (path-derived). Re-registering
 * the same artifact path updates its metadata in place rather than duplicating.
 * Entries are kept sorted by path so the serialised index is diff-friendly.
 */
export function upsertArtifactEntry(
  registry: ArtifactRegistry,
  entry: ArtifactRegistryEntry
): ArtifactRegistry {
  const next = registry.entries.filter((existing) => existing.id !== entry.id);
  next.push(entry);
  return { ...registry, entries: sortEntries(next) };
}

/**
 * Removes every entry whose relative path is in `relativePaths`.
 *
 * Stored ids are always root-relative POSIX paths, so callers must pass relative
 * paths. An absolute path can never match a stored id and would silently remove
 * nothing — so absolute paths are rejected loudly rather than no-op'd.
 */
export function removeArtifactEntries(
  registry: ArtifactRegistry,
  relativePaths: readonly string[]
): ArtifactRegistry {
  const absolute = relativePaths.find((candidate) => path.isAbsolute(candidate));
  if (absolute !== undefined) {
    throw new Error(
      `removeArtifactEntries expects root-relative paths; received absolute path "${absolute}". `
      + 'Convert it with toRegistryRelativePath(artifactsDir, path) first.'
    );
  }
  const removeIds = new Set(relativePaths.map((candidate) => artifactEntryId(candidate)));
  return {
    ...registry,
    entries: registry.entries.filter((entry) => !removeIds.has(entry.id))
  };
}

/** Structural guard: a registry entry must carry the required string/boolean fields. */
function isValidRegistryEntry(value: unknown): value is ArtifactRegistryEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string'
    && typeof entry.type === 'string'
    && typeof entry.path === 'string'
    && typeof entry.createdAt === 'string'
    && typeof entry.retentionClass === 'string'
    && typeof entry.pinned === 'boolean'
  );
}

/** Returns entries matching every provided filter field (AND semantics). */
export function queryArtifacts(
  registry: ArtifactRegistry,
  query: ArtifactQuery = {}
): ArtifactRegistryEntry[] {
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
export function buildArtifactEntry(
  artifactsDir: string,
  input: ArtifactRegistryEntryInput,
  now: () => Date = () => new Date()
): ArtifactRegistryEntry {
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

export interface RegistryReadOptions {
  /**
   * Invoked with a human-readable message when the on-disk registry is
   * structurally suspect: an unrecognised `schemaVersion` or malformed entries
   * that are dropped. Lets callers surface incompatibilities (via their logger)
   * instead of failing silently. Optional — reads still succeed best-effort.
   */
  warn?: (message: string) => void;
}

/**
 * Reads the registry; returns an empty registry when none exists yet.
 *
 * The read is best-effort and forward/backward tolerant: an unrecognised
 * `schemaVersion` and any structurally-malformed entries are surfaced via
 * `options.warn` (when provided) rather than silently discarded, and malformed
 * entries are dropped so consumers never see partial objects.
 */
export async function readArtifactRegistry(
  artifactsDir: string,
  options: RegistryReadOptions = {}
): Promise<ArtifactRegistry> {
  const registryPath = resolveArtifactRegistryPath(artifactsDir);
  try {
    const parsed = JSON.parse(await fs.readFile(registryPath, 'utf8')) as Partial<ArtifactRegistry>;

    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== ARTIFACT_REGISTRY_SCHEMA_VERSION) {
      options.warn?.(
        `Artifact registry at ${registryPath} has schemaVersion ${parsed.schemaVersion}, `
        + `expected ${ARTIFACT_REGISTRY_SCHEMA_VERSION}; loading best-effort. Entries with an `
        + 'incompatible shape will be dropped.'
      );
    }

    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const entries = rawEntries.filter(isValidRegistryEntry);
    if (entries.length !== rawEntries.length) {
      options.warn?.(
        `Artifact registry at ${registryPath} dropped ${rawEntries.length - entries.length} `
        + 'malformed entr(y/ies) during load.'
      );
    }

    return { schemaVersion: ARTIFACT_REGISTRY_SCHEMA_VERSION, entries };
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyRegistry();
    }
    throw err;
  }
}

async function writeRegistry(artifactsDir: string, registry: ArtifactRegistry): Promise<void> {
  const registryPath = resolveArtifactRegistryPath(artifactsDir);
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(registryPath, stableJson(registry), 'utf8');
}

export interface RegistryWriteOptions extends RegistryReadOptions {
  /** Forwarded to the file lock; primarily for fast-failing tests. */
  lock?: { lockRetryCount?: number; lockRetryDelayMs?: number };
  now?: () => Date;
}

/**
 * Registers (upserts) one or more artifacts under a file lock so concurrent
 * agents cannot lose each other's writes. Returns the updated registry.
 *
 * Throws on lock timeout; callers that treat registration as best-effort should
 * catch and continue — the registry can be rebuilt/reconciled from disk later.
 */
export async function registerArtifacts(
  artifactsDir: string,
  inputs: readonly ArtifactRegistryEntryInput[],
  options: RegistryWriteOptions = {}
): Promise<ArtifactRegistry> {
  if (inputs.length === 0) {
    return readArtifactRegistry(artifactsDir, options);
  }
  const lockPath = `${resolveArtifactRegistryPath(artifactsDir)}.lock`;
  const result = await withFileLock(lockPath, options.lock, async () => {
    let registry = await readArtifactRegistry(artifactsDir, options);
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
 * Best-effort variant for additive registry adoption. Artifact files and latest
 * pointers remain authoritative; callers use this when a registry problem must
 * not fail the primary artifact write.
 */
export async function registerArtifactsBestEffort(
  artifactsDir: string,
  inputs: readonly ArtifactRegistryEntryInput[],
  options: RegistryWriteOptions = {}
): Promise<void> {
  try {
    await registerArtifacts(artifactsDir, inputs, options);
  } catch {
    // Reconciliation can rebuild the additive index from disk later.
  }
}

/**
 * Reconciles the registry against the filesystem: drops entries whose backing
 * file no longer exists, so the index stays consistent after cleanup/reset.
 * Lock-guarded. Returns the reconciled registry plus the dropped relative paths.
 */
export async function reconcileArtifactRegistry(
  artifactsDir: string,
  options: RegistryWriteOptions = {}
): Promise<{ registry: ArtifactRegistry; removed: string[] }> {
  const lockPath = `${resolveArtifactRegistryPath(artifactsDir)}.lock`;
  const result = await withFileLock(lockPath, options.lock, async () => {
    const registry = await readArtifactRegistry(artifactsDir, options);
    const removed: string[] = [];
    const kept: ArtifactRegistryEntry[] = [];
    for (const entry of registry.entries) {
      const exists = await fileExists(path.join(artifactsDir, entry.path));
      if (exists) {
        kept.push(entry);
      } else {
        removed.push(entry.path);
      }
    }
    const reconciled: ArtifactRegistry = { ...registry, entries: sortEntries(kept) };
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

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
