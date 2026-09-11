import type { FileEntryId } from '@/shared/data/types/file';

import type { ResolvedFile } from './file';

export type ExportBlock =
  | { kind: 'markdown'; source: string }
  | { kind: 'image'; assetId: string; alt: string }
  | { kind: 'attachment'; name: string; mediaType?: string; url?: string }
  | { kind: 'details'; summary: string; blocks: readonly ExportBlock[] }
  | { kind: 'links'; items: readonly { label: string; url: string }[] };

export type ExportDocument = {
  title?: string;
  sections: readonly {
    id: string;
    heading?: string;
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
export type ExportPresentation = {
  width: number;
  fontSize: number;
  colors: { background: string; foreground: string; muted: string; border: string; link: string };
};
export type DocumentExportIssue = { code: 'image-unavailable' | 'formula-fallback'; label: string };
export type ExportFile = { uri: string; filename: string; mediaType: string };
export type DocumentExportArtifact = {
  id: string;
  file: ExportFile;
  issues: readonly DocumentExportIssue[];
} & (
  | { format: 'markdown'; text: string }
  | { format: 'html'; html: string }
  | { format: 'image'; width: number; height: number }
);

/** The page owns capture and must release late/failed native output as well. */
export type CaptureExportHtml = (input: {
  html: string;
  width: number;
  maxHeight: number;
  maxPixels: number;
  signal: AbortSignal;
}) => Promise<{
  uri: string;
  width: number;
  height: number;
  release(): void;
}>;

export type DocumentExportTarget =
  | { format: 'markdown' }
  | { format: 'html'; presentation: ExportPresentation }
  | { format: 'image'; presentation: ExportPresentation; capture: CaptureExportHtml };
export type DocumentExportProgress = 'rendering' | 'resolving-assets' | 'capturing' | 'writing';

export class DocumentExportError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'size-limit'
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
}
