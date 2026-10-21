import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  generateOfficeFile,
  OfficeGenerationError,
  officeImageIds,
  officeInputSchemas,
  OFFICE_MAX_FILE_BYTES,
  OFFICE_MAX_IMAGES,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  type OfficeFormat,
  type OfficeRequest,
} from '@/backend/services/office';
import { filenameExtension, SafeNameSchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../runtime';
import { createOfficeEditTools } from './officeEditTools';
import { createOfficeScriptTool } from './officeScriptTool';
import {
  mebibytes,
  officeFailure as invalid,
  prepareOfficeImages,
  startOfficeOperation,
  type OfficeFiles,
} from './officeToolResources';
import { officeToolOutputSchemas } from './officeToolResults';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const formats: readonly {
  format: OfficeFormat;
  name: 'create_document' | 'create_workbook' | 'create_presentation';
  displayName: string;
  description: string;
}[] = [
  {
    format: 'docx',
    name: 'create_document',
    displayName: 'Create document',
    description:
      'Create a Word (.docx) file from version 1 blocks: paragraphs, headings, lists, simple tables and managed PNG/JPEG images.',
  },
  {
    format: 'xlsx',
    name: 'create_workbook',
    displayName: 'Create workbook',
    description:
      'Create an Excel (.xlsx) file from version 1 sheets of typed scalar cells, with optional column widths, numeric formats and managed PNG/JPEG images anchored to cells. Strings are literal text; formulas and charts are unsupported.',
  },
  {
    format: 'pptx',
    name: 'create_presentation',
    displayName: 'Create presentation',
    description:
      'Create a widescreen PowerPoint (.pptx) file from version 1 title, bullet, simple table and managed PNG/JPEG image slides, using a light or dark theme.',
  },
];

export function createOfficeTools(
  sandbox: JsSandbox,
  files: OfficeFiles,
  access: Pick<WorkspaceFileAccess, 'resolveRead' | 'folderId'>,
): RuntimeTool[] {
  const generators = formats.map(
    ({ format, name, displayName, description }): RuntimeTool => ({
      ref: { source: 'builtin', capabilityId: name },
      providerName: name,
      displayName,
      description: `${description} Saves a new managed file in the selected workspace, or at the library root without a workspace, and returns its attachment; never overwrites or edits a source. Images may come from conversation attachments, generated images or the selected workspace: pass their existing file ids, never regenerate an image to place it. Up to ${OFFICE_MAX_IMAGES} distinct images per file in any image format; large ones are compressed for embedding automatically. Input JSON must fit 128 KiB; the output is limited to ${mebibytes(OFFICE_MAX_FILE_BYTES)}. Use a plain filename with the matching extension. In Code Mode, use result.value.fileEntryId; a failed call throws its message. store() changes survive only a successful script. Finish a short creation script after storing ids, then perform dependent reads and edits in another script.`,
      inputSchema: toRuntimeInputSchema(officeInputSchemas[format]),
      outputSchema: officeToolOutputSchemas[name],
      approval: 'auto',
      deferred: true,
      async execute({ input, signal }) {
        signal.throwIfAborted();
        if (new TextEncoder().encode(JSON.stringify(input)).length > OFFICE_MAX_INPUT_BYTES) {
          return invalid(
            'Input exceeds 128 KiB. Reduce the content or split it into separate files.',
          );
        }
        const parsed = officeInputSchemas[format].safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const extension = filenameExtension(parsed.data.filename);
        const filename = extension ? parsed.data.filename : `${parsed.data.filename}.${format}`;
        if ((extension && extension !== format) || !SafeNameSchema.safeParse(filename).success) {
          return invalid(`Use a plain filename ending in .${format}.`);
        }
        // The schema and format are selected together from officeInputSchemas above.
        const request = { ...parsed.data, filename, format } as OfficeRequest;
        const ids = officeImageIds(request);
        if (ids.length > OFFICE_MAX_IMAGES)
          return invalid(
            `This file uses ${ids.length} distinct images; one file accepts at most ${OFFICE_MAX_IMAGES}.`,
          );
        for (const id of ids) {
          signal.throwIfAborted();
          await access.resolveRead({ file_entry_id: id });
        }

        const operation = await startOfficeOperation(files, signal);
        try {
          const images = await prepareOfficeImages(ids, files, operation, signal);
          const output = operation.output(format);
          await generateOfficeFile({
            request,
            images,
            output,
            sandbox,
            signal,
            onSettled: operation.job(),
          });
          signal.throwIfAborted();
          const entry = await files.createFileEntry(
            {
              uri: output,
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
            },
            artifacts: [
              {
                ref: { kind: 'managed-file', fileEntryId: entry.id },
                mediaType: entry.mediaType,
                name: entry.filename,
                kind: 'created',
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
  return [
    ...generators,
    ...createOfficeEditTools(sandbox, files, access),
    createOfficeScriptTool(sandbox, files, access),
  ];
}
