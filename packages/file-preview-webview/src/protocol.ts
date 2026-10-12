import { z } from 'zod';

/**
 * The page's origin. It is never fetched: it only gives the inline document a real
 * origin, because an opaque `about:blank` page cannot start module workers from blob URLs.
 */
export const FILE_PREVIEW_BASE_URL = 'https://file-preview.local/';

/** Raw bytes per injected chunk; pdf.js already requests 1 MiB ranges. */
export const FILE_PREVIEW_CHUNK_BYTES = 1024 * 1024;

export const FILE_PREVIEW_ERROR_CODES = [
  'invalid_range',
  'short_read',
  'source_changed',
  'closed',
  'too_large',
  'load_error',
] as const;

export type FilePreviewErrorCode = (typeof FILE_PREVIEW_ERROR_CODES)[number];

export type PdfResourceKind = 'cmap' | 'standard_font';

const requestId = z.int().nonnegative();
const documentId = z.int().nonnegative();

/** Messages the page posts to the app. The app validates every one before acting. */
export const PageMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('open'), requestId }),
  z.object({
    type: z.literal('read'),
    requestId,
    documentId,
    offset: z.int().nonnegative(),
    length: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal('resource'),
    requestId,
    kind: z.enum(['cmap', 'standard_font']),
    name: z.string().min(1).max(128),
  }),
  z.object({ type: z.literal('cancel'), requestId }),
  z.object({ type: z.literal('close'), documentId }),
  z.object({
    type: z.literal('diagnostic'),
    level: z.enum(['warn', 'error']),
    code: z.string().max(64).optional(),
    context: z.string().max(256),
    message: z.string().max(4096),
    detail: z.string().max(4096).optional(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string().max(64),
    message: z.string().max(4096),
  }),
  z.object({ type: z.literal('requestOpen'), reason: z.enum(['unsupported', 'too_large']) }),
]);

export type PageMessage = z.infer<typeof PageMessageSchema>;

export interface FilePreviewSourceInfo {
  id: string;
  name: string;
  mediaType: string;
}

export interface FilePreviewRenderOptions {
  source: FilePreviewSourceInfo;
  locale: string;
  isDark: boolean;
  /** CSS custom properties applied to the preview root, such as `--background`. */
  style: Record<`--${string}`, string>;
}

/** Messages the app injects into the page through `window.__filePreviewPage.receive`. */
export type HostMessage =
  | ({ type: 'render' } & FilePreviewRenderOptions)
  | { type: 'opened'; requestId: number; documentId: number; size: number; revision: string }
  | { type: 'chunk'; requestId: number; data: string }
  | { type: 'done'; requestId: number }
  | { type: 'failed'; requestId: number; code: FilePreviewErrorCode; message: string };

export const FILE_PREVIEW_PAGE_GLOBAL = '__filePreviewPage';

/** Byte ranges of each PDF resource inside `pdf-resources.bin`, keyed `cmap/<name>` or `standard_font/<filename>`. */
export type PdfResourceIndex = Record<string, readonly [offset: number, length: number]>;

export function pdfResourceKey(kind: PdfResourceKind, name: string): string {
  return `${kind}/${name}`;
}
