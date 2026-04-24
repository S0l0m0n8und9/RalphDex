export const TRANSCRIPT_MAX_BYTES = 512 * 1024; // 512 KiB
export const TRANSCRIPT_HEAD_PRESERVE_BYTES = 24 * 1024; // 24 KiB

const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi;
const KEY_VALUE_SECRET_PATTERN = /((?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|secret|password)\s*[:=]\s*)(['"]?)[^\s'",;]+(\2)/gi;
const WELL_KNOWN_KEY_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{12,}|AIza[0-9A-Za-z\-_]{20,})\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const LONG_TOKEN_WITH_DELIMITER_PATTERN = /\b(?=[A-Za-z0-9._-]{32,}\b)(?=[A-Za-z0-9._-]*[._-])[A-Za-z0-9._-]+\b/g;

function byteLengthUtf8(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function sliceUtf8Head(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) {
    return text;
  }

  return bytes.subarray(0, maxBytes).toString('utf8');
}

function sliceUtf8Tail(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) {
    return text;
  }

  return bytes.subarray(bytes.length - maxBytes).toString('utf8');
}

function buildTruncationNotice(omittedBytes: number): string {
  return `\n\n[... transcript truncated: omitted ${omittedBytes} bytes ...]\n\n`;
}

function truncateTranscript(transcript: string): string {
  const totalBytes = byteLengthUtf8(transcript);
  if (totalBytes <= TRANSCRIPT_MAX_BYTES) {
    return transcript;
  }

  let notice = buildTruncationNotice(totalBytes - TRANSCRIPT_MAX_BYTES);
  const headBudget = Math.min(
    TRANSCRIPT_HEAD_PRESERVE_BYTES,
    Math.max(0, TRANSCRIPT_MAX_BYTES - byteLengthUtf8(notice))
  );
  const head = sliceUtf8Head(transcript, headBudget);

  const tailBudget = Math.max(0, TRANSCRIPT_MAX_BYTES - byteLengthUtf8(head) - byteLengthUtf8(notice));
  let tail = sliceUtf8Tail(transcript, tailBudget);

  const omittedBytes = Math.max(0, totalBytes - byteLengthUtf8(head) - byteLengthUtf8(tail));
  notice = buildTruncationNotice(omittedBytes);
  const adjustedTailBudget = Math.max(0, TRANSCRIPT_MAX_BYTES - byteLengthUtf8(head) - byteLengthUtf8(notice));
  tail = sliceUtf8Tail(transcript, adjustedTailBudget);

  const combined = `${head}${notice}${tail}`;
  if (byteLengthUtf8(combined) <= TRANSCRIPT_MAX_BYTES) {
    return combined;
  }

  return sliceUtf8Tail(combined, TRANSCRIPT_MAX_BYTES);
}

export function redactSensitiveTranscriptData(transcript: string): string {
  return transcript
    .replace(BEARER_TOKEN_PATTERN, '$1[redacted]')
    .replace(KEY_VALUE_SECRET_PATTERN, '$1$2[redacted]$2')
    .replace(WELL_KNOWN_KEY_PATTERN, '[redacted]')
    .replace(JWT_PATTERN, '[redacted]')
    .replace(LONG_TOKEN_WITH_DELIMITER_PATTERN, '[redacted]');
}

export function sanitizeTranscriptForStorage(transcript: string): string {
  return truncateTranscript(redactSensitiveTranscriptData(transcript));
}

