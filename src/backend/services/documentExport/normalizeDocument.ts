import * as z from 'zod';

import {
  DOCUMENT_EXPORT_MAX_SECTIONS,
  DocumentExportError,
  type DocumentExportInput,
  type ExportBlock,
  type ExportDocument,
} from '@/shared/contracts/documentExport';
import { FileEntryIdSchema } from '@/shared/data/types/file';

const text = z.string().max(500_000);
const block: z.ZodType<ExportBlock> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('text'), text }),
    z.strictObject({ kind: z.literal('markdown'), source: text }),
    z.strictObject({ kind: z.literal('image'), assetId: text, alt: text }),
    z.strictObject({
      kind: z.literal('attachment'),
      name: text,
      mediaType: text.optional(),
      url: text.optional(),
    }),
    z.strictObject({
      kind: z.literal('details'),
      summary: text,
      presentation: z.enum(['process', 'reasoning']).optional(),
      blocks: z.array(block).max(512),
    }),
    z.strictObject({
      kind: z.literal('links'),
      items: z.array(z.strictObject({ label: text, url: text })).max(256),
    }),
  ]),
);
const documentSchema = z.strictObject({
  title: text.optional(),
  sections: z
    .array(
      z.strictObject({
        id: text,
        heading: text.optional(),
        presentation: z.enum(['bubble', 'message']).optional(),
        metadata: z
          .array(z.strictObject({ label: text, value: text }))
          .max(16)
          .optional(),
        blocks: z.array(block).max(512),
      }),
    )
    .min(1)
    .max(DOCUMENT_EXPORT_MAX_SECTIONS),
  assets: z
    .record(
      z.string().max(255),
      z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('managed-file'), fileEntryId: FileEntryIdSchema }),
        z.strictObject({ kind: z.literal('remote-image'), url: text }),
      ]),
    )
    .optional(),
});

export function normalizeDocument(input: DocumentExportInput): ExportDocument {
  // Bound structure before recursive validation/serialization; also rejects cycles.
  let characters = 0;
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 10_000 || depth > 24) throw new DocumentExportError('size-limit');
    if (typeof value === 'string') characters += value.length;
    else if (value && typeof value === 'object')
      Object.values(value).forEach((item) => visit(item, depth + 1));
    if (characters > 500_000) throw new DocumentExportError('size-limit');
  }
  visit(input, 0);
  const value =
    input.kind === 'markdown'
      ? {
          title: input.title,
          sections: [{ id: 'document', blocks: [{ kind: 'markdown', source: input.source }] }],
        }
      : input.document;
  const result = documentSchema.safeParse(value);
  if (!result.success) throw new DocumentExportError('invalid-input');
  if (Object.keys(result.data.assets ?? {}).length > 32)
    throw new DocumentExportError('size-limit');
  // Zod returns new objects; none of the session's values alias caller-owned data.
  freezeSnapshot(result.data);
  return result.data;
}

function freezeSnapshot(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

export function safeExportUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&').replace(/\r?\n/g, ' ');
}
