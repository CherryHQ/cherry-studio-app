import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  OfficeGenerationError,
  officeEditSchemas,
  officeInspectSchema,
  officeReadSchema,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  transformOfficeFile,
  type OfficeFormat,
  type OfficeTransformRequest,
} from '@/backend/services/office';
import { filenameExtension, SafeNameSchema } from '@/shared/data/types/file';
import { sha256Hex } from '@/shared/utils/sha256';

import type { RuntimeTool } from '../runtime';
import { officeOperationSlots, type OfficeFiles } from './officeToolResources';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const definitions = [
  {
    name: 'inspect_office_file',
    title: 'Inspect Office file',
    operation: 'inspect',
    schema: officeInspectSchema,
    description:
      'List Word body paragraphs, Excel sheet names, or PowerPoint slides and shape ids. Paginated, bounded structural inspection; returns source_sha256 for edits. Text excerpts may be shortened; use read_office_content for exact text.',
  },
  {
    name: 'read_office_content',
    title: 'Read Office content',
    operation: 'read',
    schema: officeReadSchema,
    description:
      'Read an exact Word body paragraph, Excel A1 range (up to 1000 cells), or PowerPoint shape/table-cell paragraph. Returns source_sha256 and exact text for edits. Spreadsheet formulas expose saved cached values; this tool does not calculate.',
  },
  ...(['docx', 'xlsx', 'pptx'] as const).map((format) => ({
    name: { docx: 'edit_document', xlsx: 'edit_workbook', pptx: 'edit_presentation' }[format],
    title: { docx: 'Edit document', xlsx: 'Edit workbook', pptx: 'Edit presentation' }[format],
    operation: 'edit',
    format,
    schema: officeEditSchemas[format],
    description: `Create a NEW edited ${format.toUpperCase()} copy; source_sha256 must match a prior inspection/read. ${format === 'xlsx' ? 'Change scalar cells on one worksheet; retain other package parts, images and charts. Strings are literal, null clears a cell. Reject shared/array/data-table formulas and merged followers. Excel recalculates on open; cached formula results may be stale.' : 'Replace one unique literal text occurrence per anchored paragraph (or its optional Word character range); expect_text must match the complete current text. Preserve surrounding runs, formatting and hyperlinks. Fields, drawings, bookmarks, comments and tracked changes in the target paragraph are refused.'} Never overwrites the original.`,
  })),
] as const;

export function createOfficeEditTools(
  sandbox: JsSandbox,
  files: OfficeFiles,
  access: Pick<WorkspaceFileAccess, 'resolveRead' | 'folderId'>,
): RuntimeTool[] {
  return definitions.map(
    (definition): RuntimeTool => ({
      ref: { source: 'builtin', capabilityId: definition.name },
      providerName: definition.name,
      displayName: definition.title,
      description: `${definition.description} Source and output are limited to 4 MiB. Use managed file ids from conversation attachments or the selected workspace; no paths or URLs. Edited copies are saved in the selected workspace, or at the library root without a workspace.`,
      inputSchema: toRuntimeInputSchema(definition.schema),
      approval: 'auto',
      async execute({ input, signal }) {
        signal.throwIfAborted();
        const invalid = (message: string) => ({
          value: { status: 'error', message },
          artifacts: [],
        });
        if (new TextEncoder().encode(JSON.stringify(input)).length > OFFICE_MAX_INPUT_BYTES)
          return invalid('Office input exceeds 128 KiB.');
        const parsed = definition.schema.safeParse(input);
        if (!parsed.success) return invalid(z.prettifyError(parsed.error));
        const sourceId = await access.resolveRead(parsed.data);
        const release = await officeOperationSlots.acquire(signal);
        let settled = true,
          finished = false;
        try {
          const facts = await files.resolveAvailable([sourceId]);
          signal.throwIfAborted();
          const fact = facts.get(sourceId);
          if (
            !fact ||
            !Number.isSafeInteger(fact.size) ||
            fact.size <= 0 ||
            fact.size > 4 * 1024 * 1024
          )
            return invalid('Source file is unavailable or exceeds 4 MiB.');
          const format = (Object.keys(OFFICE_MEDIA_TYPES) as OfficeFormat[]).find(
            (format) => OFFICE_MEDIA_TYPES[format] === fact.mediaType,
          );
          if (!format) return invalid('Only DOCX, XLSX and PPTX files are supported.');
          if (
            ('format' in definition && definition.format !== format) ||
            ('anchor' in parsed.data && parsed.data.anchor.format !== format)
          )
            return invalid('Operation format does not match the source file.');
          const bytes = await files.readAsBytes(fact, signal);
          signal.throwIfAborted();
          if (!bytes || bytes.length !== fact.size || bytes.length > 4 * 1024 * 1024)
            return invalid('Source bytes changed or are unavailable.');
          const digest = sha256Hex(bytes);
          if ('source_sha256' in parsed.data && parsed.data.source_sha256 !== digest)
            return invalid('Source file changed. Inspect/read it again before editing.');
          let filename = '';
          if ('filename' in parsed.data) {
            const extension = filenameExtension(parsed.data.filename);
            filename = extension ? parsed.data.filename : `${parsed.data.filename}.${format}`;
            if ((extension && extension !== format) || !SafeNameSchema.safeParse(filename).success)
              return invalid(`Use a plain filename ending in .${format}.`);
          }
          const request = {
            ...parsed.data,
            operation: definition.operation,
            format,
          } as OfficeTransformRequest;
          settled = false;
          const result = await transformOfficeFile({
            bytes,
            request,
            sandbox,
            signal,
            onSettled: () => {
              settled = true;
              if (finished) release();
            },
          });
          signal.throwIfAborted();
          if ('content' in result)
            return {
              value: {
                ...result.content,
                status: 'read',
                file_entry_id: sourceId,
                source_sha256: digest,
                format,
              },
              artifacts: [],
            };
          const entry = await files.createBytesEntry(
            {
              data: result.data,
              name: filename,
              mediaType: OFFICE_MEDIA_TYPES[format],
              provenance: 'generated',
              folderId: access.folderId,
              workspaceFolderId: access.folderId,
            },
            signal,
          );
          return {
            value: {
              status: 'created',
              fileEntryId: entry.id,
              filename: entry.filename,
              mediaType: entry.mediaType,
              size: entry.size,
              source_file_entry_id: sourceId,
              source_sha256: digest,
              sha256: sha256Hex(result.data),
              ...(format === 'xlsx'
                ? {
                    warnings: [
                      'Formula caches are not recalculated here. Excel is requested to recalculate on open.',
                    ],
                  }
                : {}),
            },
            artifacts: [
              {
                ref: { kind: 'managed-file', fileEntryId: entry.id },
                mediaType: entry.mediaType,
                name: entry.filename,
                kind: 'derived',
              },
            ],
          };
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof OfficeGenerationError) return invalid(error.message);
          throw error;
        } finally {
          finished = true;
          if (settled) release();
        }
      },
    }),
  );
}
