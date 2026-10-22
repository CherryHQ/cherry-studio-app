import { File } from 'expo-file-system';

import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import type { PdfOcrEvent } from '@/shared/contracts/file';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from '@/shared/utils/languages';

import { extractPdfText, type ExtractResult } from '../../../../modules/pdf-text-extractor';
import { pdfTextCacheFile, readPdfTextCache, writePdfTextCache } from './pdfTextCache';

type PendingExtraction = {
  controller: AbortController;
  consumers: number;
  result: Promise<ExtractResult>;
};
const pending = new Map<string, PendingExtraction>();
const slots = createConcurrencySlots(1);
const listeners = new Set<(event: PdfOcrEvent) => void>();
let activity: Extract<PdfOcrEvent, { type: 'progress' }> = { type: 'progress', progress: null };
let appLanguage = (): AppLanguage => DEFAULT_APP_LANGUAGE;

/** Composition supplies the shared language resolver; recognition languages follow it. */
export function configurePdfOcrLanguage(resolve: () => AppLanguage): void {
  appLanguage = resolve;
}

export function subscribePdfOcr(listener: (event: PdfOcrEvent) => void): () => void {
  listeners.add(listener);
  listener(activity);
  return () => {
    listeners.delete(listener);
  };
}

function publish(event: PdfOcrEvent) {
  if (event.type === 'progress') activity = event;
  for (const listener of listeners) listener(event);
}

function reportUnrecognizedPages(result: ExtractResult) {
  if (
    !result.extractionError &&
    !result.ocrError &&
    result.text.trim() &&
    result.unrecognizedPages.length > 0
  ) {
    publish({ type: 'unrecognized', pages: result.unrecognizedPages });
  }
}

async function extract(
  source: File,
  cache: File,
  language: AppLanguage,
  signal: AbortSignal,
): Promise<ExtractResult> {
  const cached = await readPdfTextCache(cache);
  signal.throwIfAborted();
  // Later turns re-read history; the user was already warned when the text was first extracted.
  if (cached) return cached;
  const release = await slots.acquire(signal);
  try {
    const result = await extractPdfText(
      source.uri,
      { maxPages: MAX_PDF_ATTACHMENT_PAGES, language },
      {
        signal,
        onProgress: ({ phase, completedPages, totalPages }) => {
          if (phase === 'ocr')
            publish({ type: 'progress', progress: { completedPages, totalPages } });
        },
      },
    );
    signal.throwIfAborted();
    // Do not recreate a deleted file's derived content after an in-flight read.
    if (source.exists) writePdfTextCache(cache, result);
    reportUnrecognizedPages(result);
    return result;
  } finally {
    publish({ type: 'progress', progress: null });
    release();
  }
}

/** Shared across attachment preparation, follow-up turns and file tools. Each consumer owns its abort. */
export function readPdfText(source: File, signal: AbortSignal): Promise<ExtractResult> {
  signal.throwIfAborted();
  const language = appLanguage();
  const cache = pdfTextCacheFile(source, language);
  const key = cache.uri;
  let operation = pending.get(key);
  if (!operation) {
    const controller = new AbortController();
    operation = {
      controller,
      consumers: 0,
      result: extract(source, cache, language, controller.signal),
    };
    pending.set(key, operation);
    const owner = operation;
    const remove = () => {
      if (pending.get(key) === owner) pending.delete(key);
    };
    void operation.result.then(remove, remove);
  }
  const owner = operation;
  owner.consumers += 1;
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal.removeEventListener('abort', abort);
      owner.consumers -= 1;
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      if (owner.consumers === 0) {
        if (pending.get(key) === owner) pending.delete(key);
        owner.controller.abort(signal.reason);
      }
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void owner.result.then(
      (result) => {
        if (finish()) resolve(result);
      },
      (error: unknown) => {
        if (finish()) reject(error);
      },
    );
  });
}
