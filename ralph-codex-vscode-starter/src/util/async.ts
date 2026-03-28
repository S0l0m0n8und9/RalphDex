/**
 * Returns a promise that resolves after `delayMs` milliseconds.
 */
export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
