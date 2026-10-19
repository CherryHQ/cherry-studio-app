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
import { officeOperationSlots, readOfficeImages, type OfficeFiles } from './officeToolResources';
import { officeToolOutputSchemas } from './officeToolResults';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const definitions = [
  {
    name: 'inspect_office_file',
    title: 'Inspect Office file',
    operation: 'inspect',
    schema: officeInspectSchema,
    description:
      'List Word body paragraphs, Excel sheet names, or PowerPoint slides and shape ids. Use kind "images" to list DrawingML pictures in the Word body (including tables), worksheets or slides, with anchors, names, alt text and replacement eligibility. Image indexes are zero-based; PowerPoint uses slide and shape ids. Headers, footers, masters, backgrounds and legacy VML images are not listed. Paginated; returns source_sha256 for edits. Text excerpts may be shortened; use read_office_content for exact text.',
  },
  {
    name: 'read_office_content',
    title: 'Read Office content',
    operation: 'read',
    schema: officeReadSchema,
    description:
      'Read an exact Word body paragraph, Excel A1 range (up to 1000 cells), or PowerPoint shape/table-cell paragraph. Returns source_sha256 and exact text for edits. Excel rows is a two-dimensional array of cell objects: result.value.rows.flat().find(cell => cell.address === "B2")?.value reads B2. Spreadsheet formulas expose saved cached values; this tool does not calculate.',
  },
  ...(['docx', 'xlsx', 'pptx'] as const).map((format) => ({
    name: ({ docx: 'edit_document', xlsx: 'edit_workbook', pptx: 'edit_presentation' } as const)[
      format
    ],
    title: { docx: 'Edit document', xlsx: 'Edit workbook', pptx: 'Edit presentation' }[format],
    operation: 'edit',
    format,
    schema: officeEditSchemas[format],
    description: `Create a NEW edited ${format.toUpperCase()} copy; source_sha256 must match a prior inspection/read. ${format === 'xlsx' ? 'Change scalar cells on one worksheet; retain other package parts, images and charts. Strings are literal, null clears a cell. Reject shared/array/data-table formulas and merged followers. Cell edits request recalculation on open; cached formula results may be stale.' : 'Replace one unique literal text occurrence per anchored paragraph (or its optional Word character range); expect_text must match the complete current text. Preserve surrounding runs, formatting and hyperlinks. Fields, drawings, bookmarks, comments and tracked changes in the target paragraph are refused for text edits.'} Optionally replace up to 8 existing pictures through images, using anchors from inspect_office_file kind "images" and authorized PNG/JPEG file_entry_id values. Image-only edits are allowed. Replacement affects only the selected occurrence and keeps its frame, crop, transforms and alt text; it does not auto-fit a different aspect ratio. Images together must fit 2 MiB. Unsupported picture extensions and external images are refused. Never overwrites the original.`,
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
      description: `${definition.description} Source and output are limited to 4 MiB. Use managed file ids from conversation attachments or the selected workspace; no paths or URLs. Edited copies are saved in the selected workspace, or at the library root without a workspace. ${definition.operation === 'edit' ? 'In Code Mode, success is result.value.status === "created"; use result.value.fileEntryId for the new copy.' : 'In Code Mode, success is result.value.status === "read". Inspection returns items: Word items have excerpt and anchor; Excel items have sheet; PowerPoint items have slide and shapes. Exact reads return text or rows of cells with address and value. Use the returned source_sha256 for edits.'} Status "error" includes a message.`,
      inputSchema: toRuntimeInputSchema(definition.schema),
      outputSchema: officeToolOutputSchemas[definition.name],
      approval: 'auto',
      deferred: true,
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
        const imageIds =
          'images' in parsed.data
            ? [...new Set(parsed.data.images?.map((image) => image.file_entry_id) ?? [])]
            : [];
        // Authorize every replacement before reading any source or image bytes.
        for (const id of imageIds) {
          signal.throwIfAborted();
          await access.resolveRead({ file_entry_id: id });
        }
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
          const images = await readOfficeImages(imageIds, files, signal);
          settled = false;
          const result = await transformOfficeFile({
            bytes,
            request,
            images,
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
              ...(format === 'xlsx' && 'cells' in parsed.data && parsed.data.cells?.length
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
