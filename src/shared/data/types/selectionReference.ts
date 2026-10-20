import * as z from 'zod';

import { FileEntryIdSchema } from './file';

/** The Office tools validate the anchor when the Agent reads or edits; the reference only carries it. */
export const OfficeSelectionSchema = z.strictObject({
  file_entry_id: FileEntryIdSchema,
  anchor: z.looseObject({ format: z.enum(['docx', 'xlsx', 'pptx']) }),
  excerpt: z.string().min(1).max(2000),
});
export type OfficeSelection = z.infer<typeof OfficeSelectionSchema>;

/**
 * A preview selection shown as a chip in the composer and the sent message. The runtime gives the
 * model the same fenced `selection-ref` block that desktop sends. Offsets use UTF-16.
 */
export const SelectionTextReferenceSchema = z.strictObject({
  type: z.literal('selection'),
  selection: OfficeSelectionSchema,
  label: z.string().min(1),
  offset: z.number().int().nonnegative(),
});
export type SelectionTextReference = z.infer<typeof SelectionTextReferenceSchema>;
