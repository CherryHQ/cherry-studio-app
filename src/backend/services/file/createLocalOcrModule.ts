import { Directory, File, Paths } from 'expo-file-system';
import type { LlamaContext } from 'llama.rn';
import { Platform, TurboModuleRegistry } from 'react-native';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  DOCUMENT_EXTRACTION_MAX_PAGES,
  type DocumentExtractionOptions,
  type DocumentExtractionUnit,
} from '@/shared/contracts/documentExtraction';
import type { FileOcrEngine, LocalOcrModelId, LocalOcrModule } from '@/shared/contracts/localOcr';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';

import {
  prepareOcrImage,
  readPdfPages,
  renderPdfPage,
  supportsLocalOcrImages,
} from '../../../../modules/pdf-text-extractor';
import { createOcrModelDownload } from './createOcrModelDownload';
import type { FileTextEngine, FileTextResult } from './fileTextExtraction';
import { LOCAL_OCR_MODELS } from './localOcrModel';
import { parseOcrFields } from './localOcrOutput';
import { getLocalOcrPrompt } from './localOcrPrompt';
import { parseOvisAnswer, parseOvisOcrOutput } from './ovisOcrOutput';
import { parseXiaomiOcrOutput } from './xiaomiOcrOutput';

const logger = loggerService.withContext('LocalOcr');
const MAX_TEXT_CHARACTERS = 1_000_000;

