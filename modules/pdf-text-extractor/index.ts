import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  ExtractOptions,
  ExtractResult,
  ExtractionControl,
  PdfTextExtractorModule,
  PdfTextPages,
} from './src/PdfTextExtractor.types';

export type { ExtractOptions, ExtractResult, ExtractionControl, PdfTextPages };
export type { ExtractionProgress } from './src/PdfTextExtractor.types';

const NativeModule: PdfTextExtractorModule | null =
  Platform.OS === 'web' ? null : requireOptionalNativeModule('PdfTextExtractor');

export function supportsLocalOcrImages(): boolean {
  return (
    typeof NativeModule?.prepareOcrImage === 'function' &&
    typeof NativeModule?.readPdfPages === 'function' &&
    typeof NativeModule?.renderPdfPage === 'function'
  );
}

const getNativeModule = (): PdfTextExtractorModule => {
  if (!NativeModule) {
    throw new Error(
      'PdfTextExtractor is not supported on web or Expo Go. Use a dev build or production build.',
    );
  }

  return NativeModule;
};

/** The caller owns the temporary path, including deletion after cancellation or failure. */
export function prepareOcrImage(
  filePath: string,
  outputUri: string,
  signal: AbortSignal,
): Promise<void> {
  return withPdfRequest(signal, (native, id) => native.prepareOcrImage(filePath, outputUri, id));
}

/** The caller owns the temporary path, including deletion after cancellation or failure. */
export function renderPdfPage(
  filePath: string,
  pageIndex: number,
  outputUri: string,
  signal: AbortSignal,
): Promise<boolean> {
  return withPdfRequest(signal, (native, id) =>
    native.renderPdfPage(filePath, pageIndex, outputUri, id),
  );
}

export function readPdfPages(
  filePath: string,
  maxPages: number,
  signal: AbortSignal,
  pageNumbers?: number[],
): Promise<PdfTextPages> {
  return withPdfRequest(signal, (native, id) =>
    native.readPdfPages(filePath, maxPages, id, pageNumbers ?? null),
  );
}

async function withPdfRequest<T>(
  signal: AbortSignal,
  run: (native: PdfTextExtractorModule, requestId: string) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const native = getNativeModule();
  const id = native.createRequest();
  const cancel = () => native.cancelRequest(id);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await run(native, id);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}

/**
 * 提取 PDF 文本内容
 * @param filePath - PDF 文件路径
 * @param options - 提取选项
 */
export async function extractPdfText(
  filePath: string,
  options?: ExtractOptions,
  control: ExtractionControl = {},
): Promise<ExtractResult> {
  return extractText('extractText', filePath, options, control);
}

/** Recognizes the first frame locally, sharing native cancellation and scheduling with PDFs. */
export async function extractImageText(
  filePath: string,
  options?: Pick<ExtractOptions, 'language'>,
  control: ExtractionControl = {},
): Promise<ExtractResult> {
  return extractText('extractImageText', filePath, options, control);
}

async function extractText(
  method: 'extractText' | 'extractImageText',
  filePath: string,
  options: ExtractOptions | undefined,
  control: ExtractionControl,
): Promise<ExtractResult> {
  const { signal, onProgress } = control;
  signal?.throwIfAborted();
  const native = getNativeModule();
  const requestId = native.createRequest();
  const cancel = () => native.cancelRequest(requestId);
  let subscription: { remove(): void } | undefined;
  let isActive = true;
  try {
    subscription = onProgress
      ? native.addListener('onProgress', (progress) => {
          if (isActive && progress.requestId === requestId && !signal?.aborted)
            onProgress(progress);
        })
      : undefined;
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    // Always dispatch a reserved request, including a cancelled one, so native cleanup runs.
    const result = await native[method](filePath, options ?? {}, requestId);
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    isActive = false;
    signal?.removeEventListener('abort', cancel);
    subscription?.remove();
    cancel();
  }
}
