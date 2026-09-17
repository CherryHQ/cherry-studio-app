import type { FileEntryId } from '@/shared/data/types/file';

import type { ResolvedFile } from './file';
import type { ExportFile, ExportWatermark } from './fileExport';

export const DOCUMENT_EXPORT_MAX_SECTIONS = 128;

export type ExportBlock =
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; source: string }
  | { kind: 'image'; assetId: string; alt: string }
  | { kind: 'attachment'; name: string; mediaType?: string; url?: string }
  | {
      kind: 'details';
      summary: string;
      presentation?: 'process' | 'reasoning';
      blocks: readonly ExportBlock[];
    }
  | { kind: 'links'; items: readonly { label: string; url: string }[] };

export type ExportDocument = {
  title?: string;
  sections: readonly {
    id: string;
    heading?: string;
    /** Source-owned visual hierarchy, independent of chat models or live UI. */
    presentation?: 'bubble' | 'message';
    metadata?: readonly { label: string; value: string }[];
    blocks: readonly ExportBlock[];
  }[];
  assets?: Readonly<
    Record<
      string,
      { kind: 'managed-file'; fileEntryId: FileEntryId } | { kind: 'remote-image'; url: string }
    >
  >;
};

export type DocumentExportInput =
  | { kind: 'document'; document: ExportDocument }
  | { kind: 'markdown'; source: string; title?: string };

export type ExportFormat = 'markdown' | 'html' | 'image';
/** Optional print treatment supplied by the frontend, independent of the shared signature. */
export type ExportImageFrame = {
  background: string;
  label: string;
};
export type ExportPresentation = {
  width: number;
  typography: Record<'base' | 'sm' | 'lg' | 'xl', { fontSize: number; lineHeight: number }>;
  colors: {
    background: string;
    foreground: string;
    muted: string;
    tertiary: string;
    border: string;
    subtleBorder: string;
    link: string;
    bubble: string;
    secondary: string;
    codeBlock: string;
    inlineCode: string;
    inlineCodeForeground: string;
  };
  imageFrame?: ExportImageFrame;
  watermark?: ExportWatermark;
};
export type DocumentExportIssue = { code: 'image-unavailable' | 'formula-fallback'; label: string };
export type DocumentExportArtifact = {
  id: string;
  file: ExportFile;
  issues: readonly DocumentExportIssue[];
} & (
  | { format: 'markdown'; text: string }
  | { format: 'html'; html: string }
  | { format: 'image'; width: number; height: number }
);

/** Returns a lossless PNG file. The page also owns cleanup of late/failed native output. */
export type CaptureExportHtml = (input: {
  html: string;
  width: number;
  signal: AbortSignal;
}) => Promise<{
  uri: string;
  width: number;
  height: number;
  release(): void;
}>;

export type HtmlConversionFormat = 'image' | 'pptx';
export type CapturedHtmlPage = Awaited<ReturnType<CaptureExportHtml>>;
/** Capture one page at a time. The producer releases each PNG after onPage settles. */
export type CaptureHtmlPages = (input: {
  format: HtmlConversionFormat;
  signal: AbortSignal;
  onPage(page: CapturedHtmlPage, index: number, total: number): Promise<void>;
}) => Promise<void>;
export type HtmlConversionInput = {
  title: string;
  format: HtmlConversionFormat;
  capture: CaptureHtmlPages;
};
export type HtmlConversionContext = {
  signal?: AbortSignal;
  onProgress?: (progress: {
    stage: 'capturing' | 'writing';
    current: number;
    total: number;
  }) => void;
};
export const HTML_CONVERSION_MAX_PAGES = 64;
export const HTML_CONVERSION_MAX_PIXELS = 16_000_000;
export const HTML_CONVERSION_MAX_EDGE = 8192;

export type DocumentExportTarget =
  | { format: 'markdown'; watermark?: ExportWatermark }
  | { format: 'html'; presentation: ExportPresentation }
  | { format: 'image'; presentation: ExportPresentation; capture: CaptureExportHtml };
export type DocumentExportProgress = 'rendering' | 'resolving-assets' | 'capturing' | 'writing';

export class DocumentExportError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'size-limit'
      | 'image-size-limit'
      | 'image-resource-limit'
      | 'busy'
      | 'disposed'
      | 'inactive'
      | 'capture-failed'
      | 'storage-failed',
  ) {
    super(`Document export: ${code}`);
    this.name = 'DocumentExportError';
  }
}

export interface DocumentExportSession {
  /** Frozen source snapshot for structured previews; does not resolve assets or create files. */
  readonly document: ExportDocument;
  /** Portable source Markdown without presentation signatures; no files or resource reads. */
  readonly markdown: string;
  render(
    target: DocumentExportTarget,
    context?: {
      signal?: AbortSignal;
      onProgress?: (progress: DocumentExportProgress) => void;
    },
  ): Promise<DocumentExportArtifact>;
  /** Explicit user intent: persist once per artifact, retaining bytes after page exit. */
  save(artifact: DocumentExportArtifact, signal?: AbortSignal): Promise<ResolvedFile>;
  dispose(): Promise<void>;
}

export interface DocumentExportModule {
  createSession(input: DocumentExportInput): DocumentExportSession;
  /** Explicit conversion creates a managed file, with temporary output owned by the runtime. */
  convertHtml(input: HtmlConversionInput, context?: HtmlConversionContext): Promise<ResolvedFile>;
}
