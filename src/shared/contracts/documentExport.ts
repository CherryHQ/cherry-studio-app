import type { FileEntryId } from '@/shared/data/types/file';

import type { ResolvedFile } from './file';
import type { ExportFile, ExportWatermark } from './fileExport';

export const DOCUMENT_EXPORT_MAX_SECTIONS = 128;

/** Resolved product copy travels with the snapshot, including portable text fallbacks. */
export type ExportContentLabels = {
  code: string;
  codeOmitted: string;
  file: string;
  fileMetadataOnly: string;
  image: string;
  imageUnavailable: string;
  sources: string;
  table: string;
};

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
  | {
      kind: 'links';
      /** Source-localized count label for the compact summary. */
      summary?: string;
      items: readonly { label: string; url: string }[];
    };

export type ExportDocument = {
  title?: string;
  labels?: ExportContentLabels;
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
  | { kind: 'markdown'; source: string; title?: string; labels?: ExportContentLabels };

export type ExportFormat = 'markdown' | 'html' | 'image';
export type ExportImageLayout = 'pages' | 'single';
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
export type ExportImagePage = { file: ExportFile; width: number; height: number };
export type DocumentExportArtifact = {
  id: string;
  issues: readonly DocumentExportIssue[];
} & (
  | { format: 'markdown'; file: ExportFile; text: string }
  | { format: 'html'; file: ExportFile; html: string }
  | {
      format: 'image';
      layout: ExportImageLayout;
      pages: readonly ExportImagePage[];
    }
);

/** Delivers each PNG in order; the surface releases it after onPage settles. */
export type CaptureExportHtml = (input: {
  html: string;
  width: number;
  layout: ExportImageLayout;
  signal: AbortSignal;
  onPage(image: {
    uri: string;
    width: number;
    height: number;
    index: number;
    total: number;
  }): Promise<void>;
}) => Promise<void>;

export type HtmlConversionFormat = 'image' | 'pptx';
export type CapturedHtmlPage = {
  uri: string;
  width: number;
  height: number;
  release(): void;
};
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
  | {
      format: 'image';
      layout: ExportImageLayout;
      presentation: ExportPresentation;
      capture: CaptureExportHtml;
    };
export type DocumentExportProgress =
  | 'rendering'
  | 'resolving-assets'
  | 'capturing'
  | 'writing'
  | { stage: 'capturing'; page: number; total: number };

export class DocumentExportError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'size-limit'
      | 'image-size-limit'
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
  /** Lightweight fallback Markdown without embedded assets or signatures; no files or resource reads. */
  readonly markdown: string;
  /** Styled view of prepared Markdown: embedded pictures display, remote links need no network read. */
  previewMarkdown(text: string, presentation: ExportPresentation): string;
  render(
    target: DocumentExportTarget,
    context?: {
      signal?: AbortSignal;
      onProgress?: (progress: DocumentExportProgress) => void;
    },
  ): Promise<DocumentExportArtifact>;
  /** Persist in order. A retry reuses pages already committed before an interruption. */
  save(artifact: DocumentExportArtifact, signal?: AbortSignal): Promise<readonly ResolvedFile[]>;
  dispose(): Promise<void>;
}

export interface DocumentExportModule {
  createSession(input: DocumentExportInput): DocumentExportSession;
  /** Explicit conversion creates a managed file, with temporary output owned by the runtime. */
  convertHtml(input: HtmlConversionInput, context?: HtmlConversionContext): Promise<ResolvedFile>;
}
