import * as vscode from 'vscode';

/** Deep-set a dotted path like "simple.model" inside an object. */
export function deepSet(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/**
 * Serializes config writes so nested updates do not overwrite each other and
 * commands can wait for the latest settings to be persisted before running.
 */
export class SerialAsyncQueue {
  private pending: Promise<void> = Promise.resolve();

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.then(task, task);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }

  public async whenIdle(): Promise<void> {
    await this.pending;
  }
}

export class WebviewConfigSync {
  private readonly writes = new SerialAsyncQueue();

  public enqueueSettingUpdate(key: string, value: unknown): Promise<void> {
    return this.writes.enqueue(async () => {
      const wsConfig = vscode.workspace.getConfiguration('ralphCodex');
      if (key.includes('.')) {
        const dotIdx = key.indexOf('.');
        const parentKey = key.slice(0, dotIdx);
        const subPath = key.slice(dotIdx + 1);
        const current = wsConfig.get<Record<string, unknown>>(parentKey) ?? {};
        const updated = deepSet(structuredClone(current), subPath, value);
        await wsConfig.update(parentKey, updated, vscode.ConfigurationTarget.Workspace);
      } else {
        await wsConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
      }
    });
  }

  public async whenIdle(): Promise<void> {
    await this.writes.whenIdle();
  }
}
