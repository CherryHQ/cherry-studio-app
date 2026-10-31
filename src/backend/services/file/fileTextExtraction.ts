import { File } from 'expo-file-system';

import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import {
  DocumentExtractionError,
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentExtractionOptions,
  type DocumentExtractionUnit,
} from '@/shared/contracts/documentExtraction';
import type { FileOcrState } from '@/shared/contracts/file';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from '@/shared/utils/languages';
import { sha256HexOfText } from '@/shared/utils/sha256';

import {
  extractImageText,
  extractPdfText,
  type ExtractResult,
} from '../../../../modules/pdf-text-extractor';
import { extractSystemDocumentPages } from './extractSystemDocumentPages';
import { fileTextCacheFile, readFileTextCache, writeFileTextCache } from './fileTextCache';

export type FileTextResult = ExtractResult & { pages?: DocumentExtractionUnit[] };

type PendingExtraction = {
  controller: AbortController;
  consumers: number;
  result: Promise<FileTextResult>;
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
export type FileTextEngine = {
  cacheKey: string;
  extract(
    uri: string,
    kind: 'pdf' | 'image',
    signal: AbortSignal,
    onProgress: (completedPages: number, totalPages: number) => void,
    options?: DocumentExtractionOptions,
  ): Promise<FileTextResult>;
};
let resolveEngine: () => Promise<FileTextEngine | undefined> = async () => undefined;

export function configureFileOcrEngine(resolve: typeof resolveEngine): void {
  resolveEngine = resolve;
}

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
  engine?: FileTextEngine,
  options?: DocumentExtractionOptions,
  cacheSource = source,
): Promise<FileTextResult> {
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
      const reportProgress = (completedPages: number, totalPages: number) =>
        setState(fileEntryId, signal, { status: 'recognizing', kind, completedPages, totalPages });
      const recognize = kind === 'image' ? extractImageText : extractPdfText;
      const result = engine
        ? await engine.extract(source.uri, kind, signal, reportProgress, options)
        : options
          ? await extractSystemDocumentPages(
              source.uri,
              kind,
              options,
              language,
              signal,
              reportProgress,
            )
          : await recognize(
              source.uri,
              { maxPages: MAX_PDF_ATTACHMENT_PAGES, language },
              {
                signal,
                onProgress: ({ phase, completedPages, totalPages }) => {
                  if (phase === 'ocr') reportProgress(completedPages, totalPages);
                },
              },
            );
      signal.throwIfAborted();
      // Do not recreate a deleted file's derived content after an in-flight read. An empty image
      // is cached so history rebuilds skip it; an unsupported language ran no recognition.
      if (cacheSource.exists && !(kind === 'image' && result.ocrUnavailable))
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

/** Explicit tasks share the ordinary readers' cancellation, cache retention and inference slot. */
export function readDocumentPages(
  source: File,
  kind: 'pdf' | 'image',
  options: DocumentExtractionOptions,
  signal: AbortSignal,
  resource?: { cacheSource: File; cacheKey: string; dispose(): void },
): Promise<FileTextResult> {
  return readText(source, signal, kind, options, resource);
}

async function readText(
  source: File,
  signal: AbortSignal,
  kind: 'pdf' | 'image',
  options?: DocumentExtractionOptions,
  resource?: { cacheSource: File; cacheKey: string; dispose(): void },
): Promise<FileTextResult> {
  let settled: Promise<FileTextResult> | undefined;
  try {
    signal.throwIfAborted();
    const language = appLanguage();
    let rejectAbort!: (reason: unknown) => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const cancelResolution = () => rejectAbort(signal.reason);
    signal.addEventListener('abort', cancelResolution, { once: true });
    let engine: FileTextEngine | undefined;
    try {
      // A shared startup hash check can outlive one consumer; cancelling that consumer stays immediate.
      engine = await Promise.race([resolveEngine(), cancelled]);
    } finally {
      signal.removeEventListener('abort', cancelResolution);
    }
    signal.throwIfAborted();
    if (options && options.task !== 'document' && !engine)
      throw new DocumentExtractionError('model-unavailable');
    const requestKey = options
      ? sha256HexOfText(
          JSON.stringify({
            version: DOCUMENT_EXTRACTION_VERSION,
            ...options,
            assetVersion: resource?.cacheKey,
          }),
        )
      : undefined;
    const cache = fileTextCacheFile(
      resource?.cacheSource ?? source,
      language,
      kind,
      engine?.cacheKey,
      requestKey,
    );
    const key = cache.uri;
    let operation = pending.get(key);
    if (!operation) {
      const controller = new AbortController();
      operation = {
        controller,
        consumers: 0,
        result: extract(
          source,
          cache,
          language,
          controller.signal,
          kind,
          engine,
          options,
          resource?.cacheSource,
        ),
      };
      pending.set(key, operation);
      const owner = operation;
      const remove = () => {
        if (pending.get(key) === owner) pending.delete(key);
      };
      void operation.result.then(remove, remove);
    }
    const owner = operation;
    settled = owner.result;
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
  } finally {
    // Abort rejects a consumer immediately; native cleanup may still be using its temporary asset.
    if (resource) {
      const dispose = () => {
        try {
          resource.dispose();
        } catch {
          /* Temporary cache cleanup is best effort. */
        }
      };
      if (settled) void settled.then(dispose, dispose);
      else dispose();
    }
  }
}
