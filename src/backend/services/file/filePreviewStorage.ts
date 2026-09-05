import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { ResolvedFileUris } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntry } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  createInternalEntry,
  type CreateInternalEntryInput,
  createMessageParts,
  getInternalFileUri,
} from './fileStorage';

const logger = loggerService.withContext('FilePreviewStorage');
const thumbnailDirectory = new Directory(Paths.cache, 'FilePreviewImages');
const cacheVersion = 1;
const maxConcurrentGenerations = 2;
const thumbnailMaxDimension = 512;
const webpQuality = 0.78;
const pendingThumbnails = new Map<string, Promise<string>>();
const generationQueue: (() => void)[] = [];
let activeGenerations = 0;

export async function createInternalEntryWithPreview(
  entries: Pick<FileEntryService, 'create'>,
  input: CreateInternalEntryInput,
): Promise<FileEntry> {
  const entry = await createInternalEntry(entries, input);
  await resolveFilePreviewUris(entry);
  return entry;
}

export async function createMessagePartsWithPreviews(
  entries: Pick<FileEntryService, 'create' | 'delete'>,
  parts: readonly CherryMessagePart[],
): Promise<{ entries: FileEntry[]; parts: CherryMessagePart[] }> {
  const managed = await createMessageParts(entries, parts);
  await Promise.all(managed.entries.map(resolveFilePreviewUris));
  return managed;
}

export async function resolveFilePreviewUris(entry: FileEntry): Promise<ResolvedFileUris> {
  const resolved = resolveCachedFilePreviewUris(entry);
  if (resolved.previewUri || !resolved.uri) {
    return resolved;
  }

  return { previewUri: await generateFilePreviewUri(entry), uri: resolved.uri };
}

export function resolveCachedFilePreviewUris(entry: FileEntry): ResolvedFileUris {
  const uri = getInternalFileUri(entry);
  if (!uri) {
    return { previewUri: undefined, uri: undefined };
  }
  if (!entry.mediaType.startsWith('image/')) {
    return { previewUri: uri, uri };
  }

  const destination = new File(thumbnailDirectory, imageThumbnailCacheKey(entry));
  return { previewUri: destination.exists ? destination.uri : undefined, uri };
}

export async function generateFilePreviewUri(entry: FileEntry): Promise<string | undefined> {
  const resolved = resolveCachedFilePreviewUris(entry);
  if (!resolved.uri || resolved.previewUri) {
    return resolved.previewUri;
  }

  try {
    return await getImageThumbnailUri(entry, resolved.uri);
  } catch (error) {
    logger.warn('Failed to generate an image preview; using the original file', error as Error, {
      id: entry.id,
    });
    return resolved.uri;
  }
}

export function imageThumbnailCacheKey(entry: Pick<FileEntry, 'id' | 'updatedAt'>): string {
  return `v${cacheVersion}_${entry.id}_${entry.updatedAt}.webp`;
}

async function getImageThumbnailUri(entry: FileEntry, sourceUri: string): Promise<string> {
  const destination = new File(thumbnailDirectory, imageThumbnailCacheKey(entry));
  if (destination.exists) {
    return destination.uri;
  }

  const pending = pendingThumbnails.get(destination.uri);
  if (pending) {
    return pending;
  }

  const generation = scheduleGeneration(() => generateThumbnail(sourceUri, destination)).finally(
    () => {
      pendingThumbnails.delete(destination.uri);
    },
  );
  pendingThumbnails.set(destination.uri, generation);
  return generation;
}

async function generateThumbnail(sourceUri: string, destination: File): Promise<string> {
  if (!thumbnailDirectory.exists) {
    thumbnailDirectory.create({ intermediates: true });
  }

  const sourceContext = ImageManipulator.manipulate(sourceUri);
  let sourceImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  let outputContext: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let outputImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  let temporaryFile: File | undefined;

  try {
    sourceImage = await sourceContext.renderAsync();
    const longestDimension = Math.max(sourceImage.width, sourceImage.height);
    if (!Number.isFinite(longestDimension) || longestDimension <= 0) {
      throw new Error('Image preview source has invalid dimensions');
    }

    const scale = Math.min(1, thumbnailMaxDimension / longestDimension);
    outputContext = ImageManipulator.manipulate(sourceImage);
    outputContext.resize({
      height: Math.max(1, Math.round(sourceImage.height * scale)),
      width: Math.max(1, Math.round(sourceImage.width * scale)),
    });
    outputImage = await outputContext.renderAsync();
    const result = await outputImage.saveAsync({ compress: webpQuality, format: SaveFormat.WEBP });
    temporaryFile = new File(result.uri);

    if (destination.exists) {
      if (temporaryFile.exists) {
        temporaryFile.delete();
      }
      return destination.uri;
    }

    await temporaryFile.move(destination);
    return destination.uri;
  } finally {
    outputImage?.release();
    outputContext?.release();
    sourceImage?.release();
    sourceContext.release();
  }
}

function scheduleGeneration<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeGenerations += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeGenerations -= 1;
          drainGenerationQueue();
        });
    };
    generationQueue.push(run);
    drainGenerationQueue();
  });
}

function drainGenerationQueue() {
  const availableSlots = maxConcurrentGenerations - activeGenerations;
  for (let slot = 0; slot < availableSlots; slot += 1) {
    const next = generationQueue.shift();
    if (!next) {
      return;
    }
    next();
  }
}
