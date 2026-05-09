import type { RalphWebviewCommand } from '../../ui/uiTypes';

export interface VscodeApi {
  postMessage(message: RalphWebviewCommand): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VscodeApi;
}

let cachedApi: VscodeApi | null = null;

export function vscodeApi(): VscodeApi {
  if (!cachedApi) {
    cachedApi = acquireVsCodeApi();
  }
  return cachedApi;
}
