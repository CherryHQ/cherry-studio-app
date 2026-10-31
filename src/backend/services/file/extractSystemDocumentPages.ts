import { Directory, File, Paths } from 'expo-file-system';

import {
  DOCUMENT_EXTRACTION_MAX_PAGES,
  type DocumentExtractionOptions,
  type DocumentExtractionUnit,
} from '@/shared/contracts/documentExtraction';
import type { AppLanguage } from '@/shared/utils/languages';

import {
  extractImageText,
  readPdfPages,
  renderPdfPage,
} from '../../../../modules/pdf-text-extractor';
import type { FileTextResult } from './fileTextExtraction';

/** Explicit page reads only. Ordinary attachment reading retains its existing native fast path. */
export async function extractSystemDocumentPages(
  uri: string,
  kind: 'pdf' | 'image',
  options: DocumentExtractionOptions,
  language: AppLanguage,
  signal: AbortSignal,
  onProgress: (completedPages: number, totalPages: number) => void,
): Promise<FileTextResult> {
  const inspection =
    kind === 'pdf'
      ? await readPdfPages(
          uri,
          options.pages ? Math.max(...options.pages) : DOCUMENT_EXTRACTION_MAX_PAGES,
          signal,
          options.pages,
        )
      : {
          pages: [{ page: 1, text: '', needsOcr: true, isTruncated: false }],
          totalPages: 1,
          isTruncated: false,
        };
  const selected = inspection.pages;
  const folder = new Directory(Paths.cache, 'DocumentPages');
  const pageFile = new File(folder, 'page.jpg');
  const pages: DocumentExtractionUnit[] = [];
  let ocrError = false;
  let ocrUnavailable = false;
  let characters = 0;
  try {
    for (const inspected of selected) {
      const page = inspected.page;
      signal.throwIfAborted();
      const unit: DocumentExtractionUnit = {
        location: kind === 'pdf' ? { page } : {},
        engine: 'pdf-text',
        status: inspected.isTruncated ? 'truncated' : 'complete',
        text: inspected.text,
        tables: [],
        formulas: [],
      };
      if (inspected.needsOcr) {
        onProgress(pages.length, selected.length);
        folder.create({ idempotent: true, intermediates: true });
        if (pageFile.exists) pageFile.delete();
        const hasContent =
          kind === 'image' || (await renderPdfPage(uri, page - 1, pageFile.uri, signal));
        if (hasContent) {
          const result = await extractImageText(
            kind === 'pdf' ? pageFile.uri : uri,
            { language },
            { signal },
          );
          unit.engine = 'system';
          unit.text = result.text;
          unit.status =
            result.ocrError || result.extractionError || result.ocrUnavailable
              ? 'unavailable'
              : result.isTruncated
                ? 'truncated'
                : result.text.trim()
                  ? 'complete'
                  : 'unrecognized';
          ocrError ||= result.ocrError || result.extractionError;
          ocrUnavailable ||= result.ocrUnavailable;
        }
        onProgress(pages.length + 1, selected.length);
      }
      const remaining = Math.max(0, 1_000_000 - characters - (pages.length ? 2 : 0));
      if (unit.text.length > remaining) {
        let end = remaining;
        if (end > 0 && /[\uD800-\uDBFF]/.test(unit.text[end - 1]!)) end--;
        unit.text = unit.text.slice(0, end);
        unit.status = 'truncated';
      }
      characters += unit.text.length + (pages.length ? 2 : 0);
      pages.push(unit);
      if (pageFile.exists) pageFile.delete();
      if (characters >= 999_998) {
        unit.status = 'truncated';
        break;
      }
    }
    return {
      text: pages.map((page) => page.text).join('\n\n'),
      pages,
      totalPages: inspection.totalPages,
      extractedPages: pages.length,
      isTruncated: pages.some((page) => page.status === 'truncated'),
      extractionError: ocrError,
      ocrError,
      ocrUnavailable,
      unrecognizedPages: pages
        .filter((page) => page.status === 'unrecognized')
        .map((page) => page.location.page ?? 1),
    };
  } finally {
    if (pageFile.exists) pageFile.delete();
  }
}
