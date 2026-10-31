import { Directory, File, Paths } from 'expo-file-system';
import type { LlamaContext } from 'llama.rn';
import { Platform, TurboModuleRegistry } from 'react-native';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  DOCUMENT_EXTRACTION_MAX_PAGES,
  type DocumentExtractionOptions,
  type DocumentExtractionUnit,
} from '@/shared/contracts/documentExtraction';
import type { FileOcrEngine, LocalOcrModule } from '@/shared/contracts/localOcr';
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
import { LOCAL_OCR_MODEL_VERSION } from './localOcrModel';
import { parseXiaomiFields, parseXiaomiOcrOutput } from './xiaomiOcrOutput';

const logger = loggerService.withContext('LocalOcr');
const MAX_TEXT_CHARACTERS = 1_000_000;
// Xiaomi's whole-page task prompt. The separate layout detector is intentionally not bundled.
const DOCUMENT_PROMPT =
  'Extract all information from the main body of the document image and represent it ' +
  'in markdown format, ignoring headers and footers. Tables should be expressed in OTSL ' +
  'format, formulas in the document should be represented using LATEX format, and the ' +
  'parsing should be organized according to the reading order.';

export function createLocalOcrModule(preferences: {
  readEngine(): FileOcrEngine;
  writeEngine(engine: FileOcrEngine): Promise<unknown>;
}) {
  const download = createOcrModelDownload(
    supportsLocalOcrImages() && TurboModuleRegistry.get('RNLlama') !== null,
  );
  const running = new Map<AbortController, Promise<FileTextResult>>();
  const commands = new Set<Promise<void>>();
  let stopped = false;
  let removing = false;

  function command(work: () => Promise<void>): Promise<void> {
    if (stopped) return Promise.reject(new Error('Local OCR has stopped'));
    const result = work().finally(() => commands.delete(result));
    commands.add(result);
    return result;
  }

  const engine: FileTextEngine = {
    cacheKey: LOCAL_OCR_MODEL_VERSION,
    extract(source, kind, signal, onProgress, options) {
      if (stopped || removing) return Promise.reject(new Error('Local OCR is unavailable'));
      const controller = new AbortController();
      const linked = linkAbortSignals([signal, controller.signal]);
      const result = recognizeDocument(source, kind, linked.signal, onProgress, options).finally(
        () => {
          linked.dispose();
          running.delete(controller);
        },
      );
      running.set(controller, result);
      return result;
    },
  };

  async function recognizeDocument(
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
    const prompt =
      task === 'fields'
        ? 'Extract key information in the image\n\nPlease output the key information in JSON format according to the following schema:\n' +
          JSON.stringify(Object.fromEntries(options!.fields!.map((field) => [field, '']))) +
          '\nPreserve exact visible text, including leading zeroes, dates, units and decimal places. Use null for missing values. Return JSON only.'
        : task === 'question'
          ? options!.question! + '\nAnswer the question using a single word or phrase.'
          : DOCUMENT_PROMPT;
    const fieldSchema =
      task === 'fields'
        ? {
            type: 'object',
            properties: Object.fromEntries(
              options!.fields!.map((field) => [field, { type: ['string', 'null'] }]),
            ),
            required: options!.fields,
            additionalProperties: false,
          }
        : undefined;
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
              const paths = download.paths();
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
            unit.engine = 'xiaomi';
            unit.raw = raw;
            unit.status = truncated ? 'truncated' : raw ? 'complete' : 'unrecognized';
            if (task === 'fields') {
              unit.fields = parseXiaomiFields(raw, options!.fields!);
              if (!unit.fields && !truncated) unit.status = 'invalid-structure';
              text = raw;
            } else if (task === 'question') {
              unit.answer = raw;
              text = raw;
            } else {
              const parsed = parseXiaomiOcrOutput(raw);
              text = parsed.text;
              unit.tables = parsed.tables;
              unit.formulas = parsed.formulas;
              if (parsed.invalidStructure && !truncated) unit.status = 'invalid-structure';
            }
            isTruncated ||= truncated;
            if (!text.trim()) unrecognizedPages.push(index + 1);
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

  async function stopRecognition() {
    const pending = [...running.entries()];
    for (const [controller] of pending) controller.abort();
    await Promise.allSettled(pending.map(([, result]) => result));
  }

  const module: LocalOcrModule = {
    observe: download.observe,
    download: () =>
      command(async () => {
        if (stopped || removing) throw new Error('Local OCR is unavailable');
        const ready = await download.download();
        if (ready && download.isReady() && !stopped && !removing)
          await preferences.writeEngine('xiaomi');
      }),
    pause: download.pause,
    remove: () =>
      command(async () => {
        if (stopped || removing) throw new Error('Local OCR is unavailable');
        removing = true;
        try {
          await preferences.writeEngine('system');
          await stopRecognition();
          await download.remove();
        } finally {
          removing = false;
        }
      }),
  };
  return {
    module,
    async resolveEngine(): Promise<FileTextEngine | undefined> {
      if (stopped || removing || preferences.readEngine() !== 'xiaomi') return undefined;
      // Missing downloads (including a restored preference on a new phone) keep system OCR usable.
      const ready = await download.ensureReady();
      return ready && !stopped && !removing ? engine : undefined;
    },
    async dispose() {
      stopped = true;
      await Promise.all([stopRecognition(), download.dispose()]);
      await Promise.allSettled([...commands]);
    },
  };
}
