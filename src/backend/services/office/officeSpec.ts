import * as z from 'zod';

import { FileEntryIdSchema, SafeNameSchema } from '@/shared/data/types/file';

// XML 1.0 cannot represent these code points, including unpaired UTF-16 surrogates.
// `excluded` joins the same character class: a second regex exports allOf, which
// provider tool schemas may reject.
export const officeText = (max: number, excluded = '') =>
  z
    .string()
    .max(max)
    .regex(
      new RegExp(String.raw`^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff${excluded}]*$`),
    )
    // Keep this out of JSON Schema: regex flags are lost during conversion.
    .refine(
      (value) => !/[\ud800-\udfff]/u.test(value),
      'Text must not contain unpaired surrogates.',
    );

const imageSchema = z.strictObject({
  file_entry_id: FileEntryIdSchema.describe(
    'An existing managed image from the conversation, a generated image or the selected workspace.',
  ),
  width_px: z.number().int().min(1).max(1600),
  height_px: z.number().int().min(1).max(1600),
  alt: officeText(300).optional(),
});

function rectangularRows<T extends z.ZodType>(cell: T, maxRows: number, maxColumns: number) {
  return z
    .array(z.array(cell).min(1).max(maxColumns))
    .min(1)
    .max(maxRows)
    .refine(
      (rows) => rows.every((row) => row.length === rows[0].length),
      'Every row must have the same number of columns.',
    );
}

export const documentSpecSchema = z.strictObject({
  version: z.literal(1),
  title: officeText(200).optional(),
  blocks: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('paragraph'),
          text: officeText(16_000),
          style: z.enum(['normal', 'title', 'heading1', 'heading2']).optional(),
        }),
        z.strictObject({
          type: z.literal('list'),
          items: z.array(officeText(2000)).min(1).max(100),
          ordered: z.boolean().optional(),
        }),
        z.strictObject({
          type: z.literal('table'),
          rows: rectangularRows(officeText(2000), 100, 12),
          header: z.boolean().optional(),
        }),
        imageSchema.extend({ type: z.literal('image') }),
      ]),
    )
    .min(1)
    .max(200),
});

export const workbookSpecSchema = z.strictObject({
  version: z.literal(1),
  sheets: z
    .array(
      z.strictObject({
        name: officeText(31, String.raw`\[\]:*?/\\`)
          .min(1)
          .refine(
            (name) =>
              !name.startsWith("'") && !name.endsWith("'") && name.toLowerCase() !== 'history',
            'Use an Excel sheet name without edge apostrophes or the reserved name History.',
          )
          .describe(
            'Excel sheet name: 1–31 characters; no [ ] : * ? / \\, no leading/trailing apostrophe, and not History (case-insensitive).',
          ),
        images: z
          .array(imageSchema.extend({ cell: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/) }))
          .max(50)
          .optional(),
        rows: rectangularRows(
          z.union([officeText(16_000), z.number().finite(), z.boolean(), z.null()]),
          1000,
          50,
        ),
        column_widths: z.array(z.number().min(4).max(80)).max(50).optional(),
        column_formats: z
          .array(z.enum(['general', 'integer', 'decimal', 'percent']))
          .max(50)
          .optional(),
      }),
    )
    .min(1)
    .max(16)
    .refine(
      (sheets) => new Set(sheets.map((sheet) => sheet.name.toLowerCase())).size === sheets.length,
      'Sheet names must be unique, ignoring case.',
    )
    .refine(
      (sheets) =>
        sheets.reduce((sum, sheet) => sum + sheet.rows.length * (sheet.rows[0]?.length ?? 0), 0) <=
        20_000,
      'A workbook may contain at most 20000 cells.',
    ),
});

export const presentationSpecSchema = z.strictObject({
  version: z.literal(1),
  title: officeText(200).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  slides: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('title'),
          title: officeText(180),
          subtitle: officeText(500).optional(),
        }),
        z.strictObject({
          type: z.literal('bullets'),
          title: officeText(180),
          items: z.array(officeText(300)).min(1).max(10),
        }),
        z.strictObject({
          type: z.literal('table'),
          title: officeText(180),
          rows: rectangularRows(officeText(80), 10, 6),
        }),
        imageSchema.extend({ type: z.literal('image'), title: officeText(180) }),
      ]),
    )
    .min(1)
    .max(100),
});

export const officeInputSchemas = {
  docx: z.strictObject({ filename: SafeNameSchema, spec: documentSpecSchema }),
  xlsx: z.strictObject({ filename: SafeNameSchema, spec: workbookSpecSchema }),
  pptx: z.strictObject({ filename: SafeNameSchema, spec: presentationSpecSchema }),
};

export type OfficeFormat = keyof typeof officeInputSchemas;
export type OfficeRequest = {
  [Format in OfficeFormat]: { format: Format } & z.infer<(typeof officeInputSchemas)[Format]>;
}[OfficeFormat];

/** A prepared image file the job reads; `uri` is host-only and never reaches the model. */
export type OfficeImage = { uri: string; size: number; mediaType: 'image/png' | 'image/jpeg' };

export const OFFICE_MEDIA_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export function officeImageIds(request: OfficeRequest): string[] {
  const blocks =
    request.format === 'docx'
      ? request.spec.blocks
      : request.format === 'pptx'
        ? request.spec.slides
        : request.spec.sheets.flatMap((sheet) =>
            (sheet.images ?? []).map((image) => ({ ...image, type: 'image' as const })),
          );
  return [
    ...new Set(blocks.flatMap((block) => (block.type === 'image' ? [block.file_entry_id] : []))),
  ];
}
