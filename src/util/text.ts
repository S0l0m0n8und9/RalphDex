/**
 * Returns the first non-empty line from `text`, trimmed, or null if none.
 */
export function firstNonEmptyLine(text: string): string | null {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? null;
}

/**
 * Truncates `value` to `maxLength` characters, appending '...' if needed.
 */
export function truncateSummary(value: string, maxLength = 240): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
