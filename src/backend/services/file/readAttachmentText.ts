import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';

import { DocumentTextError, type ExtractedDocumentText } from './documentText';
import { decodeManagedUtf8, ManagedTextError } from './utf8Text';

export type AttachmentContentReader = {
  readBytes(file: FileAttachmentFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  readDocumentText?(
    file: FileAttachmentFact,
    signal: AbortSignal,
  ): Promise<ExtractedDocumentText | undefined>;
};

/** Reads only resolved managed files. The caller must prove access before invoking this reader. */
export async function readAttachmentText(
  file: FileAttachmentFact,
  reader: AttachmentContentReader,
  signal: AbortSignal,
  maxTextBytes = MAX_TEXT_ATTACHMENT_BYTES,
): Promise<{ text: string; sourceTruncated: boolean }> {
  const isDocument = !!documentFileTypeFromMediaType(file.mediaType);
  const limit = isDocument ? MAX_DOCUMENT_ATTACHMENT_BYTES : maxTextBytes;
  const fail = (code: ConstructorParameters<typeof FileAttachmentError>[0]['code']): never => {
    throw new FileAttachmentError({
      code,
      fileEntryId: file.fileEntryId,
      name: file.name,
      ...(code === 'file-bytes' ? { limit } : {}),
    });
  };
  signal.throwIfAborted();
  if (file.size > limit) fail('file-bytes');
  try {
    if (isDocument) {
      const extracted = await reader.readDocumentText?.(file, signal);
      signal.throwIfAborted();
      if (!extracted) return fail('unavailable');
      if (!extracted.text.trim()) return fail('document-empty');
      return { text: extracted.text, sourceTruncated: extracted.truncated };
    }
    const bytes = await reader.readBytes(file, signal);
    signal.throwIfAborted();
    if (!bytes) return fail('unavailable');
    return { text: decodeManagedUtf8(bytes, limit).text, sourceTruncated: false };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof FileAttachmentError) throw error;
    if (error instanceof ManagedTextError) return fail(error.failure);
    if (error instanceof DocumentTextError) {
      return fail(
        error.failure === 'file-bytes'
          ? 'file-bytes'
          : error.failure === 'empty'
            ? 'document-empty'
            : 'document-invalid',
      );
    }
    return fail('unavailable');
  }
}
