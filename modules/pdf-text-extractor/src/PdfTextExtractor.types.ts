/**
 * PDF 文本提取选项
 */
export interface ExtractOptions {
  /**
   * 最大提取页数，默认 100 页
   * 超过此限制的页面将被截断
   */
  maxPages?: number;
}

export type ExtractionProgress = {
  requestId: string;
  completedPages: number;
  totalPages: number;
  phase: 'text' | 'ocr';
};

export type ExtractionControl = {
  signal?: AbortSignal;
  onProgress?: (progress: ExtractionProgress) => void;
};

/**
 * PDF 文本提取结果
 */
export interface ExtractResult {
  /**
   * 提取的文本内容
   */
  text: string;

  /**
   * PDF 总页数
   */
  totalPages: number;

  /**
   * 实际提取的页数
   */
  extractedPages: number;

  /**
   * 是否因页数限制而截断
   */
  isTruncated: boolean;

  /**
   * 文本提取过程中是否发生错误
   * 当为 true 时，text 可能为空或不完整
   */
  extractionError: boolean;
  /** A nonblank page could not be recognized; do not send the remaining pages as complete. */
  ocrError: boolean;
}

/**
 * PDF 文本提取模块接口
 */
export interface PdfTextExtractorModule {
  /** Reserve before dispatch so cancellation cannot overtake a queued extraction. */
  createRequest(): string;
  cancelRequest(requestId: string): void;
  addListener(
    event: 'onProgress',
    listener: (progress: ExtractionProgress) => void,
  ): { remove(): void };
  /**
   * 异步提取 PDF 文本
   * @param filePath - PDF 文件路径（支持 file:// 协议或绝对路径）
   * @param options - 提取选项
   * @returns 提取结果
   */
  extractText(filePath: string, options: ExtractOptions, requestId: string): Promise<ExtractResult>;
  /**
   * 获取 PDF 页数（异步方法）
   * @param filePath - PDF 文件路径
   * @returns 页数，失败返回 0
   */
  getPageCount(filePath: string): Promise<number>;
}
