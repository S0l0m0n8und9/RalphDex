import type { RalphTaskSourceLocation } from './types';

/**
 * Source-location locator for `.ralph/tasks.json`.
 *
 * A small, dependency-free streaming scanner that maps each entry in the
 * top-level `tasks` array back to its line/column in the raw JSON text, so that
 * task-graph diagnostics can point operators at the offending entry. Extracted
 * from taskFile.ts to keep that module focused on the task graph itself; these
 * are pure string functions and are unit-tested in isolation.
 */

export function lineAndColumnAt(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
      lineStart = cursor + 1;
    }
  }

  return {
    line,
    column: index - lineStart + 1
  };
}

export function parseJsonString(text: string, startIndex: number): { value: string; endIndex: number } {
  let value = '';
  let index = startIndex + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      const next = text[index + 1];
      if (next === undefined) {
        throw new Error('Unexpected end of JSON string.');
      }

      value += char;
      value += next;
      index += 2;
      continue;
    }

    if (char === '"') {
      return {
        value: JSON.parse(`"${value}"`) as string,
        endIndex: index + 1
      };
    }

    value += char;
    index += 1;
  }

  throw new Error('Unexpected end of JSON string.');
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

export function findTasksArrayStart(text: string): number | null {
  let objectDepth = 0;
  let arrayDepth = 0;
  let lastToken: string | null = null;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const parsed = parseJsonString(text, index);
      const canBeProperty = objectDepth === 1 && arrayDepth === 0 && (lastToken === '{' || lastToken === ',');
      if (canBeProperty && parsed.value === 'tasks') {
        const colonIndex = skipWhitespace(text, parsed.endIndex);
        if (text[colonIndex] === ':') {
          const valueIndex = skipWhitespace(text, colonIndex + 1);
          if (text[valueIndex] === '[') {
            return valueIndex;
          }
        }
      }

      lastToken = 'string';
      index = parsed.endIndex;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '{') {
      objectDepth += 1;
      lastToken = char;
      index += 1;
      continue;
    }

    if (char === '}') {
      objectDepth = Math.max(0, objectDepth - 1);
      lastToken = char;
      index += 1;
      continue;
    }

    if (char === '[') {
      arrayDepth += 1;
      lastToken = char;
      index += 1;
      continue;
    }

    if (char === ']') {
      arrayDepth = Math.max(0, arrayDepth - 1);
      lastToken = char;
      index += 1;
      continue;
    }

    lastToken = char;
    index += 1;
  }

  return null;
}

export function extractTaskEntryLocations(raw: string): RalphTaskSourceLocation[] {
  const arrayStart = findTasksArrayStart(raw);
  if (arrayStart === null) {
    return [];
  }

  const locations: RalphTaskSourceLocation[] = [];
  let index = skipWhitespace(raw, arrayStart + 1);
  let arrayIndex = 0;

  while (index < raw.length && raw[index] !== ']') {
    const position = lineAndColumnAt(raw, index);
    locations.push({
      arrayIndex,
      line: position.line,
      column: position.column
    });

    let objectDepth = 0;
    let arrayDepth = 0;
    let inString = false;
    let escaped = false;

    while (index < raw.length) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        index += 1;
        continue;
      }

      if (char === '"') {
        inString = true;
        index += 1;
        continue;
      }

      if (char === '{') {
        objectDepth += 1;
        index += 1;
        continue;
      }

      if (char === '}') {
        objectDepth = Math.max(0, objectDepth - 1);
        index += 1;
        continue;
      }

      if (char === '[') {
        arrayDepth += 1;
        index += 1;
        continue;
      }

      if (char === ']') {
        if (objectDepth === 0 && arrayDepth === 0) {
          break;
        }

        arrayDepth = Math.max(0, arrayDepth - 1);
        index += 1;
        continue;
      }

      if (char === ',' && objectDepth === 0 && arrayDepth === 0) {
        break;
      }

      index += 1;
    }

    index = skipWhitespace(raw, index);
    if (raw[index] === ',') {
      arrayIndex += 1;
      index = skipWhitespace(raw, index + 1);
      continue;
    }

    break;
  }

  return locations;
}
