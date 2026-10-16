/**
 * `image_process`: deterministic pixel work on managed images, so a model can assemble image
 * assets (aligned frames, cut-outs) that generation alone cannot guarantee.
 *
 * Every operation reads conversation-visible files, writes at most one new PNG, and returns
 * measurements plus the result's pixels so the model can judge it before going on.
 */

import { fromByteArray } from 'base64-js';
import * as z from 'zod';

import { decodeRgba, encodePng } from '@/backend/services/file/rgbaImageCodec';
import {
  compareImages,
  opaqueBounds,
  removeFlatBackground,
  type RgbaImage,
  transplantChanges,
} from '@/backend/utils/rgbaImage';
import type { FileEntry } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import type { ManagedFileResolver, TurnFileScope } from '../resources/managedFileResolver';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const IMAGE_PROCESS_TOOL_NAME = 'image_process';

const FileIdSchema = z
  .string()
  .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.');
const RegionSchema = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .describe('Area to consider, as fractions of the image size (0–1 from the top-left).');

export const imageProcessInputSchema = z.strictObject({
  operation: z
    .enum(['resize', 'remove_background', 'transplant', 'measure'])
    .describe(
      [
        '`resize`: fit the image centred on a transparent square of `size` pixels.',
        '`remove_background`: make a flat background colour transparent, flooding from the border.',
        '`transplant`: copy the areas where `other_file_entry_id` differs from `file_entry_id` (within `region`) onto `file_entry_id`, feathered.',
        '`measure`: report the subject bounds and, with `other_file_entry_id`, how much and where the two differ.',
      ].join(' '),
    ),
  file_entry_id: FileIdSchema.describe('The image to process (the base for `transplant`).'),
  other_file_entry_id: FileIdSchema.optional().describe(
    'Second image for `transplant` and `measure`; must have the same pixel size.',
  ),
  size: z.number().int().min(64).max(2048).optional().describe('Square side for `resize`.'),
  region: RegionSchema.optional(),
  tolerance: z
    .number()
    .min(1)
    .max(255)
    .optional()
    .describe('Background colour tolerance for `remove_background` (default 40).'),
  threshold: z
    .number()
    .min(1)
    .max(1020)
    .optional()
    .describe('Per-pixel difference that counts as a change (default 90).'),
});
type ImageProcessInput = z.infer<typeof imageProcessInputSchema>;

export type ImageProcessFiles = Pick<
  ManagedFileResolver,
  'readAsBytes' | 'readImage' | 'resolveAvailable'
> & {
  createInternalEntry(input: {
    data: string;
    mediaType: string;
    name: string;
    provenance: 'generated';
    source: 'base64';
  }): Promise<FileEntry>;
};

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}

export function createImageProcessTool(
  files: ImageProcessFiles,
  scope: TurnFileScope,
): RuntimeTool {
  const load = async (id: string, signal: AbortSignal, square?: number) => {
    const fileEntryId = FileEntryIdSchema.parse(id);
    if (!scope.fileEntryIds.has(fileEntryId)) {
      return { error: `File ${id} is not part of this conversation.` } as const;
    }
    const source = (await files.resolveAvailable([fileEntryId])).get(fileEntryId);
    if (!source) return { error: `File ${id} is unavailable.` } as const;
    if (!isAiSupportedImageMediaType(source.mediaType)) {
      return { error: `File ${id} is not a supported image.` } as const;
    }
    if (source.size > MAX_IMAGE_ATTACHMENT_BYTES) {
      return { error: `File ${id} exceeds the image byte limit.` } as const;
    }
    const bytes = await files.readAsBytes(source, signal);
    if (!bytes) return { error: `File ${id} could not be read.` } as const;
    return { image: decodeRgba(bytes, square), name: source.name } as const;
  };

  return {
    ref: { source: 'builtin', capabilityId: IMAGE_PROCESS_TOOL_NAME },
    providerName: IMAGE_PROCESS_TOOL_NAME,
    displayName: 'Process image',
    description:
      'Deterministic pixel operations on images in this conversation: resize onto a square canvas, remove a flat background, transplant the changed areas of an edited copy back onto the original, and measure subjects or differences. Each call (except `measure`) saves one new PNG and returns it so you can inspect the result.',
    inputSchema: toRuntimeInputSchema(imageProcessInputSchema),
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = imageProcessInputSchema.safeParse(input);
      if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      const request = parsed.data;
      const needsOther = request.operation === 'transplant';
      if (needsOther && !request.other_file_entry_id) {
        return invalid('`transplant` needs `other_file_entry_id`.');
      }
      if (request.operation === 'resize' && !request.size) return invalid('`resize` needs `size`.');
      try {
        const first = await load(request.file_entry_id, signal, request.size);
        if ('error' in first) return invalid(first.error!);
        const other = request.other_file_entry_id
          ? await load(request.other_file_entry_id, signal)
          : null;
        if (other && 'error' in other) return invalid(other.error!);
        const second = other?.image;
        if (
          second &&
          (second.width !== first.image.width || second.height !== first.image.height)
        ) {
          return invalid(
            'Both images must have the same pixel size; `resize` them to the same square first.',
          );
        }
        signal.throwIfAborted();
        return await run(request, first.image, second, first.name, files, signal);
      } catch (error) {
        signal.throwIfAborted();
        return invalid(`The image could not be processed: ${(error as Error).message}`);
      }
    },
  };
}

async function run(
  request: ImageProcessInput,
  image: RgbaImage,
  other: RgbaImage | undefined,
  name: string,
  files: ImageProcessFiles,
  signal: AbortSignal,
): Promise<RuntimeToolResult> {
  const threshold = request.threshold ?? 90;
  if (request.operation === 'measure') {
    return {
      value: {
        status: 'ok',
        width: image.width,
        height: image.height,
        subjectBounds: opaqueBounds(image),
        ...(other && compareImages(image, other, { threshold, region: request.region })),
      },
      artifacts: [],
    };
  }
  let output = image;
  let metrics: Record<string, unknown> = {};
  if (request.operation === 'remove_background') {
    output = removeFlatBackground(image, request.tolerance ?? 40);
    metrics = { subjectBounds: opaqueBounds(output) };
  } else if (request.operation === 'transplant') {
    const result = transplantChanges(image, other!, { threshold, region: request.region });
    output = result.image;
    metrics = { changedRatio: result.changedRatio, changedBounds: result.changedBounds };
  }
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const entry = await files.createInternalEntry({
    data: fromByteArray(encodePng(output)),
    mediaType: 'image/png',
    name: `${base}-${request.operation.replace('_', '-')}.png`,
    provenance: 'generated',
    source: 'base64',
  });
  signal.throwIfAborted();
  const preview = await files.readImage?.(
    {
      fileEntryId: FileEntryIdSchema.parse(entry.id),
      mediaType: entry.mediaType,
      name: entry.filename,
      size: entry.size,
    },
    signal,
  );
  return {
    value: {
      status: 'ok',
      fileEntryId: entry.id,
      filename: entry.filename,
      width: output.width,
      height: output.height,
      ...metrics,
    },
    ...(preview && { modelImages: [{ ...preview, fileEntryId: entry.id }] }),
    artifacts: [
      {
        ref: { kind: 'managed-file', fileEntryId: entry.id },
        mediaType: entry.mediaType,
        name: entry.filename,
        kind: 'derived',
      },
    ],
  };
}
