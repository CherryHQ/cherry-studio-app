import { File } from 'expo-file-system';

import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';

import { extractPdfText } from '../../../../modules/pdf-text-extractor';
import { readFileUriBytes } from './fileStorage';
import type { ExtractedDocumentText } from './officeText';

export type { ExtractedDocumentText } from './officeText';

export const MAX_DOCUMENT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_PAGES = 100;

export class DocumentTextError extends Error {
  constructor(readonly failure: 'empty' | 'invalid' | 'file-bytes') {
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
  if (!type) throw new DocumentTextError('invalid');
  if (new File(uri).size > MAX_DOCUMENT_ATTACHMENT_BYTES) throw new DocumentTextError('file-bytes');

  let result: ExtractedDocumentText;
  try {
    if (type === 'pdf') {
      const extracted = await extractPdfText(uri, { maxPages: MAX_PDF_ATTACHMENT_PAGES });
      if (extracted.extractionError) throw new DocumentTextError('invalid');
      result = { text: extracted.text.trim(), truncated: extracted.isTruncated };
    } else {
      const bytes = await readFileUriBytes(uri, signal);
      if (bytes.byteLength > MAX_DOCUMENT_ATTACHMENT_BYTES)
        throw new DocumentTextError('file-bytes');
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
