import { filenameExtension } from '@/shared/data/types/file';

import type { RuntimeTextAttachmentPart } from '../runtime';
import type { ManagedFileFact } from './managedFileResolver';

export const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_CHARACTERS = 200_000;
export const MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS = 400_000;

const JSON_EXTENSIONS = new Set(['json', 'jsonc', 'jsonl', 'ndjson']);
const JAVASCRIPT_EXTENSIONS = new Set(['cjs', 'js', 'jsx', 'mjs']);
const TYPESCRIPT_EXTENSIONS = new Set(['cts', 'mts', 'ts', 'tsx']);

/** Explicit application/* types whose stored filename must also match the listed extensions. */
export const APPLICATION_TEXT_ATTACHMENT_EXTENSIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  ['application/javascript', JAVASCRIPT_EXTENSIONS],
  ['application/json', JSON_EXTENSIONS],
  ['application/ld+json', JSON_EXTENSIONS],
  ['application/manifest+json', JSON_EXTENSIONS],
  ['application/sql', new Set(['sql'])],
  ['application/toml', new Set(['toml'])],
  ['application/typescript', TYPESCRIPT_EXTENSIONS],
  ['application/x-httpd-php', new Set(['php'])],
  ['application/x-javascript', JAVASCRIPT_EXTENSIONS],
  ['application/x-ndjson', new Set(['jsonl', 'ndjson'])],
  ['application/x-sh', new Set(['bash', 'sh', 'zsh'])],
  ['application/x-shellscript', new Set(['bash', 'sh', 'zsh'])],
  ['application/x-typescript', TYPESCRIPT_EXTENSIONS],
  ['application/x-yaml', new Set(['yaml', 'yml'])],
  ['application/xhtml+xml', new Set(['html', 'xhtml'])],
  ['application/xml', new Set(['xml', 'xsl', 'xslt'])],
  ['application/yaml', new Set(['yaml', 'yml'])],
]);

export type TextAttachmentLimits = {
  maxBytesPerFile: number;
  maxCharactersPerFile: number;
  maxTotalCharacters: number;
};

export const DEFAULT_TEXT_ATTACHMENT_LIMITS: TextAttachmentLimits = {
  maxBytesPerFile: MAX_TEXT_ATTACHMENT_BYTES,
  maxCharactersPerFile: MAX_TEXT_ATTACHMENT_CHARACTERS,
  maxTotalCharacters: MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS,
};

export type TextAttachmentFailure =
  | 'binary-content'
  | 'file-bytes'
  | 'invalid-utf8'
  | 'nul-byte'
  | 'unavailable';

export class TextAttachmentError extends Error {
  constructor(
    file: ManagedFileFact,
    readonly failure: TextAttachmentFailure,
  ) {
    super(textAttachmentFailureMessage(file, failure));
    this.name = 'TextAttachmentError';
  }
}

type ResolveTextAttachmentsInput = {
  availableFiles: ReadonlyMap<string, ManagedFileFact>;
  currentFileEntryIds: readonly string[];
  historicalFileEntryIds: readonly string[];
  limits?: TextAttachmentLimits;
  readBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  signal: AbortSignal;
};

type ProjectedTextAttachment = {
  includedCharacters: number;
  part: RuntimeTextAttachmentPart;
};

export function isSupportedTextAttachment(file: Pick<ManagedFileFact, 'mediaType' | 'name'>) {
  const mediaType = normalizeMediaType(file.mediaType);
  if (mediaType.startsWith('text/')) {
    return true;
  }

  const extension = filenameExtension(file.name);
  if (!extension) {
    return false;
  }
  const allowedExtensions =
    APPLICATION_TEXT_ATTACHMENT_EXTENSIONS.get(mediaType) ??
    (mediaType.startsWith('application/') && mediaType.endsWith('+json')
      ? JSON_EXTENSIONS
      : undefined);
  return allowedExtensions?.has(extension) ?? false;
}

/**
 * Resolve current and available historical text bodies before reservation. Current files take
 * budget priority; repeated references are charged once per model-visible occurrence.
 */
