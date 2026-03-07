import { createHash } from 'node:crypto';

export function hashText(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
