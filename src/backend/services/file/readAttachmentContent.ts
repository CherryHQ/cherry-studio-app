import {
  FileAttachmentError,
  DEFAULT_DOCUMENT_PARSER_MODE,
  type DocumentParserMode,
  type FileAttachmentFact,
} from '@/shared/contracts/fileAttachment';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';

import {
  parseDocument,
  type DocumentContentReader,
  type ParsedAnydocDocument,
} from './documentParser';
import { DocumentTextError } from './documentText';
import { decodeManagedUtf8, ManagedTextError } from './utf8Text';

export type AttachmentContentReader = DocumentContentReader;

export type ReadAttachmentContent =
  | { kind: 'text'; text: string; sourceTruncated: boolean; parser?: 'builtin' | 'native-pdf' }
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
      const parsed = await parseDocument(file, reader, documentParserMode, signal);
      if (parsed.parser === 'anydoc') return { kind: 'document', parsed };
      return {
        kind: 'text',
        text: parsed.output.text,
        sourceTruncated: parsed.output.truncated,
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
