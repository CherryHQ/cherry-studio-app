const DEFAULT_REPLY_READ_ALOUD_CHUNK_LENGTH = 3000;
const NATIVE_SPEECH_LENGTH_BUFFER = 100;
const MIN_REPLY_READ_ALOUD_CHUNK_LENGTH = 2;

export function resolveReplyReadAloudChunkLength(maxSpeechInputLength: number | undefined): number {
  if (!Number.isFinite(maxSpeechInputLength)) {
    return DEFAULT_REPLY_READ_ALOUD_CHUNK_LENGTH;
  }

  return Math.max(
    MIN_REPLY_READ_ALOUD_CHUNK_LENGTH,
    Math.min(
      DEFAULT_REPLY_READ_ALOUD_CHUNK_LENGTH,
      Math.floor(maxSpeechInputLength as number) - NATIVE_SPEECH_LENGTH_BUFFER,
    ),
  );
}

function findLastBoundary(text: string, pattern: RegExp): number {
  let boundary = 0;

  for (const match of text.matchAll(pattern)) {
    boundary = (match.index ?? 0) + match[0].length;
  }

  return boundary;
}

function findHardBoundary(text: string, maxLength: number): number {
  let boundary = 0;

  for (const codePoint of text) {
    if (boundary + codePoint.length > maxLength) {
      return boundary || codePoint.length;
    }
    boundary += codePoint.length;
  }

  return boundary;
}

function findPreferredBoundary(text: string, maxLength: number): number {
  const candidate = text.slice(0, maxLength);
  const paragraphBoundary = findLastBoundary(candidate, /\n[^\S\n]*\n+/g);
  if (paragraphBoundary > 0) {
    return paragraphBoundary;
  }

  const sentenceBoundary = findLastBoundary(
    candidate,
    /[.!?。！？；;…]+(?:["'”’」』】）)]*)[^\S\r\n]*/g,
  );
  if (sentenceBoundary > 0) {
    return sentenceBoundary;
  }

  const whitespaceBoundary = findLastBoundary(candidate, /\s+/g);
  if (whitespaceBoundary > 0) {
    return whitespaceBoundary;
  }

  return findHardBoundary(text, maxLength);
}

export function splitReplyReadAloudText(text: string, maxLength: number): string[] {
  const remainingText = text.trim();
  if (!remainingText) {
    return [];
  }

  const safeMaxLength = Number.isFinite(maxLength)
    ? Math.max(MIN_REPLY_READ_ALOUD_CHUNK_LENGTH, Math.floor(maxLength))
    : DEFAULT_REPLY_READ_ALOUD_CHUNK_LENGTH;
  const chunks: string[] = [];
  let remaining = remainingText;

  while (remaining.length > safeMaxLength) {
    const boundary = findPreferredBoundary(remaining, safeMaxLength);
    chunks.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary);
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
