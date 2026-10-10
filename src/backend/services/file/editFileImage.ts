import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import type { ResolvedFile } from '@/shared/contracts/file';
import {
  canEditFileImage,
  EditFileImageInputSchema,
  type EditFileImageInput,
} from '@/shared/contracts/fileImageEdit';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { nextVersionFilename, type FileEntry } from '@/shared/data/types/file';

import { generateFilePreviewUri } from './filePreviewStorage';
import { createInternalEntry, discardInternalEntries, resolveFileEntry } from './fileStorage';

const logger = loggerService.withContext('editFileImage');

/** Pixel writes and managed-file ownership stay behind the file module. */
export async function editFileImage(
  input: EditFileImageInput,
  signal?: AbortSignal,
): Promise<ResolvedFile> {
  const edit = EditFileImageInputSchema.parse(input);
  signal?.throwIfAborted();
  const source = await resolveFileEntry(fileEntryService, edit.fileEntryId);
  if (!source || !canEditFileImage(source.entry.mediaType)) {
    throw new Error('This file is not an editable still image.');
  }
  signal?.throwIfAborted();

  const context = ImageManipulator.manipulate(source.uri);
  let rotated: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let cropContext: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let cropped: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let temporary: File | undefined;
  let entry: FileEntry | undefined;
  let committed = false;
  try {
    if (edit.rotation) context.rotate(edit.rotation);
    rotated = await context.renderAsync();
    signal?.throwIfAborted();
    const { width, height } = rotated;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new Error('Invalid image dimensions.');
    }
    // Round boundaries rather than width separately, keeping every rectangle inside the pixels.
    const originX = Math.min(width - 1, Math.round(edit.crop.x * width));
    const originY = Math.min(height - 1, Math.round(edit.crop.y * height));
    const right = Math.min(
      width,
      Math.max(originX + 1, Math.round((edit.crop.x + edit.crop.width) * width)),
    );
    const bottom = Math.min(
      height,
      Math.max(originY + 1, Math.round((edit.crop.y + edit.crop.height) * height)),
    );
    cropContext = ImageManipulator.manipulate(rotated);
    cropContext.crop({ originX, originY, width: right - originX, height: bottom - originY });
    cropped = await cropContext.renderAsync();
    signal?.throwIfAborted();
    const format =
      source.entry.mediaType === 'image/jpeg'
        ? SaveFormat.JPEG
        : source.entry.mediaType === 'image/webp'
          ? SaveFormat.WEBP
          : SaveFormat.PNG;
    const saved = await cropped.saveAsync({ format, compress: 1 });
    temporary = new File(saved.uri);
    signal?.throwIfAborted();
    entry = await createInternalEntry(
      fileEntryService,
      {
        uri: saved.uri,
        name: nextVersionFilename(source.entry.filename),
        mediaType: source.entry.mediaType,
        provenance: source.entry.provenance,
        source: 'uri',
      },
      signal,
    );
    signal?.throwIfAborted();
    await generateFilePreviewUri(entry);
    signal?.throwIfAborted();
    const resolved = await resolveFileEntry(fileEntryService, entry.id);
    if (!resolved) throw new Error('Edited image cannot be resolved.');
    signal?.throwIfAborted();
    committed = true;
    return resolved;
  } finally {
    cropped?.release();
    cropContext?.release();
    rotated?.release();
    context.release();
    try {
      if (temporary?.exists) temporary.delete();
    } catch (error) {
      logger.warn('Failed to discard image editing cache', error as Error);
    }
    if (!committed && entry) await discardInternalEntries(fileEntryService, [entry]);
  }
}