export async function resolveManagedTextAttachments(
  input: ResolveTextAttachmentsInput,
): Promise<ReadonlyMap<string, RuntimeTextAttachmentPart>> {
  const limits = input.limits ?? DEFAULT_TEXT_ATTACHMENT_LIMITS;
  const currentIds = new Set(input.currentFileEntryIds);
  const occurrences = [...input.currentFileEntryIds, ...input.historicalFileEntryIds].filter(
    (fileEntryId) => {
      const fact = input.availableFiles.get(fileEntryId);
      return fact ? isSupportedTextAttachment(fact) : false;
    },
  );
  const occurrenceCounts = new Map<string, number>();
  for (const fileEntryId of occurrences) {
    occurrenceCounts.set(fileEntryId, (occurrenceCounts.get(fileEntryId) ?? 0) + 1);
  }

  const orderedIds = [...new Set(occurrences)];
  const contents = new Map<string, RuntimeTextAttachmentPart>();
  let remainingCharacters = limits.maxTotalCharacters;

  for (const fileEntryId of orderedIds) {
    const fact = input.availableFiles.get(fileEntryId);
    if (!fact) {
      continue;
    }
    const isCurrent = currentIds.has(fileEntryId);
    const occurrenceCount = occurrenceCounts.get(fileEntryId) ?? 1;
    const characterBudget = Math.max(
      0,
      Math.min(limits.maxCharactersPerFile, Math.floor(remainingCharacters / occurrenceCount)),
    );
    if (!isCurrent && characterBudget === 0) {
      continue;
    }
    if (fact.size > limits.maxBytesPerFile) {
      if (isCurrent) {
        throw new TextAttachmentError(fact, 'file-bytes');
      }
      continue;
    }

    let bytes: Uint8Array | undefined;
    try {
      bytes = await input.readBytes(fact, input.signal);
      input.signal.throwIfAborted();
    } catch {
      if (input.signal.aborted) {
        throw input.signal.reason ?? new Error('Managed text resolution was aborted.');
      }
      if (isCurrent) {
        throw new TextAttachmentError(fact, 'unavailable');
      }
      continue;
    }
    if (!bytes) {
      if (isCurrent) {
        throw new TextAttachmentError(fact, 'unavailable');
      }
      continue;
    }

    let text: string;
    try {
      text = decodeManagedUtf8(bytes, limits.maxBytesPerFile, fact);
    } catch (error) {
      if (isCurrent) {
        throw error;
      }
      continue;
    }

    const projected = projectTextAttachment(fact, text, characterBudget);
    contents.set(fileEntryId, projected.part);
    remainingCharacters -= projected.includedCharacters * occurrenceCount;
  }

  return contents;
}

function decodeManagedUtf8(bytes: Uint8Array, maxBytes: number, file: ManagedFileFact): string {
  if (bytes.byteLength > maxBytes) {
    throw new TextAttachmentError(file, 'file-bytes');
  }
  if (bytes.includes(0)) {
    throw new TextAttachmentError(file, 'nul-byte');
  }

  const offset = hasUtf8Bom(bytes) ? 3 : 0;
  const text = decodeUtf8Strict(bytes.subarray(offset));
  if (text === null) {
    throw new TextAttachmentError(file, 'invalid-utf8');
  }
  if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new TextAttachmentError(file, 'binary-content');
  }
  return text;
}

function projectTextAttachment(
  file: ManagedFileFact,
  content: string,
  maxCharacters: number,
): ProjectedTextAttachment {
  const truncated = takeCodePoints(content, maxCharacters);
  const part: RuntimeTextAttachmentPart = {
    type: 'text-attachment',
    mediaType: file.mediaType,
    name: file.name,
    text: truncated.value,
    truncated: truncated.didTruncate,
    trust: 'untrusted-user-content',
  };
  return {
    includedCharacters: truncated.characters,
    part,
  };
}

function takeCodePoints(
  value: string,
  maxCharacters: number,
): { characters: number; didTruncate: boolean; value: string } {
  let characters = 0;
  let end = 0;
  for (const character of value) {
    if (characters === maxCharacters) {
      break;
    }
    end += character.length;
    characters += 1;
  }
  return { characters, didTruncate: end < value.length, value: value.slice(0, end) };
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/** RN-safe strict decoder: rejects overlong, surrogate, truncated, and out-of-range sequences. */
function decodeUtf8Strict(bytes: Uint8Array): string | null {
  const codePoints: number[] = [];
  const chunks: string[] = [];
  const flush = () => {
    if (codePoints.length > 0) {
      chunks.push(String.fromCodePoint(...codePoints));
      codePoints.length = 0;
    }
  };

  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first === undefined) {
      return null;
    }

    let codePoint: number;
    let width: number;
    if (first <= 0x7f) {
      codePoint = first;
      width = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      const second = bytes[index + 1];
      if (!isContinuationByte(second)) return null;
      codePoint = ((first & 0x1f) << 6) | (second & 0x3f);
      width = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      if (!isContinuationByte(second) || !isContinuationByte(third)) return null;
      if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0)) return null;
      codePoint = ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
      width = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      const fourth = bytes[index + 3];
      if (
        !isContinuationByte(second) ||
        !isContinuationByte(third) ||
        !isContinuationByte(fourth)
      ) {
        return null;
      }
      if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second >= 0x90)) return null;
      codePoint =
        ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      width = 4;
    } else {
      return null;
    }

    codePoints.push(codePoint);
    if (codePoints.length === 4_096) flush();
    index += width;
  }

  flush();
  return chunks.join('');
}

function isContinuationByte(value: number | undefined): value is number {
  return value !== undefined && value >= 0x80 && value <= 0xbf;
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function textAttachmentFailureMessage(
  file: ManagedFileFact,
  failure: TextAttachmentFailure,
): string {
  const name = JSON.stringify(file.name);
  switch (failure) {
    case 'binary-content':
      return `Attachment ${name} contains binary control characters.`;
    case 'file-bytes':
      return `Attachment ${name} exceeds the ${MAX_TEXT_ATTACHMENT_BYTES}-byte text file limit.`;
    case 'invalid-utf8':
      return `Attachment ${name} is not valid UTF-8 text.`;
    case 'nul-byte':
      return `Attachment ${name} contains NUL bytes and appears to be binary.`;
    case 'unavailable':
      return `Attachment ${name} could not be read from managed storage.`;
  }
}
