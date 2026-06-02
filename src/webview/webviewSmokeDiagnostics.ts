export type WebviewSmokeSurface = 'dashboard' | 'sidebar' | 'prd-wizard';

export interface WebviewReadyDiagnostic {
  mode: WebviewSmokeSurface;
  mountedText: string;
  timestamp: string;
}

interface PendingWaiter {
  surface: WebviewSmokeSurface;
  resolve: (diagnostic: WebviewReadyDiagnostic) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class WebviewSmokeDiagnostics {
  private readonly latest = new Map<WebviewSmokeSurface, WebviewReadyDiagnostic>();
  private readonly waiters = new Set<PendingWaiter>();

  recordReady(surface: WebviewSmokeSurface, diagnostic: WebviewReadyDiagnostic): void {
    const normalized = {
      ...diagnostic,
      mode: surface
    };
    this.latest.set(surface, normalized);

    for (const waiter of [...this.waiters]) {
      if (waiter.surface !== surface) {
        continue;
      }
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.resolve(normalized);
    }
  }

  waitForReady(surface: WebviewSmokeSurface, timeoutMs = 10000): Promise<WebviewReadyDiagnostic> {
    const existing = this.latest.get(surface);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const waiter: PendingWaiter = {
        surface,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for ${surface} webview readiness. Latest diagnostics: ${this.describeLatest()}`));
        }, timeoutMs)
      };
      this.waiters.add(waiter);
    });
  }

  reset(): void {
    this.latest.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Webview smoke diagnostics reset before readiness was observed.'));
    }
    this.waiters.clear();
  }

  private describeLatest(): string {
    if (this.latest.size === 0) {
      return 'none';
    }
    return Array.from(this.latest.entries())
      .map(([surface, diagnostic]) => `${surface}=${diagnostic.mountedText}`)
      .join(', ');
  }
}

export const activationSmokeDiagnostics = new WebviewSmokeDiagnostics();
