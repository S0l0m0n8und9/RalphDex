/**
 * Extracts a human-readable message from an unknown thrown value.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
