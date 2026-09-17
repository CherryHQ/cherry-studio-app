import type { CapturedHtmlPage } from '@/shared/contracts/documentExport';

export type HtmlCaptureFrame = {
  /** Physical PNG pixels; the surface converts these to native layout points. */
  width: number;
  height: number;
  script: string;
};

export type HtmlCaptureSource = {
  html: string;
  /** Initial measurement viewport in native layout points. */
  viewport: { width: number; height: number };
  contentMode: 'mobile' | 'desktop';
  setupScript: string;
  maxMessageLength: number;
  timeout: { pageMs?: number; totalMs?: number };
  readFrames(message: Record<string, unknown>): readonly HtmlCaptureFrame[] | undefined;
};

export type HtmlCaptureInput = {
  source(context: { id: number; density: number }): HtmlCaptureSource;
  signal: AbortSignal;
  /** Copy/consume the temporary file before returning. Capture owns its release. */
  onPage(page: CapturedHtmlPage, index: number, total: number, signal: AbortSignal): Promise<void>;
};
