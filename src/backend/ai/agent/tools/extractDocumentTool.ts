import * as z from 'zod';

import { linkFileOcr } from '@/backend/services/file/fileTextExtraction';
import {
  DocumentExtractionError,
  documentExtractionOptionsSchema,
} from '@/shared/contracts/documentExtraction';
import type { FileModule } from '@/shared/contracts/file';

import type { ManagedFileResolver } from '../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeTool } from '../runtime';
import { characterWindow, readFileInputSchema, READ_FILE_MAX_TEXT_BYTES } from './readFileTool';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export const extractDocumentToolSchema = z.strictObject({
  file_entry_id: readFileInputSchema.shape.file_entry_id,
  path: readFileInputSchema.shape.path,
  task: documentExtractionOptionsSchema.shape.task,
  pages: documentExtractionOptionsSchema.shape.pages.describe(
    'One-based PDF source pages, at most 8 per call, within the first 100 pages. Omit to process the first 8 pages; use nextPage to continue.',
  ),
  asset_ref: documentExtractionOptionsSchema.shape.assetRef.describe(
    'An exact embedded image assetRef from read_file or extract_document. No URLs or paths.',
  ),
  fields: documentExtractionOptionsSchema.shape.fields,
  question: documentExtractionOptionsSchema.shape.question,
  include_raw: z
    .boolean()
    .optional()
    .describe('Include original recognition output for checking. Defaults to false.'),
  offset: z
    .int()
    .min(0)
    .optional()
    .describe('Continue a json-fragment result using nextOffset with identical task parameters.'),
});

const ERRORS: Record<DocumentExtractionError['code'], string> = {
  'invalid-input':
    'Invalid task options or page selection. Fields requires field names; question requires one question. Pages apply only to PDFs.',
  unavailable: 'The managed file is unavailable.',
  unsupported:
    'This task is unsupported for this source. For Office fields/question, select an embedded image asset_ref; read native text with read_file.',
  'model-unavailable':
    'This image task requires the downloaded and enabled Xiaomi-OCR-0 model. Ordinary document text can still use system recognition. Do not retry unchanged.',
  failed: 'On-device document extraction failed. No complete result is available.',
  'size-limit': 'The document or embedded image exceeds the local extraction size limit.',
};

export function createExtractDocumentTool(
  files: Pick<FileModule, 'extractDocument'> & Pick<ManagedFileResolver, 'resolveAvailable'>,
  access: WorkspaceFileAccess,
): RuntimeTool {
  let previous: { key: string; json: string } | undefined;
  return {
    ref: { source: 'builtin', capabilityId: 'extract_document' },
    providerName: 'extract_document',
    displayName: 'Extract document',
    approval: 'auto',
    description:
      'Extract document, tables, formulas, named fields or a short answer entirely on device from an authorized PDF, image or Office file. This explicitly runs local extraction even with a vision model. PDF tables/formulas/fields/question render the requested pages even when they contain a text layer. Native Office structure uses AnyDoc; select an asset_ref to recognize one embedded image. Returns source hash, real PDF pages or IR pointers, actual engine, unit status and structured data. Cells have zero-based row/column and rows/columns spans. Fields retain original strings or null, never guessed numbers. Only complete units are suitable for automatic Office writes; check truncated/invalid/unrecognized results against raw output. Multiple and cross-page tables stay separate. Results contain only the requested content by default. Small results return data; larger results return json-fragment text: join text using nextOffset and JSON.parse once complete. In Code Mode pass the resulting arrays directly to create_workbook or create_document; fill an existing workbook only after inspect_office_file/read_office_content using its anchors and source hash. This tool sends no image pixels, but ordinary attachments may already have been sent to the chat model; it does not make a chat offline.',
    inputSchema: toRuntimeInputSchema(extractDocumentToolSchema),
    async execute({ input, signal, toolCallId }) {
      const parsed = extractDocumentToolSchema.safeParse(input);
      if (!parsed.success)
        return {
          value: { status: 'error', message: z.prettifyError(parsed.error) },
          artifacts: [],
        };
      const {
        task,
        pages,
        asset_ref: assetRef,
        fields,
        question,
        include_raw: includeRaw,
        offset = 0,
      } = parsed.data;
      const options = documentExtractionOptionsSchema.safeParse({
        task,
        pages,
        assetRef,
        fields,
        question,
      });
      if (!options.success)
        return { value: { status: 'error', message: ERRORS['invalid-input'] }, artifacts: [] };
      let unlink: (() => void) | undefined;
      try {
        const fileEntryId = await access.resolveRead(parsed.data);
        const source = (await files.resolveAvailable([fileEntryId])).get(fileEntryId);
        if (!source) throw new DocumentExtractionError('unavailable');
        signal.throwIfAborted();
        const key = JSON.stringify({
          fileEntryId,
          revision: source.revision,
          options: options.data,
          includeRaw,
        });
        let json = previous?.key === key ? previous.json : undefined;
        if (json === undefined) {
          unlink = linkFileOcr(toolCallId, fileEntryId);
          const result = await files.extractDocument(
            { fileEntryId, options: options.data },
            signal,
          );
          const units = result.units.map((unit) => ({
            location: unit.location,
            engine: unit.engine,
            status: unit.status,
            ...(includeRaw && unit.raw !== undefined ? { raw: unit.raw } : {}),
            ...(task === 'document'
              ? { text: unit.text, tables: unit.tables, formulas: unit.formulas }
              : {}),
            ...(task === 'tables' ? { tables: unit.tables } : {}),
            ...(task === 'formulas' ? { formulas: unit.formulas } : {}),
            ...(task === 'fields' ? { fields: unit.fields } : {}),
            ...(task === 'question' ? { answer: unit.answer } : {}),
          }));
          json = JSON.stringify({ ...result, units });
          previous = { key, json };
        }
        signal.throwIfAborted();
        if (offset === 0 && new TextEncoder().encode(json).byteLength <= READ_FILE_MAX_TEXT_BYTES) {
          return {
            value: {
              status: 'ok',
              format: 'json',
              data: JSON.parse(json) as RuntimeJsonValue,
              complete: true,
            },
            artifacts: [],
          };
        }
        return {
          value: {
            status: 'ok',
            format: 'json-fragment',
            ...characterWindow(json, offset, 100_000),
          },
          artifacts: [],
        };
      } catch (error) {
        signal.throwIfAborted();
        const code = error instanceof DocumentExtractionError ? error.code : 'failed';
        return { value: { status: 'error', code, message: ERRORS[code] }, artifacts: [] };
      } finally {
        unlink?.();
      }
    },
  };
}
