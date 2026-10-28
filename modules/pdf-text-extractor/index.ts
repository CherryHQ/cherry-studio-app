import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  ExtractOptions,
  ExtractResult,
  ExtractionControl,
  PdfTextExtractorModule,
} from './src/PdfTextExtractor.types';

export type { ExtractOptions, ExtractResult, ExtractionControl };
export type { ExtractionProgress } from './src/PdfTextExtractor.types';

const NativeModule: PdfTextExtractorModule | null =
  Platform.OS === 'web' ? null : requireOptionalNativeModule('PdfTextExtractor');

const getNativeModule = (): PdfTextExtractorModule => {
  if (!NativeModule) {
    throw new Error(
      'PdfTextExtractor is not supported on web or Expo Go. Use a dev build or production build.',
    );
  }

  return NativeModule;
};

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
    const result = await native.extractText(filePath, options ?? {}, requestId);
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
