import {
  FileAttachmentError,
  type FileAttachmentFact,
  type FileAttachmentReport,
  type FileAttachmentTarget,
} from '@/shared/contracts/fileAttachment';
import {
  fileAttachmentMode,
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_CHARACTERS,
  MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS,
  validateFileAttachments,
} from '@/shared/utils/fileAttachmentPolicy';

import { type AttachmentContentReader, readAttachmentText } from './readAttachmentText';
import { takeCodePoints } from './utf8Text';

export type TextAttachmentLimits = {
  maxBytesPerFile: number;
  maxCharactersPerFile: number;
  maxTotalCharacters: number;
};

export type PreparedFileAttachment = {
  file: FileAttachmentFact;
  report: FileAttachmentReport;
  /** Untrusted user content; the caller owns the runtime envelope. Images have no text. */
  text?: string;
};

export type PrepareFileAttachmentsInput = AttachmentContentReader & {
  availableFiles: ReadonlyMap<string, FileAttachmentFact>;
  currentFileEntryIds: readonly string[];
  historicalFileEntryIds?: readonly string[];
  limits?: TextAttachmentLimits;
  signal: AbortSignal;
  target: FileAttachmentTarget;
};

/**
 * One send-time workflow for chat and painting: canonical facts, request admission,
 * bounded content reads, then reports. Current files take priority; a historical file
 * may be omitted when unavailable. Repeated references consume budget per occurrence.
 */
export async function prepareFileAttachments(
  input: PrepareFileAttachmentsInput,
): Promise<ReadonlyMap<string, PreparedFileAttachment>> {
  input.signal.throwIfAborted();
  const currentFiles = input.currentFileEntryIds.map((id) => {
    const file = input.availableFiles.get(id);
    if (!file) throw new FileAttachmentError({ code: 'unavailable' });
    return file;
  });
  validateFileAttachments(currentFiles, input.target);
  const historicalIds = (input.historicalFileEntryIds ?? []).filter((id) => {
    const file = input.availableFiles.get(id);
    const mode = file && fileAttachmentMode(file);
    return mode && (mode !== 'image' || input.target.acceptsImages);
  });
  // Historical image occurrences share the request ceiling. Text files have their own budget below.
  const historicalImages = historicalIds.flatMap((id) => {
    const file = input.availableFiles.get(id)!;
    return fileAttachmentMode(file) === 'image' ? [file] : [];
  });
  validateFileAttachments([...currentFiles, ...historicalImages], input.target);
  const occurrences = [...input.currentFileEntryIds, ...historicalIds];
  const counts = new Map<string, number>();
  for (const id of occurrences) counts.set(id, (counts.get(id) ?? 0) + 1);
  const currentIds = new Set(input.currentFileEntryIds);
  const limits = input.limits ?? {
    maxBytesPerFile: MAX_TEXT_ATTACHMENT_BYTES,
    maxCharactersPerFile: MAX_TEXT_ATTACHMENT_CHARACTERS,
    maxTotalCharacters: MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS,
  };
  let remainingCharacters = limits.maxTotalCharacters;
  const result = new Map<string, PreparedFileAttachment>();
  for (const [id, count] of counts) {
    const file = input.availableFiles.get(id)!;
    const mode = fileAttachmentMode(file)!;
    if (mode === 'image') {
      result.set(id, { file, report: { mode, sourceTruncated: false, requestTruncated: false } });
      continue;
    }
    const budget = Math.max(
      0,
      Math.min(limits.maxCharactersPerFile, Math.floor(remainingCharacters / count)),
    );
    if (!currentIds.has(id) && budget === 0) continue;
    try {
      const content = await readAttachmentText(file, input, input.signal, limits.maxBytesPerFile);
      const projected = takeCodePoints(content.text, budget);
      result.set(id, {
        file,
        text: projected.value,
        report: {
          mode,
          sourceTruncated: content.sourceTruncated,
          requestTruncated: projected.didTruncate,
          includedCharacters: projected.characters,
        },
      });
      remainingCharacters -= projected.characters * count;
    } catch (error) {
      input.signal.throwIfAborted();
      if (currentIds.has(id)) throw error;
    }
  }
  return result;
}
