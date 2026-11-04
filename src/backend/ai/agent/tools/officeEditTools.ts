import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  OfficeGenerationError,
  officeEditSchemas,
  officeInspectSchema,
  officeReadSchema,
  OFFICE_MAX_FILE_BYTES,
  OFFICE_MAX_IMAGES,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  transformOfficeFile,
  type OfficeFormat,
  type OfficeTransformRequest,
} from '@/backend/services/office';

import type { RuntimeTool } from '../runtime';
import {
  mebibytes,
  normalizeOfficeFilename,
  officeFailure as invalid,
  prepareOfficeImages,
  startOfficeOperation,
  type OfficeFiles,
} from './officeToolResources';
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
      'List Word body paragraphs, Excel sheet names, or PowerPoint slides and shape ids. Use kind "structure" for Word tables/headers/footers/notes/comments/changes/fields; Excel sheet statistics, error cells and missing formula caches; or PowerPoint shapes with resolved boxes, explicit run fonts and overlap/off-slide findings. PPT boxes include group transforms and layout/master placeholder inheritance; text overflow still needs rendering. Formula values are saved caches, never recalculated. finding_offset pages up to 100 Excel/PPT findings within the selected sheets/slides. Use kind "images" to list supported DrawingML pictures with anchors, names, alt text and replacement eligibility; headers/footers/masters/backgrounds and legacy VML images are not listed. Image indexes are zero-based; PowerPoint uses slide and shape ids. Use kind "check" to check package XML, content types, relationships, ids and comment references. Optional against_file_entry_id compares an untouched original and reports only new findings. Findings are successful inspection results; errors and warnings count all findings before pagination. Paginated; returns source_sha256 for edits. Text excerpts may be shortened; use read_office_content for exact text.',
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
    description: `Create a NEW edited ${format.toUpperCase()} copy; source_sha256 must match a prior inspection/read. ${format === 'xlsx' ? 'Change scalar cells on one worksheet; retain other package parts, images and charts. Strings are literal, null clears a cell. Reject shared/array/data-table formulas and merged followers. Cell edits request recalculation on open; cached formula results may be stale.' : 'Replace one unique literal text occurrence per anchored paragraph (or its optional Word character range); expect_text must match the complete current text. Preserve surrounding runs, formatting and hyperlinks. Fields, drawings, bookmarks, comments and tracked changes in the target paragraph are refused for text edits.'} Optionally replace up to ${OFFICE_MAX_IMAGES} existing pictures through images, using anchors from inspect_office_file kind "images" and existing image file ids (attachments, generated images or workspace files; large ones are compressed automatically, never regenerate one). Image-only edits are allowed. Replacement affects only the selected occurrence and keeps its frame, crop, transforms and alt text; it does not auto-fit a different aspect ratio. To add new pictures to an existing file, use run_office_script. Unsupported picture extensions and external images are refused. Never overwrites the original.`,
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
      description: `${definition.description} Source and output are limited to ${mebibytes(OFFICE_MAX_FILE_BYTES)}. Use managed file ids from conversation attachments or the selected workspace; no paths or URLs. Edited copies are saved in the selected workspace, or at the library root without a workspace. ${definition.operation === 'edit' ? 'In Code Mode, use result.value.fileEntryId for the new copy.' : 'Inspection returns items: Word items have excerpt and anchor; Excel items have sheet; PowerPoint items have slide and shapes. Exact reads return text or rows of cells with address and value. Use the returned source_sha256 for edits.'} In Code Mode, a failed call throws its message.`,
      inputSchema: toRuntimeInputSchema(definition.schema),
      outputSchema: officeToolOutputSchemas[definition.name],
      approval: 'auto',
      deferred: true,
      async execute({ input, signal }) {
        signal.throwIfAborted();
        if (new TextEncoder().encode(JSON.stringify(input)).length > OFFICE_MAX_INPUT_BYTES)
          return invalid('Office input exceeds 128 KiB.');
        const parsed = definition.schema.safeParse(input);
        if (!parsed.success) return invalid(z.prettifyError(parsed.error));
        const againstId =
          'against_file_entry_id' in parsed.data ? parsed.data.against_file_entry_id : undefined;
        if (againstId && (!('kind' in parsed.data) || parsed.data.kind !== 'check'))
          return invalid('against_file_entry_id is only supported for kind check.');
        const sourceId = await access.resolveRead(parsed.data);
        const imageIds =
          'images' in parsed.data
            ? [...new Set(parsed.data.images?.map((image) => image.file_entry_id) ?? [])]
            : [];
        // Authorize every input before reading any source, comparison or image bytes.
        for (const id of [...imageIds, ...(againstId ? [againstId] : [])]) {
          signal.throwIfAborted();
          await access.resolveRead({ file_entry_id: id });
        }
        const operation = await startOfficeOperation(files, signal);
        try {
          const facts = await files.resolveAvailable([sourceId, ...(againstId ? [againstId] : [])]);
          signal.throwIfAborted();
          const fact = facts.get(sourceId);
          const uri = fact && files.localUri(fact);
          const size = uri && files.size(uri);
          if (!fact || !uri || !size) return invalid('Source file is unavailable.');
          if (size > OFFICE_MAX_FILE_BYTES)
            return invalid(
              `The source file is ${mebibytes(size)}, over the ${mebibytes(OFFICE_MAX_FILE_BYTES)} limit for Office files on this device.`,
            );
          const format = (Object.keys(OFFICE_MEDIA_TYPES) as OfficeFormat[]).find(
            (format) => OFFICE_MEDIA_TYPES[format] === fact.mediaType,
          );
          if (!format) return invalid('Only DOCX, XLSX and PPTX files are supported.');
          let against: { uri: string; size: number } | undefined;
          if (againstId) {
            const original = facts.get(againstId);
            const originalUri = original && files.localUri(original);
            const originalSize = originalUri && files.size(originalUri);
            if (!originalUri || !originalSize || original?.mediaType !== fact.mediaType)
              return invalid('The comparison must be an available Office file of the same format.');
            if (originalSize > OFFICE_MAX_FILE_BYTES)
              return invalid('The comparison file exceeds the 64 MiB Office limit.');
            against = { uri: originalUri, size: originalSize };
          }
          if (
            ('format' in definition && definition.format !== format) ||
            ('anchor' in parsed.data && parsed.data.anchor.format !== format)
          )
            return invalid('Operation format does not match the source file.');
          const digest = await files.hash(uri, signal);
          signal.throwIfAborted();
          if ('source_sha256' in parsed.data && parsed.data.source_sha256 !== digest)
            return invalid('Source file changed. Inspect/read it again before editing.');
          let filename = '';
          if ('filename' in parsed.data) {
            const normalized = normalizeOfficeFilename(parsed.data.filename, format);
            if (!normalized) return invalid(`Use a plain filename ending in .${format}.`);
            filename = normalized;
          }
          const request = {
            ...parsed.data,
            operation: definition.operation,
            format,
            ...(against ? { against: true } : {}),
          } as OfficeTransformRequest;
          const images = await prepareOfficeImages(imageIds, files, operation, signal);
          const output = definition.operation === 'edit' ? operation.output(format) : undefined;
          const result = await transformOfficeFile({
            source: { uri, size },
            against,
            request,
            images,
            output,
            sandbox,
            signal,
            onSettled: operation.job(),
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
                ...(againstId ? { against_file_entry_id: againstId } : {}),
              },
              artifacts: [],
            };
          const sha256 = await files.hash(output!, signal);
          const entry = await files.createFileEntry(
            {
              uri: output!,
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
              sha256,
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
          operation.finish();
        }
      },
    }),
  );
}
