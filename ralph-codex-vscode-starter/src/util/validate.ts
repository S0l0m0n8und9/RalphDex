type FieldCheck = 'string' | 'number' | 'boolean' | 'array';

/**
 * Validates that `candidate` is a non-null object whose fields match the
 * specified type checks. Returns the value cast to `T`, or null on failure.
 *
 * Use for lightweight runtime shape validation at system boundaries (JSON
 * artifacts, external data) without requiring a schema library.
 */
export function validateRecord<T>(
  candidate: unknown,
  checks: Record<string, FieldCheck | ['literal', unknown]>
): T | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  for (const [key, check] of Object.entries(checks)) {
    if (Array.isArray(check)) {
      // Literal value check: ['literal', expectedValue]
      if (record[key] !== check[1]) {
        return null;
      }
    } else if (check === 'array') {
      if (!Array.isArray(record[key])) {
        return null;
      }
    } else {
      // eslint-disable-next-line valid-typeof
      if (typeof record[key] !== check) {
        return null;
      }
    }
  }

  return record as unknown as T;
}

/**
 * Consolidates the agent-id prefix builder pattern.
 */
export function buildPrefixedAgentId(prefix: string, agentId: string): string {
  const trimmed = agentId.trim() || 'default';
  return trimmed.startsWith(`${prefix}-`) ? trimmed : `${prefix}-${trimmed}`;
}
