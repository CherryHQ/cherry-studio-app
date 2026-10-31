import * as z from 'zod';

import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { DocumentJsonValue } from './fileAttachment';

export const DOCUMENT_EXTRACTION_MAX_PAGES = 8;
export const DOCUMENT_EXTRACTION_VERSION = 'document-tasks-v1';

/** Page numbers are PDF source pages. Office assets keep their original parser reference. */
export const documentExtractionOptionsSchema = z
  .strictObject({
    task: z.enum(['document', 'tables', 'formulas', 'fields', 'question']),
    pages: z.array(z.int().min(1).max(100)).min(1).max(DOCUMENT_EXTRACTION_MAX_PAGES).optional(),
    assetRef: z.string().min(1).max(512).optional(),
    fields: z.array(z.string().trim().min(1).max(100)).min(1).max(32).optional(),
    question: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((input, context) => {
    if ((input.task === 'fields') !== (input.fields !== undefined))
      context.addIssue({ code: 'custom', message: 'Only the fields task requires fields.' });
    if ((input.task === 'question') !== (input.question !== undefined))
      context.addIssue({ code: 'custom', message: 'Only the question task requires a question.' });
    if (input.pages && new Set(input.pages).size !== input.pages.length)
      context.addIssue({ code: 'custom', message: 'Page numbers must be unique.' });
    if (input.fields && new Set(input.fields).size !== input.fields.length)
      context.addIssue({ code: 'custom', message: 'Field names must be unique.' });
    if (input.assetRef && input.pages)
      context.addIssue({ code: 'custom', message: 'An embedded image has no PDF page selection.' });
  });

export const extractDocumentInputSchema = z.strictObject({
  fileEntryId: FileEntryIdSchema,
  options: documentExtractionOptionsSchema,
});

export type DocumentExtractionOptions = z.infer<typeof documentExtractionOptionsSchema>;
export type ExtractDocumentInput = z.infer<typeof extractDocumentInputSchema>;

export const extractedTableSchema = z
  .object({
    rowCount: z.int().min(1).max(1000),
    columnCount: z.int().min(1).max(1000),
    cells: z
      .array(
        z.object({
          text: z.string().max(100_000),
          row: z.int().min(0),
          column: z.int().min(0),
          rows: z.int().min(1),
          columns: z.int().min(1),
        }),
      )
      .max(20_000),
  })
  .refine((table) => {
    const occupied = new Set<number>();
    for (const cell of table.cells) {
      if (cell.row + cell.rows > table.rowCount || cell.column + cell.columns > table.columnCount)
        return false;
      for (let row = cell.row; row < cell.row + cell.rows; row++) {
        for (let column = cell.column; column < cell.column + cell.columns; column++) {
          const key = row * table.columnCount + column;
          if (occupied.has(key) || occupied.size >= 100_000) return false;
          occupied.add(key);
        }
      }
    }
    return true;
  }, 'Table cells must fit the grid without overlapping, within 100000 occupied positions.');
export type ExtractedTable = z.infer<typeof extractedTableSchema>;

export const documentExtractionUnitSchema = z.object({
  location: z.object({
    page: z.int().min(1).optional(),
    assetRef: z.string().optional(),
    /** JSON pointer into the unchanged AnyDoc IR; never an invented Excel cell address. */
    pointer: z.string().optional(),
  }),
  engine: z.enum(['pdf-text', 'system', 'xiaomi', 'anydoc', 'builtin']),
  status: z.enum(['complete', 'truncated', 'unrecognized', 'invalid-structure', 'unavailable']),
  text: z.string().max(1_000_000),
  raw: z.string().max(1_000_000).optional(),
  tables: z.array(extractedTableSchema).max(100),
  formulas: z.array(z.string().max(100_000)).max(1000),
  fields: z.record(z.string(), z.string().nullable()).optional(),
  answer: z.string().optional(),
});
export type DocumentExtractionUnit = z.infer<typeof documentExtractionUnitSchema>;

export type DocumentExtractionResult = {
  source: { fileEntryId: string; revision: number; filename: string; sha256: string };
  task: DocumentExtractionOptions['task'];
  version: string;
  parserVersion?: string;
  modelVersion?: string;
  status: 'complete' | 'partial';
  totalPages?: number;
  /** PDF pages beyond this call's bounded default range can be requested explicitly. */
  nextPage?: number;
  units: DocumentExtractionUnit[];
  /** Original IR, retained without stripping fields. Only returned for the document task. */
  ir?: DocumentJsonValue;
  assets?: { assetRef: string; mediaType: string | null; size: number }[];
  warnings: string[];
};

export class DocumentExtractionError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'unavailable'
      | 'unsupported'
      | 'model-unavailable'
      | 'failed'
      | 'size-limit',
  ) {
    super(`Document extraction: ${code}`);
    this.name = 'DocumentExtractionError';
  }
}
