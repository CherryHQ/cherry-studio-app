import type { ConvertResult } from 'react-native-anydoc';
import * as z from 'zod';

import {
  FileAttachmentError,
  type DocumentJsonValue,
  type DocumentParserMode,
  type FileAttachmentFact,
} from '@/shared/contracts/fileAttachment';
import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';
import { MAX_DOCUMENT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { ANYDOC_PARSER_VERSION, parseAnydocDocument } from './anydocParser';
import type { ExtractedDocumentText } from './documentText';

export type DocumentContentReader = {
  readBytes(file: FileAttachmentFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  readDocumentText?(
    file: FileAttachmentFact,
    signal: AbortSignal,
  ): Promise<ExtractedDocumentText | undefined>;
};

export type ParsedDocument =
  | { parser: 'builtin' | 'native-pdf'; output: ExtractedDocumentText }
  | { parser: 'anydoc'; parserVersion: string; output: ConvertResult };

export type ParsedAnydocDocument = Extract<ParsedDocument, { parser: 'anydoc' }> & {
  output: Extract<ConvertResult, { status: 'ok' }> & { ir: DocumentJsonValue };
};

const jsonSchema = z.json();

/** Parser selection belongs to the shared reader; callers supply a frozen turn setting. */
export async function parseDocument(
  file: FileAttachmentFact,
  reader: DocumentContentReader,
  mode: DocumentParserMode,
  signal: AbortSignal,
): Promise<Exclude<ParsedDocument, { parser: 'anydoc' }> | ParsedAnydocDocument> {
  const issue = { fileEntryId: file.fileEntryId, name: file.name };
  const type = documentFileTypeFromMediaType(file.mediaType);
  if (!type || (mode === 'builtin' && type !== 'pdf' && !isBuiltinOfficeFileType(type))) {
    throw new FileAttachmentError({ ...issue, code: 'parser-unsupported' });
  }
  if (type === 'pdf' || mode === 'builtin') {
    const output = await reader.readDocumentText?.(file, signal);
    signal.throwIfAborted();
    if (!output) throw new FileAttachmentError({ ...issue, code: 'unavailable' });
    if (!output.text.trim()) throw new FileAttachmentError({ ...issue, code: 'document-empty' });
    return { parser: type === 'pdf' ? 'native-pdf' : 'builtin', output };
  }
  const bytes = await reader.readBytes(file, signal);
  signal.throwIfAborted();
  if (!bytes) throw new FileAttachmentError({ ...issue, code: 'unavailable' });
  if (bytes.byteLength > MAX_DOCUMENT_ATTACHMENT_BYTES) {
    throw new FileAttachmentError({
      ...issue,
      code: 'file-bytes',
      limit: MAX_DOCUMENT_ATTACHMENT_BYTES,
    });
  }
  let output: ConvertResult;
  try {
    output = await parseAnydocDocument(bytes);
  } catch {
    signal.throwIfAborted();
    // Native errors may contain private paths. Never expose them as user-facing diagnostics.
    throw new FileAttachmentError({ ...issue, code: 'parser-unavailable' });
  }
  signal.throwIfAborted();
  const parsed: ParsedDocument = { parser: 'anydoc', parserVersion: ANYDOC_PARSER_VERSION, output };
  if (output.status === 'fallback') {
    // Keep the original failure for backend inspection; do not run another engine or log content.
    throw new FileAttachmentError({ ...issue, code: 'document-invalid' }, { cause: parsed });
  }
  if (!jsonSchema.safeParse(output.ir).success) {
    throw new FileAttachmentError({ ...issue, code: 'document-invalid' });
  }
  // Validation does not replace the community object or strip unknown fields.
  return parsed as ParsedAnydocDocument;
}
