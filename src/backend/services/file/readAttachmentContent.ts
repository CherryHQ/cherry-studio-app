import {
  FileAttachmentError,
  DEFAULT_DOCUMENT_PARSER_MODE,
  type DocumentParserMode,
  type FileAttachmentFact,
} from '@/shared/contracts/fileAttachment';
import { MAX_AUDIO_ATTACHMENT_BYTES } from '@/shared/utils/audioFileTypes';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  documentAttachmentByteLimit,
  fileAttachmentMode,
  MAX_TEXT_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';

import {
  parseDocument,
  type DocumentContentReader,
  type ParsedAnydocDocument,
} from './documentParser';
import { DocumentTextError } from './documentText';
import { decodeManagedUtf8, ManagedTextError } from './utf8Text';

export type AttachmentContentReader = DocumentContentReader & {
  /**
   * Speech-to-text for audio files, supplied by the voice module. Throws FileAttachmentError;
   * absent when nothing can transcribe.
   */
  transcribeAudio?(file: FileAttachmentFact, signal: AbortSignal): Promise<string>;
};

export type ReadAttachmentContent =
  | {
      kind: 'text';
      text: string;
      sourceTruncated: boolean;
      unrecognizedPages?: number[];
      parser?: 'builtin' | 'native-pdf' | 'transcription';
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
  const isAudio = fileAttachmentMode(file) === 'audio';
  const limit = isDocument
    ? documentAttachmentByteLimit(file.mediaType)
    : isAudio
      ? MAX_AUDIO_ATTACHMENT_BYTES
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
    if (isAudio) {
      if (!reader.transcribeAudio) return fail('transcription-unconfigured');
      const text = await reader.transcribeAudio(file, signal);
      signal.throwIfAborted();
      return { kind: 'text', text, sourceTruncated: false, parser: 'transcription' };
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
