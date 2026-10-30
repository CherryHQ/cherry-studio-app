import { File } from 'expo-file-system';

import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import type { FileOcrState } from '@/shared/contracts/file';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from '@/shared/utils/languages';

import {
  extractImageText,
  extractPdfText,
  type ExtractResult,
} from '../../../../modules/pdf-text-extractor';
import { fileTextCacheFile, readFileTextCache, writeFileTextCache } from './fileTextCache';

type PendingExtraction = {
  controller: AbortController;
  consumers: number;
  result: Promise<ExtractResult>;
};
type OcrObserver = (state: FileOcrState | undefined) => void;
const pending = new Map<string, PendingExtraction>();
const slots = createConcurrencySlots(1);
let extracting = 0;
// Each extraction owns its state, including retries and reads in another language.
const states = new Map<string, Map<AbortSignal, FileOcrState>>();
const observers = new Map<string, Set<OcrObserver>>();
// A running read_file call is observed by its call ID; a workspace path resolves its entry later.
const links = new Map<string, string>();
let appLanguage = (): AppLanguage => DEFAULT_APP_LANGUAGE;

/** Composition supplies the shared language resolver; recognition languages follow it. */
export function configureFileOcrLanguage(resolve: () => AppLanguage): void {
  appLanguage = resolve;
}

export function observeFileOcr(key: string, observer: OcrObserver): () => void {
  let set = observers.get(key);
  if (!set) observers.set(key, (set = new Set()));
  set.add(observer);
  observer(getState(links.get(key) ?? key));
  return () => {
    set.delete(observer);
    if (set.size === 0 && observers.get(key) === set) observers.delete(key);
  };
}

/** Lets observers of `key` follow one file's state until the returned unlink is called. */
export function linkFileOcr(key: string, fileEntryId: string): () => void {
  links.set(key, fileEntryId);
  notify(key, getState(fileEntryId));
  return () => {
    if (links.get(key) !== fileEntryId) return;
    links.delete(key);
    notify(key, undefined);
  };
}

function notify(key: string, state: FileOcrState | undefined) {
  for (const observer of observers.get(key) ?? []) observer(state);
}

function getState(fileEntryId: string): FileOcrState | undefined {
  let queued: FileOcrState | undefined;
  for (const state of states.get(fileEntryId)?.values() ?? []) {
    if (state.status === 'recognizing') return state;
    queued = state;
  }
  return queued;
}

function setState(fileEntryId: string, signal: AbortSignal, state: FileOcrState | undefined) {
  const previous = getState(fileEntryId);
  let extractions = states.get(fileEntryId);
  if (state) {
    if (!extractions) states.set(fileEntryId, (extractions = new Map()));
    extractions.set(signal, state);
  } else if (extractions) {
    extractions.delete(signal);
    if (extractions.size === 0) states.delete(fileEntryId);
  }
  const current = getState(fileEntryId);
  if (current === previous) return;
  notify(fileEntryId, current);
  for (const [key, linked] of links) if (linked === fileEntryId) notify(key, current);
}

async function extract(
  source: File,
  cache: File,
  language: AppLanguage,
  signal: AbortSignal,
  kind: 'pdf' | 'image',
): Promise<ExtractResult> {
  const cached = await readFileTextCache(cache);
  signal.throwIfAborted();
  if (cached) return cached;
  // Managed filenames are the immutable entry ID plus an extension.
  const fileEntryId = source.name.split('.')[0]!;
  const clearState = () => setState(fileEntryId, signal, undefined);
  signal.addEventListener('abort', clearState, { once: true });
  if (extracting > 0) setState(fileEntryId, signal, { status: 'queued' });
  extracting += 1;
  try {
    const release = await slots.acquire(signal);
    try {
      // Waiting for extraction does not establish that this document needs OCR.
      clearState();
      const recognize = kind === 'image' ? extractImageText : extractPdfText;
      const result = await recognize(
        source.uri,
        { maxPages: MAX_PDF_ATTACHMENT_PAGES, language },
        {
          signal,
          onProgress: ({ phase, completedPages, totalPages }) => {
            if (phase === 'ocr')
              setState(fileEntryId, signal, {
                status: 'recognizing',
                kind,
                completedPages,
                totalPages,
              });
          },
        },
      );
      signal.throwIfAborted();
      // Do not recreate a deleted file's derived content after an in-flight read. An empty image
      // is cached so history rebuilds skip it; an unsupported language ran no recognition.
      if (source.exists && !(kind === 'image' && result.ocrUnavailable))
        writeFileTextCache(cache, result);
      return result;
    } finally {
      release();
    }
  } finally {
    extracting -= 1;
    signal.removeEventListener('abort', clearState);
    clearState();
  }
}

/** Shared across attachment preparation, follow-up turns and file tools. Each consumer owns its abort. */
export function readPdfText(source: File, signal: AbortSignal): Promise<ExtractResult> {
  return readText(source, signal, 'pdf');
}

export function readImageText(source: File, signal: AbortSignal): Promise<ExtractResult> {
  return readText(source, signal, 'image');
}

function readText(
  source: File,
  signal: AbortSignal,
  kind: 'pdf' | 'image',
): Promise<ExtractResult> {
  signal.throwIfAborted();
  const language = appLanguage();
  const cache = fileTextCacheFile(source, language, kind);
  const key = cache.uri;
  let operation = pending.get(key);
  if (!operation) {
    const controller = new AbortController();
    operation = {
      controller,
      consumers: 0,
      result: extract(source, cache, language, controller.signal, kind),
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
