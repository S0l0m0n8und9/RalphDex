import * as fs from 'node:fs/promises';

/**
 * Returns true when the file-system entry at `target` exists and is accessible.
 * Accepts `null`/`undefined` for convenience (returns false).
 */
export async function pathExists(target: string | null | undefined): Promise<boolean> {
  if (!target) {
    return false;
  }

  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a JSON file and returns the parsed value as a plain record, or null
 * when the file does not exist, is not valid JSON, or is not an object.
 */
export async function readJsonRecord(target: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
