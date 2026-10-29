import {
  FileAttachmentError,
  DEFAULT_DOCUMENT_PARSER_MODE,
  type DocumentParserMode,
  type FileAttachmentFact,
} from '@/shared/contracts/fileAttachment';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  documentAttachmentByteLimit,
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import {
  parseDocument,
  type DocumentContentReader,
  type ParsedAnydocDocument,
} from './documentParser';
import { DocumentTextError } from './documentText';
import { ImageTextError } from './imageText';
import type { ExtractedDocumentText } from './officeText';
import { decodeManagedUtf8, ManagedTextError } from './utf8Text';

export type AttachmentContentReader = DocumentContentReader & {
  readImageText(
    file: FileAttachmentFact,
    signal: AbortSignal,
  ): Promise<ExtractedDocumentText | undefined>;
};

export type ReadAttachmentContent =
  | {
      kind: 'text';
      text: string;
      sourceTruncated: boolean;
      unrecognizedPages?: number[];
      parser?: 'builtin' | 'native-pdf' | 'native-image-ocr';
    }
  | { kind: 'document'; parsed: ParsedAnydocDocument };

/** Reads only resolved managed files. The caller must prove access before invoking this reader. */
export async function readAttachmentContent(
  file: FileAttachmentFact,
  reader: AttachmentContentReader,
  signal: AbortSignal,
  maxTextBytes = MAX_TEXT_ATTACHMENT_BYTES,
  documentParserMode: DocumentParserMode = DEFAULT_DOCUMENT_PARSER_MODE,
): Promise<ReadAttachmentContent> {
  const isDocument = !!documentFileTypeFromMediaType(file.mediaType);
  const isImage = isAiSupportedImageMediaType(file.mediaType);
  const limit = isImage
    ? MAX_IMAGE_ATTACHMENT_BYTES
    : isDocument
      ? documentAttachmentByteLimit(file.mediaType)
      : maxTextBytes;
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
    if (isImage) {
      const result = await reader.readImageText(file, signal);
      signal.throwIfAborted();
      if (!result) return fail('unavailable');
      if (!result.text.trim()) return fail('image-ocr-empty');
      return {
        kind: 'text',
        text: result.text,
        sourceTruncated: result.truncated,
        parser: 'native-image-ocr',
      };
    }
    if (isDocument) {
      const parsed = await parseDocument(file, reader, documentParserMode, signal);
      if (parsed.parser === 'anydoc') return { kind: 'document', parsed };
      return {
        kind: 'text',
        text: parsed.output.text,
        sourceTruncated: parsed.output.truncated,
        ...(parsed.output.unrecognizedPages
          ? { unrecognizedPages: parsed.output.unrecognizedPages }
          : {}),
        parser: parsed.parser,
      };
    }
    const bytes = await reader.readBytes(file, signal);
    signal.throwIfAborted();
    if (!bytes) return fail('unavailable');
    return { kind: 'text', text: decodeManagedUtf8(bytes, limit).text, sourceTruncated: false };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof FileAttachmentError) throw error;
    if (error instanceof ImageTextError) {
      const codes = {
        empty: 'image-ocr-empty',
        failed: 'image-ocr-failed',
        unsupported: 'image-ocr-unsupported',
        'file-bytes': 'file-bytes',
        unavailable: 'unavailable',
      } as const;
      return fail(codes[error.failure]);
    }
    if (error instanceof ManagedTextError) return fail(error.failure);
    if (error instanceof DocumentTextError) {
      return fail(
        error.failure === 'file-bytes'
          ? 'file-bytes'
          : error.failure === 'empty'
            ? 'document-empty'
            : error.failure === 'ocr'
              ? 'document-ocr-failed'
              : error.failure === 'ocr-unsupported'
                ? 'document-ocr-unsupported'
                : 'document-invalid',
      );
    }
    return fail('unavailable');
  }
}
