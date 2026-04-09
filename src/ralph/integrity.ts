import { createHash } from 'node:crypto';
import { RalphPromptTarget } from './types';

export function hashText(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function hashJson(value: unknown): string {
  return hashText(stableJson(value));
}

export function createProvenanceId(input: {
  iteration: number;
  promptTarget: RalphPromptTarget;
  createdAt: string;
}): string {
  const compactTimestamp = input.createdAt
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', 'T');
  const targetLabel = input.promptTarget === 'cliExec' ? 'cli' : 'ide';

  return `run-i${String(input.iteration).padStart(3, '0')}-${targetLabel}-${compactTimestamp}`;
}
