import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { sleep } from './async';

const DEFAULT_LOCK_RETRY_COUNT = 120;
const DEFAULT_LOCK_RETRY_DELAY_MS = 250;
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

export interface FileLockOptions {
  lockRetryCount?: number;
  lockRetryDelayMs?: number;
  /** When set, lock files older than this threshold (ms) are treated as stale
   *  and removed automatically. Defaults to 5 minutes. Set to 0 to disable. */
  staleLockThresholdMs?: number;
  /** When true, treat EPERM (Windows) the same as EEXIST for contention. Defaults to true. */
  treatEpermAsContention?: boolean;
}

export interface FileLockTimeout {
  outcome: 'lock_timeout';
  lockPath: string;
  attempts: number;
}

export interface FileLockAcquired<T> {
  outcome: 'ok';
  value: T;
}

export type FileLockResult<T> = FileLockAcquired<T> | FileLockTimeout;

/**
 * Acquires an exclusive file lock at `lockPath`, runs `fn`, and releases the
 * lock. Returns a discriminated result instead of throwing on timeout.
 *
 * Consolidates the lock patterns previously duplicated in stateManager,
 * taskFile (withTaskFileLock), and taskFile (withClaimFileLock).
 */
export async function withFileLock<T>(
  lockPath: string,
  options: FileLockOptions | undefined,
  fn: () => Promise<T>
): Promise<FileLockResult<T>> {
  const retryCount = Math.max(0, Math.floor(options?.lockRetryCount ?? DEFAULT_LOCK_RETRY_COUNT));
  const retryDelayMs = Math.max(0, Math.floor(options?.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS));
  const staleThreshold = options?.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const treatEperm = options?.treatEpermAsContention ?? true;

  for (let attempt = 0; ; attempt += 1) {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      handle = await fs.open(lockPath, 'wx');
      try {
        return {
          outcome: 'ok',
          value: await fn()
        };
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }

      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
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
        } catch {
          // lock was already removed between EEXIST and stat; retry normally
        }
      }

      await sleep(retryDelayMs);
    }
  }
}
