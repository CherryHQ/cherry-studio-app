import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  ExtractOptions,
  ExtractResult,
  PdfTextExtractorModule,
} from './src/PdfTextExtractor.types';

export type { ExtractOptions, ExtractResult };

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
): Promise<ExtractResult> {
  return getNativeModule().extractText(filePath, options);
}

/**
 * 获取 PDF 页数
 * @param filePath - PDF 文件路径
 * @returns 页数，失败返回 0
 */
export async function getPdfPageCount(filePath: string): Promise<number> {
  return getNativeModule().getPageCount(filePath);
}
