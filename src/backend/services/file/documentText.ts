import { File } from 'expo-file-system';

import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';
import {
  documentAttachmentByteLimit,
  MAX_PDF_ATTACHMENT_PAGES,
} from '@/shared/utils/fileAttachmentPolicy';

import { extractPdfText } from '../../../../modules/pdf-text-extractor';
import { readFileUriBytes } from './fileStorage';
import type { ExtractedDocumentText } from './officeText';

export type { ExtractedDocumentText } from './officeText';

let activePdfOcrCount = 0;
const pdfOcrListeners = new Set<(active: boolean) => void>();

/** App-wide activity only: no document paths or recognized content leave this owner. */
export function subscribePdfOcr(listener: (active: boolean) => void): () => void {
  pdfOcrListeners.add(listener);
  listener(activePdfOcrCount > 0);
  return () => pdfOcrListeners.delete(listener);
}

function updatePdfOcrCount(delta: number): void {
  const wasActive = activePdfOcrCount > 0;
  activePdfOcrCount += delta;
  const isActive = activePdfOcrCount > 0;
  if (wasActive !== isActive) {
    for (const listener of pdfOcrListeners) listener(isActive);
  }
}

export class DocumentTextError extends Error {
  constructor(readonly failure: 'empty' | 'invalid' | 'file-bytes' | 'ocr') {
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
  if (new File(uri).size > maxBytes) throw new DocumentTextError('file-bytes');

  let result: ExtractedDocumentText;
  let isRecognizing = false;
  try {
    if (type === 'pdf') {
      const extracted = await extractPdfText(
        uri,
        { maxPages: MAX_PDF_ATTACHMENT_PAGES },
        {
          signal,
          onProgress: ({ phase }) => {
            if (phase === 'ocr' && !isRecognizing) {
              isRecognizing = true;
              updatePdfOcrCount(1);
            }
          },
        },
      );
      if (extracted.ocrError) throw new DocumentTextError('ocr');
      if (extracted.extractionError) throw new DocumentTextError('invalid');
      result = { text: extracted.text.trim(), truncated: extracted.isTruncated };
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
  } finally {
    if (isRecognizing) updatePdfOcrCount(-1);
  }
  signal.throwIfAborted();
  if (!result.text.trim()) throw new DocumentTextError('empty');
  return result;
}
