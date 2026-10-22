import { File } from 'expo-file-system';

import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import type { PdfOcrState } from '@/shared/contracts/file';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from '@/shared/utils/languages';

import { extractPdfText, type ExtractResult } from '../../../../modules/pdf-text-extractor';
import { pdfTextCacheFile, readPdfTextCache, writePdfTextCache } from './pdfTextCache';

type PendingExtraction = {
  controller: AbortController;
  consumers: number;
  result: Promise<ExtractResult>;
};
type OcrObserver = (state: PdfOcrState | undefined) => void;
const pending = new Map<string, PendingExtraction>();
const slots = createConcurrencySlots(1);
let extracting = 0;
// Keyed by file entry: the transcript tile and tool row of that file show its own work.
const states = new Map<string, PdfOcrState>();
const observers = new Map<string, Set<OcrObserver>>();
let appLanguage = (): AppLanguage => DEFAULT_APP_LANGUAGE;

/** Composition supplies the shared language resolver; recognition languages follow it. */
export function configurePdfOcrLanguage(resolve: () => AppLanguage): void {
  appLanguage = resolve;
}

export function observePdfOcr(fileEntryId: string, observer: OcrObserver): () => void {
  let set = observers.get(fileEntryId);
  if (!set) observers.set(fileEntryId, (set = new Set()));
  set.add(observer);
  observer(states.get(fileEntryId));
  return () => {
    set.delete(observer);
    if (set.size === 0 && observers.get(fileEntryId) === set) observers.delete(fileEntryId);
  };
}

function setState(fileEntryId: string, state: PdfOcrState | undefined) {
  if (state) states.set(fileEntryId, state);
  else states.delete(fileEntryId);
  for (const observer of observers.get(fileEntryId) ?? []) observer(state);
}

async function extract(
  source: File,
  cache: File,
  language: AppLanguage,
  signal: AbortSignal,
): Promise<ExtractResult> {
  const cached = await readPdfTextCache(cache);
  signal.throwIfAborted();
  if (cached) return cached;
  // Managed filenames are the immutable entry ID plus an extension.
  const fileEntryId = source.name.split('.')[0]!;
  if (extracting > 0) setState(fileEntryId, { status: 'queued' });
  extracting += 1;
  try {
    const release = await slots.acquire(signal);
    try {
      const result = await extractPdfText(
        source.uri,
        { maxPages: MAX_PDF_ATTACHMENT_PAGES, language },
        {
          signal,
          onProgress: ({ phase, completedPages, totalPages }) => {
            if (phase === 'ocr')
              setState(fileEntryId, { status: 'recognizing', completedPages, totalPages });
          },
        },
      );
      signal.throwIfAborted();
      // Do not recreate a deleted file's derived content after an in-flight read.
      if (source.exists) writePdfTextCache(cache, result);
      return result;
    } finally {
      release();
    }
  } finally {
    extracting -= 1;
    setState(fileEntryId, undefined);
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
