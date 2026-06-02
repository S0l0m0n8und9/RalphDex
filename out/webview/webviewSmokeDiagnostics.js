"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activationSmokeDiagnostics = exports.WebviewSmokeDiagnostics = void 0;
class WebviewSmokeDiagnostics {
    latest = new Map();
    waiters = new Set();
    recordReady(surface, diagnostic) {
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
    waitForReady(surface, timeoutMs = 10000) {
        const existing = this.latest.get(surface);
        if (existing) {
            return Promise.resolve(existing);
        }
        return new Promise((resolve, reject) => {
            const waiter = {
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
    reset() {
        this.latest.clear();
        for (const waiter of this.waiters) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error('Webview smoke diagnostics reset before readiness was observed.'));
        }
        this.waiters.clear();
    }
    describeLatest() {
        if (this.latest.size === 0) {
            return 'none';
        }
        return Array.from(this.latest.entries())
            .map(([surface, diagnostic]) => `${surface}=${diagnostic.mountedText}`)
            .join(', ');
    }
}
exports.WebviewSmokeDiagnostics = WebviewSmokeDiagnostics;
exports.activationSmokeDiagnostics = new WebviewSmokeDiagnostics();
//# sourceMappingURL=webviewSmokeDiagnostics.js.map