export function createLocalOcrModule(preferences: {
  readEngine(): FileOcrEngine;
  writeEngine(engine: FileOcrEngine): Promise<unknown>;
}) {
  const isSupported = supportsLocalOcrImages() && TurboModuleRegistry.get('RNLlama') !== null;
  const downloads = {
    xiaomi: createOcrModelDownload(LOCAL_OCR_MODELS.xiaomi, isSupported),
    ovis: createOcrModelDownload(LOCAL_OCR_MODELS.ovis, isSupported),
  };
  const running = new Map<
    AbortController,
    { model: LocalOcrModelId; result: Promise<FileTextResult> }
  >();
  const commands = new Set<Promise<void>>();
  let stopped = false;
  const removing = new Set<LocalOcrModelId>();

  function command(work: () => Promise<void>): Promise<void> {
    if (stopped) return Promise.reject(new Error('Local OCR has stopped'));
    const result = work().finally(() => commands.delete(result));
    commands.add(result);
    return result;
  }

  function createEngine(model: LocalOcrModelId): FileTextEngine {
    return {
      cacheKey: LOCAL_OCR_MODELS[model].version,
      extract(source, kind, signal, onProgress, options) {
        if (stopped || removing.has(model) || !downloads[model].isReady())
          return Promise.reject(new Error('Local OCR is unavailable'));
        const controller = new AbortController();
        const linked = linkAbortSignals([signal, controller.signal]);
        const result = recognizeDocument(
          model,
          source,
          kind,
          linked.signal,
          onProgress,
          options,
        ).finally(() => {
          linked.dispose();
          running.delete(controller);
        });
        running.set(controller, { model, result });
        return result;
      },
    };
  }
  const engines = { xiaomi: createEngine('xiaomi'), ovis: createEngine('ovis') };

  async function recognizeDocument(
    model: LocalOcrModelId,
    uri: string,
    kind: 'pdf' | 'image',
    signal: AbortSignal,
    onProgress: (completedPages: number, totalPages: number) => void,
    options?: DocumentExtractionOptions,
  ): Promise<FileTextResult> {
    const inspection =
      kind === 'pdf'
        ? await readPdfPages(
            uri,
            options
              ? options.pages
                ? Math.max(...options.pages)
                : DOCUMENT_EXTRACTION_MAX_PAGES
              : MAX_PDF_ATTACHMENT_PAGES,
            signal,
            options?.pages,
          )
        : {
            totalPages: 1,
            isTruncated: false,
            pages: [{ page: 1, text: '', needsOcr: true, isTruncated: false }],
          };
    signal.throwIfAborted();
    const selected = inspection.pages.map((page) => page.page);
    const task = options?.task ?? 'document';
    const { prompt, fieldSchema } = getLocalOcrPrompt(model, options);
    const folder = new Directory(Paths.cache, 'LocalOcr');
    folder.create({ idempotent: true, intermediates: true });
    // File extraction is serial; the directory contains at most one page, including after a crash.
    const pageFile = new File(folder, 'page.jpg');
    let context: LlamaContext | undefined;
    let stop: Promise<void> | undefined;
    const cancel = () => {
      if (context)
        stop ??= Promise.resolve()
          .then(() => context?.stopCompletion())
          .catch((error: unknown) => {
            logger.warn('Local OCR cancellation failed', { error });
          });
    };
    signal.addEventListener('abort', cancel, { once: true });
    const pages: string[] = [];
    const pageResults: DocumentExtractionUnit[] = [];
    const unrecognizedPages: number[] = [];
    let characters = 0;
    let isTruncated = options ? false : inspection.isTruncated;
    let usedOcr = false;
    try {
      for (const [position, pageNumber] of selected.entries()) {
        const index = pageNumber - 1;
        const page = inspection.pages[position]!;
        const unit: DocumentExtractionUnit = {
          location: kind === 'pdf' ? { page: pageNumber } : {},
          engine: 'pdf-text',
          status: page.isTruncated ? 'truncated' : 'complete',
          text: page.text,
          tables: [],
          formulas: [],
        };
        signal.throwIfAborted();
        let text = page.text;
        if (page.needsOcr || task !== 'document') {
          usedOcr = true;
          onProgress(position, selected.length);
          if (pageFile.exists) pageFile.delete();
          let hasContent = true;
          if (kind === 'pdf') hasContent = await renderPdfPage(uri, index, pageFile.uri, signal);
          else await prepareOcrImage(uri, pageFile.uri, signal);
          signal.throwIfAborted();
          if (hasContent) {
            if (!context) {
              const paths = downloads[model].paths();
              // Deferred import keeps older development clients usable with system OCR.
              const { initLlama } = await import('llama.rn');
              signal.throwIfAborted();
              context = await initLlama({
                model: paths.model,
                n_ctx: 8192,
                n_batch: 128,
                n_ubatch: 128,
                n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
                use_mmap: true,
                use_mlock: false,
                // Pages are independent; recurrent-model chat checkpoints would only retain RAM.
                state_cache_budget_mb: 0,
              });
              signal.throwIfAborted();
              if (
                !(await context.initMultimodal({
                  path: paths.vision,
                  use_gpu: Platform.OS === 'ios',
                  image_max_tokens: 1024,
                }))
              )
                throw new Error('Local OCR vision model is unavailable');
            }
            signal.throwIfAborted();
            const formatted = await context.getFormattedChat(
              [
                {
                  role: 'user',
                  content: [
                    { type: 'image_url', image_url: { url: pageFile.uri } },
                    { type: 'text', text: prompt },
                  ],
                },
              ],
              undefined,
              {
                enable_thinking: false,
                jinja: true,
                ...(fieldSchema
                  ? {
                      response_format: {
                        type: 'json_schema' as const,
                        json_schema: { schema: fieldSchema, strict: true },
                      },
                    }
                  : {}),
              },
            );
            // Do not let cancellation during asynchronous template formatting start a new decode.
            signal.throwIfAborted();
            const result = await context.completion({
              ...formatted,
              stop: 'additional_stops' in formatted ? formatted.additional_stops : undefined,
              n_predict: task === 'question' ? 1024 : 4096,
              ...(fieldSchema ? { json_schema: JSON.stringify(fieldSchema) } : {}),
              temperature: 0,
              top_p: 0.8,
              penalty_repeat: 1,
            });
            signal.throwIfAborted();
            if (result.interrupted) throw new Error('Local OCR was interrupted');
            const truncated = Boolean(
              result.truncated || result.context_full || result.stopped_limit > 0,
            );
            const raw = (result.content || result.text).trim();
            unit.engine = model;
            unit.raw = raw;
            unit.status = truncated ? 'truncated' : raw ? 'complete' : 'unrecognized';
            if (task === 'fields') {
              unit.fields = parseOcrFields(raw, options!.fields!);
              if (!unit.fields && !truncated) unit.status = 'invalid-structure';
              text = raw;
            } else if (task === 'question') {
              unit.answer = model === 'ovis' ? parseOvisAnswer(raw) : raw;
              text = unit.answer ?? raw;
              if (model === 'ovis' && !unit.answer && !truncated) unit.status = 'invalid-structure';
            } else {
              const parsed = model === 'ovis' ? parseOvisOcrOutput(raw) : parseXiaomiOcrOutput(raw);
              text = parsed.text;
              unit.tables = parsed.tables;
              unit.formulas = parsed.formulas;
              if ('truncated' in parsed && parsed.truncated) unit.status = 'truncated';
              if (parsed.invalidStructure && unit.status !== 'truncated')
                unit.status = 'invalid-structure';
            }
            isTruncated ||= truncated;
            if (!text.trim()) {
              unrecognizedPages.push(index + 1);
              if (unit.status === 'complete') unit.status = 'unrecognized';
            }
          }
          if (!hasContent && task !== 'document') unit.status = 'unrecognized';
          if (pageFile.exists) pageFile.delete();
        }
        const remaining = Math.max(0, MAX_TEXT_CHARACTERS - characters - (pages.length ? 2 : 0));
        let end = Math.min(remaining, text.length);
        if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
        unit.text = text.slice(0, end);
        if (end < text.length) unit.status = 'truncated';
        isTruncated ||= unit.status === 'truncated';
        pageResults.push(unit);
        pages.push(unit.text);
        characters += end + (pages.length > 1 ? 2 : 0);
        if (usedOcr) onProgress(position + 1, selected.length);
        if (end < text.length || characters >= MAX_TEXT_CHARACTERS - 2) {
          isTruncated = true;
          break;
        }
      }
      return {
        text: pages.join('\n\n'),
        pages: pageResults,
        totalPages: inspection.totalPages,
        extractedPages: pages.length,
        isTruncated,
        extractionError: false,
        ocrError: false,
        ocrUnavailable: false,
        unrecognizedPages,
      };
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('Local document recognition failed', { error });
      // Preserve the existing file error surface and never send partially recognized documents.
      return {
        text: '',
        totalPages: inspection.totalPages,
        extractedPages: 0,
        isTruncated: false,
        extractionError: true,
        ocrError: true,
        ocrUnavailable: false,
        unrecognizedPages: [],
      };
    } finally {
      signal.removeEventListener('abort', cancel);
      await stop;
      try {
        await context?.release();
      } finally {
        if (pageFile.exists) pageFile.delete();
      }
    }
  }

  async function stopRecognition(model?: LocalOcrModelId) {
    const pending = [...running.entries()].filter(([, task]) => !model || task.model === model);
    for (const [controller] of pending) controller.abort();
    await Promise.allSettled(pending.map(([, task]) => task.result));
  }

  const module: LocalOcrModule = {
    observe: (model, observer) => downloads[model].observe(observer),
    download: (model) =>
      command(async () => {
        if (stopped || removing.has(model)) throw new Error('Local OCR is unavailable');
        const ready = await downloads[model].download();
        if (ready && downloads[model].isReady() && !stopped && !removing.has(model))
          await preferences.writeEngine(model);
      }),
    pause: (model) => downloads[model].pause(),
    remove: (model) =>
      command(async () => {
        if (stopped || removing.has(model)) throw new Error('Local OCR is unavailable');
        removing.add(model);
        try {
          if (preferences.readEngine() === model) await preferences.writeEngine('system');
          await stopRecognition(model);
          await downloads[model].remove();
        } finally {
          removing.delete(model);
        }
      }),
  };
  return {
    module,
    async resolveEngine(): Promise<FileTextEngine | undefined> {
      const model = preferences.readEngine();
      if (stopped || model === 'system' || removing.has(model)) return undefined;
      // Missing downloads (including a restored preference on a new phone) keep system OCR usable.
      const ready = await downloads[model].ensureReady();
      return ready && !stopped && !removing.has(model) ? engines[model] : undefined;
    },
    async dispose() {
      stopped = true;
      await Promise.all([
        stopRecognition(),
        ...Object.values(downloads).map((download) => download.dispose()),
      ]);
      await Promise.allSettled([...commands]);
    },
  };
}
