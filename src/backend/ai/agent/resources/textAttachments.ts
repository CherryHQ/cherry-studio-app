import {
  DocumentTextError,
  type ExtractedDocumentText,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
} from '@/backend/services/file/documentText';
import { filenameExtension } from '@/shared/data/types/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';

import type { RuntimeTextAttachmentPart } from '../runtime';
import type { ManagedFileFact } from './managedFileResolver';
import { decodeManagedUtf8, ManagedTextError, takeCodePoints } from './managedText';

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
  | 'document-empty'
  | 'document-invalid'
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
  readDocumentText?(
    file: ManagedFileFact,
    signal: AbortSignal,
  ): Promise<ExtractedDocumentText | undefined>;
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
      return fact
        ? isSupportedTextAttachment(fact) || !!documentFileTypeFromMediaType(fact.mediaType)
        : false;
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
    const isDocument = !!documentFileTypeFromMediaType(fact.mediaType);
    const maxBytes = isDocument ? MAX_DOCUMENT_ATTACHMENT_BYTES : limits.maxBytesPerFile;
    if (fact.size > maxBytes) {
      if (isCurrent) {
        throw new TextAttachmentError(fact, 'file-bytes');
      }
      continue;
    }

    let text: string;
    let extractionTruncated = false;
    try {
      if (isDocument) {
        const extracted = await input.readDocumentText?.(fact, input.signal);
        if (!extracted) throw new TextAttachmentError(fact, 'unavailable');
        text = extracted.text;
        extractionTruncated = extracted.truncated;
      } else {
        const bytes = await input.readBytes(fact, input.signal);
        if (!bytes) throw new TextAttachmentError(fact, 'unavailable');
        text = decodeManagedUtf8(bytes, maxBytes).text;
      }
      input.signal.throwIfAborted();
    } catch (error) {
      if (input.signal.aborted) {
        throw input.signal.reason ?? new Error('Managed text resolution was aborted.');
      }
      if (!isCurrent) continue;
      if (error instanceof TextAttachmentError) throw error;
      if (error instanceof ManagedTextError) {
        throw new TextAttachmentError(fact, error.failure);
      }
      if (error instanceof DocumentTextError) {
        throw new TextAttachmentError(
          fact,
          error.failure === 'file-bytes'
            ? 'file-bytes'
            : error.failure === 'empty'
              ? 'document-empty'
              : 'document-invalid',
        );
      }
      throw new TextAttachmentError(fact, 'unavailable');
    }

    const projected = projectTextAttachment(fact, text, characterBudget);
    projected.part.truncated ||= extractionTruncated;
    contents.set(fileEntryId, projected.part);
    remainingCharacters -= projected.includedCharacters * occurrenceCount;
  }

  return contents;
}

function projectTextAttachment(
  file: ManagedFileFact,
  content: string,
  maxCharacters: number,
): ProjectedTextAttachment {
  const truncated = takeCodePoints(content, maxCharacters);
  const part: RuntimeTextAttachmentPart = {
    fileEntryId: file.fileEntryId,
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

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function textAttachmentFailureMessage(
  file: ManagedFileFact,
  failure: TextAttachmentFailure,
): string {
  const name = JSON.stringify(file.name);
  switch (failure) {
    case 'document-empty':
      return `Attachment ${name} has no extractable text. Scanned or image-only documents require OCR.`;
    case 'document-invalid':
      return `Attachment ${name} could not be parsed. It may be damaged, password-protected, or unsupported.`;
    case 'binary-content':
      return `Attachment ${name} contains binary control characters.`;
    case 'file-bytes':
      return `Attachment ${name} exceeds the ${documentFileTypeFromMediaType(file.mediaType) ? MAX_DOCUMENT_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES}-byte file limit.`;
    case 'invalid-utf8':
      return `Attachment ${name} is not valid UTF-8 text.`;
    case 'nul-byte':
      return `Attachment ${name} contains NUL bytes and appears to be binary.`;
    case 'unavailable':
      return `Attachment ${name} could not be read from managed storage.`;
  }
}
