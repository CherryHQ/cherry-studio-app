import * as z from 'zod';

import { FileEntryIdSchema, SafeNameSchema } from '@/shared/data/types/file';

import { officeText } from './officeSpec';

const paragraph = z.int().min(0).max(100_000);
const docxAnchor = z.strictObject({
  format: z.literal('docx'),
  paragraph,
  paraId: z
    .string()
    .regex(/^[A-Fa-f0-9]{8}$/)
    .optional(),
  charRange: z
    .tuple([z.int().nonnegative(), z.int().nonnegative()])
    .optional()
    .describe(
      'Optional UTF-16 range from the preview. Reads still return the complete paragraph; edits stay inside this range.',
    ),
});
const pptxAnchor = z.strictObject({
  format: z.literal('pptx'),
  slide: z.int().min(1).max(10_000),
  nodeId: z.string().regex(/^\d+$/),
  paragraph,
  tableCell: z.strictObject({ row: z.int().nonnegative(), col: z.int().nonnegative() }).optional(),
});
const cellAddress = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/);
const xlsxAnchor = z.strictObject({
  format: z.literal('xlsx'),
  sheet: z.string().min(1).max(31),
  range: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?$/),
});

export const officeAnchorSchemas = { docx: docxAnchor, xlsx: xlsxAnchor, pptx: pptxAnchor };

const source = { file_entry_id: FileEntryIdSchema };
export const officeInspectSchema = z.strictObject({
  ...source,
  offset: z.int().nonnegative().default(0),
  limit: z.int().min(1).max(100).default(30),
  shape_offset: z
    .int()
    .nonnegative()
    .default(0)
    .describe('For PPTX, skip this many shapes on each selected slide.'),
});
export const officeReadSchema = z.strictObject({
  ...source,
  anchor: z.discriminatedUnion('format', [docxAnchor, xlsxAnchor, pptxAnchor]),
});
const editSource = {
  version: z.literal(1),
  ...source,
  filename: SafeNameSchema,
  source_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .describe(
      'Exact source digest returned by inspect_office_file or read_office_content. A mismatch refuses the edit.',
    ),
};
const replacement = {
  expect_text: officeText(32_000).describe(
    'Exact complete paragraph text from read_office_content.',
  ),
  find: officeText(16_000)
    .min(1)
    .regex(/^[^\r\n\t]*$/)
    .describe(
      'Literal text occurring exactly once inside charRange, or in the complete paragraph when no range is supplied.',
    ),
  replace: officeText(16_000).regex(/^[^\r\n\t]*$/),
};
export const officeEditSchemas = {
  docx: z.strictObject({
    ...editSource,
    edits: z
      .array(z.strictObject({ anchor: docxAnchor, ...replacement }))
      .min(1)
      .max(100),
  }),
  xlsx: z.strictObject({
    ...editSource,
    sheet: z.string().min(1).max(31),
    cells: z
      .array(
        z.strictObject({
          address: cellAddress,
          value: z.union([officeText(16_000), z.number().finite(), z.boolean(), z.null()]),
        }),
      )
      .min(1)
      .max(1000),
  }),
  pptx: z.strictObject({
    ...editSource,
    edits: z
      .array(z.strictObject({ anchor: pptxAnchor, ...replacement }))
      .min(1)
      .max(100),
  }),
};

export type OfficeTransformRequest =
  | {
      operation: 'inspect';
      format: 'docx' | 'xlsx' | 'pptx';
      offset: number;
      limit: number;
      shape_offset: number;
    }
  | ({ operation: 'read' } & z.infer<typeof officeReadSchema>)
  | {
      [Format in keyof typeof officeEditSchemas]: { operation: 'edit'; format: Format } & z.infer<
        (typeof officeEditSchemas)[Format]
      >;
    }[keyof typeof officeEditSchemas];
