import * as z from 'zod';

import { officeAnchorSchemas, officeImageAnchorSchemas } from '@/backend/services/office';

import type { RuntimeJsonValue } from '../runtime';

const error = z.strictObject({ status: z.literal('error'), message: z.string() });
const created = z.strictObject({
  status: z.literal('created'),
  fileEntryId: z.string(),
  filename: z.string(),
  mediaType: z.string(),
  size: z.number(),
});
const edited = created.extend({
  source_file_entry_id: z.string(),
  source_sha256: z.string(),
  sha256: z.string(),
  warnings: z.array(z.string()).optional(),
});
const read = {
  status: z.literal('read'),
  file_entry_id: z.string(),
  source_sha256: z.string(),
};
const page = { total: z.number(), offset: z.number() };
const inspect = z.union([
  error,
  z.strictObject({
    ...read,
    ...page,
    kind: z.literal('images'),
    format: z.enum(['docx', 'xlsx', 'pptx']),
    items: z.array(
      z.strictObject({
        anchor: z.discriminatedUnion('format', [
          officeImageAnchorSchemas.docx,
          officeImageAnchorSchemas.xlsx,
          officeImageAnchorSchemas.pptx,
        ]),
        name: z.string(),
        alt: z.string(),
        replaceable: z.boolean(),
        reason: z.string().optional(),
        mediaType: z.string().optional(),
        width_px: z.number().optional(),
        height_px: z.number().optional(),
        cell: z.string().optional(),
      }),
    ),
  }),
  z.strictObject({
    ...read,
    ...page,
    format: z.literal('docx'),
    items: z.array(
      z.strictObject({
        // Inspection reports the source attribute; exact reads validate the supplied anchor.
        anchor: officeAnchorSchemas.docx
          .omit({ charRange: true })
          .extend({ paraId: z.string().optional() }),
        excerpt: z.string(),
      }),
    ),
  }),
  z.strictObject({
    ...read,
    ...page,
    format: z.literal('xlsx'),
    items: z.array(z.strictObject({ sheet: z.string() })),
  }),
  z.strictObject({
    ...read,
    ...page,
    format: z.literal('pptx'),
    items: z.array(
      z.strictObject({
        slide: z.number(),
        shape_total: z.number(),
        shape_offset: z.number(),
        shapes: z.array(
          z.strictObject({
            nodeId: z.string(),
            kind: z.string(),
            paragraphs: z.number(),
            excerpt: z.string(),
            table: z.array(z.array(z.number())),
          }),
        ),
      }),
    ),
  }),
]);
const content = z.union([
  error,
  z.strictObject({
    ...read,
    format: z.literal('docx'),
    anchor: officeAnchorSchemas.docx,
    text: z.string(),
    selected_text: z.string().optional(),
  }),
  z.strictObject({
    ...read,
    format: z.literal('xlsx'),
    anchor: officeAnchorSchemas.xlsx,
    rows: z.array(
      z.array(
        z.strictObject({
          address: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          type: z.string().optional(),
          formula: z.string().optional(),
          cached: z.literal(true).optional(),
        }),
      ),
    ),
  }),
  z.strictObject({
    ...read,
    format: z.literal('pptx'),
    anchor: officeAnchorSchemas.pptx,
    text: z.string(),
  }),
]);

// These schemas describe value; the Runtime owns the { value, artifacts } envelope.
const creationSchema = z.toJSONSchema(z.union([created, error])) as RuntimeJsonValue;
const editSchema = z.toJSONSchema(z.union([edited, error])) as RuntimeJsonValue;
const scriptSchema = z.toJSONSchema(
  z.union([created.extend({ logs: z.string().optional() }), error]),
) as RuntimeJsonValue;
export const officeToolOutputSchemas = {
  create_document: creationSchema,
  create_workbook: creationSchema,
  create_presentation: creationSchema,
  inspect_office_file: z.toJSONSchema(inspect) as RuntimeJsonValue,
  read_office_content: z.toJSONSchema(content) as RuntimeJsonValue,
  edit_document: editSchema,
  edit_workbook: editSchema,
  edit_presentation: editSchema,
  run_office_script: scriptSchema,
};
