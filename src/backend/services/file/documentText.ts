import { File } from 'expo-file-system';

import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';
import { documentAttachmentByteLimit } from '@/shared/utils/fileAttachmentPolicy';

import { readFileUriBytes } from './fileStorage';
import { readPdfText } from './fileTextExtraction';
import type { ExtractedDocumentText } from './officeText';

export type { ExtractedDocumentText } from './officeText';

export class DocumentTextError extends Error {
  constructor(readonly failure: 'empty' | 'invalid' | 'file-bytes' | 'ocr' | 'ocr-unsupported') {
    super(failure);
    this.name = 'DocumentTextError';
  }
}

/** The caller supplies only a resolved managed URI; no provider or picker URI is read here. */
export async function readDocumentUriText(
  uri: string,
  mediaType: string,
  signal: AbortSignal,
): Promise<ExtractedDocumentText> {
  signal.throwIfAborted();
  const type = documentFileTypeFromMediaType(mediaType);
  if (!type || (type !== 'pdf' && !isBuiltinOfficeFileType(type)))
    throw new DocumentTextError('invalid');
  const maxBytes = documentAttachmentByteLimit(mediaType);
  const source = new File(uri);
  if (!source.exists) throw new DocumentTextError('invalid');
  if (source.size > maxBytes) throw new DocumentTextError('file-bytes');

  let result: ExtractedDocumentText;
  try {
    if (type === 'pdf') {
      const extracted = await readPdfText(source, signal);
      if (extracted.ocrError) throw new DocumentTextError('ocr');
      if (extracted.extractionError) throw new DocumentTextError('invalid');
      if (extracted.ocrUnavailable && !extracted.text.trim())
        throw new DocumentTextError('ocr-unsupported');
      result = { text: extracted.text.trim(), truncated: extracted.isTruncated };
      if (result.text && extracted.unrecognizedPages.length > 0) {
        result.unrecognizedPages = extracted.unrecognizedPages;
        // Model-facing metadata precedes the body so attachment character budgets retain it.
        result.text = `[PDF extraction notice: pages ${extracted.unrecognizedPages.join(', ')} contain visual content with no recognized text. The text below does not represent those pages; if their content matters, ask the user to attach them as images.]\n\n${result.text}`;
      }
    } else {
      const bytes = await readFileUriBytes(uri, signal);
      if (bytes.byteLength > maxBytes) throw new DocumentTextError('file-bytes');
      const { extractOfficeText } = await import('./officeText');
      signal.throwIfAborted();
      result = extractOfficeText(bytes, type);
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DocumentTextError) throw error;
    throw new DocumentTextError('invalid');
  }
  signal.throwIfAborted();
  if (!result.text.trim()) throw new DocumentTextError('empty');
  return result;
}
