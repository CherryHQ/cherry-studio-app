import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  generateOfficeFile,
  OfficeGenerationError,
  officeImageIds,
  officeInputSchemas,
  OFFICE_MAX_IMAGE_BYTES,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  type OfficeFormat,
  type OfficeImage,
  type OfficeRequest,
} from '@/backend/services/office';
import { FileEntryIdSchema, filenameExtension, SafeNameSchema } from '@/shared/data/types/file';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { createOfficeEditTools } from './officeEditTools';
import { officeOperationSlots, type OfficeFiles } from './officeToolResources';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const formats: readonly {
  format: OfficeFormat;
  name: string;
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
      description: `${description} Saves a new managed file in the selected workspace, or at the library root without a workspace, and returns its attachment; never overwrites or edits a source. Images may come from conversation attachments or the selected workspace. Input JSON must fit 128 KiB; images together must fit 2 MiB; output is limited to 4 MiB. Use a plain filename with the matching extension.`,
      inputSchema: toRuntimeInputSchema(officeInputSchemas[format]),
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
        if (ids.length > 8) return invalid('Use at most 8 distinct images per file.');
        for (const id of ids) {
          signal.throwIfAborted();
          await access.resolveRead({ file_entry_id: id });
        }

        const release = await officeOperationSlots.acquire(signal);
        let nativeSettled = true;
        let finished = false;
        try {
          const images = await readImages(ids, files, signal);
          nativeSettled = false;
          const data = await generateOfficeFile({
            request,
            images,
            sandbox,
            signal,
            onSettled: () => {
              nativeSettled = true;
              if (finished) release();
            },
          });
          signal.throwIfAborted();
          const entry = await files.createBytesEntry(
            {
              data,
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
          finished = true;
          if (nativeSettled) release();
        }
      },
    }),
  );
  return [...generators, ...createOfficeEditTools(sandbox, files, access)];
}

async function readImages(
  ids: string[],
  files: OfficeFiles,
  signal: AbortSignal,
): Promise<Record<string, OfficeImage>> {
  const images: Record<string, OfficeImage> = {};
  if (!ids.length) return images;
  const facts = await files.resolveAvailable(ids.map((id) => FileEntryIdSchema.parse(id)));
  signal.throwIfAborted();
  let totalBytes = 0;
  for (const id of ids) {
    const fact = facts.get(id);
    if (
      !fact ||
      !Number.isSafeInteger(fact.size) ||
      fact.size <= 0 ||
      !['image/png', 'image/jpeg'].includes(fact.mediaType)
    ) {
      throw new OfficeGenerationError('An image is unavailable or is not PNG/JPEG.');
    }
    totalBytes += fact.size;
  }
  if (totalBytes > OFFICE_MAX_IMAGE_BYTES)
    throw new OfficeGenerationError('Images exceed 2 MiB. Use smaller images.');
  let encodedBytes = 0;
  for (const id of ids) {
    signal.throwIfAborted();
    const image = await files.readImage?.(facts.get(id)!, signal);
    signal.throwIfAborted();
    if (!image || (image.mediaType !== 'image/png' && image.mediaType !== 'image/jpeg')) {
      throw new OfficeGenerationError('An image could not be read as PNG/JPEG.');
    }
    encodedBytes += Math.ceil(image.data.length / 4) * 3;
    if (encodedBytes > OFFICE_MAX_IMAGE_BYTES)
      throw new OfficeGenerationError(
        'Images exceed 2 MiB after normalization. Use smaller images.',
      );
    images[id] = { data: image.data, mediaType: image.mediaType };
  }
  return images;
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
