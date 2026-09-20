import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  MAX_IMAGE_ATTACHMENT_COUNT,
  MAX_IMAGE_ATTACHMENT_TOTAL_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';
import { imageMediaTypeFromExtension, isImageFileExtension } from '@/shared/utils/imageFileTypes';

const logger = loggerService.withContext('importedImageNormalization');

/** A full picker selection at this ceiling never trips the send-time total-bytes admission. */
export const IMPORTED_IMAGE_MAX_BYTES = Math.floor(
  MAX_IMAGE_ATTACHMENT_TOTAL_BYTES / MAX_IMAGE_ATTACHMENT_COUNT,
);
/** Vision models downscale beyond roughly this edge, so larger pixels only cost upload time. */
const MAX_DIMENSION = 2048;
const MAX_ATTEMPTS = 5;

// PNG ignores encoder quality, so an oversized PNG can only shrink as a JPEG.
// Animated GIFs and formats the encoder cannot write are stored untouched.
const OUTPUT_FORMATS: Readonly<
  Partial<Record<string, { extension: string; format: SaveFormat; mediaType: string }>>
> = {
  'image/jpeg': { extension: 'jpg', format: SaveFormat.JPEG, mediaType: 'image/jpeg' },
  'image/png': { extension: 'jpg', format: SaveFormat.JPEG, mediaType: 'image/jpeg' },
  'image/webp': { extension: 'webp', format: SaveFormat.WEBP, mediaType: 'image/webp' },
};

export type NormalizedImportedImage = {
  mediaType: string;
  name: string;
  /** A temporary file; the caller deletes it once it has been copied into managed storage. */
  uri: string;
};

// A full-resolution decode is tens of megabytes; a multi-photo pick must not hold several at once.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Bounds an imported still image to what a model request can carry, once, before it becomes a
 * managed file. Returns undefined when the source already fits or cannot be re-encoded; import
 * then keeps the original and send-time admission remains the only guard.
 */
export function normalizeImportedImage(input: {
  mediaType?: string;
  name?: string;
  uri: string;
}): Promise<NormalizedImportedImage | undefined> {
  const run = queue.then(() => normalize(input));
  queue = run.catch(() => undefined);
  return run;
}

export function discardNormalizedImage(image: NormalizedImportedImage): void {
  try {
    const file = new File(image.uri);
    if (file.exists) file.delete();
  } catch (error) {
    logger.warn('Failed to discard a normalized image', error as Error);
  }
}

async function normalize(input: {
  mediaType?: string;
  name?: string;
  uri: string;
}): Promise<NormalizedImportedImage | undefined> {
  try {
    const source = new File(input.uri);
    const sourceMediaType = (
      input.mediaType ||
      source.type ||
      imageMediaTypeFromExtension(source.extension.replace(/^\./, ''))
    ).toLowerCase();
    const output = OUTPUT_FORMATS[sourceMediaType];
    const sourceSize = source.size;
    if (!output || !Number.isSafeInteger(sourceSize) || sourceSize <= IMPORTED_IMAGE_MAX_BYTES) {
      return undefined;
    }

    const uri = await encodeWithinLimit(input.uri, output.format);
    if (!uri) return undefined;
    return {
      mediaType: output.mediaType,
      name:
        output.mediaType === sourceMediaType
          ? (input.name ?? source.name)
          : withExtension(input.name ?? source.name, output.extension),
      uri,
    };
  } catch (error) {
    logger.warn('Failed to normalize an imported image; keeping the original', error as Error);
    return undefined;
  }
}

async function encodeWithinLimit(uri: string, format: SaveFormat): Promise<string | undefined> {
  const sourceContext = ImageManipulator.manipulate(uri);
  let sourceImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  try {
    sourceImage = await sourceContext.renderAsync();
    const { width, height } = sourceImage;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }
    let scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      // Every attempt re-renders the original pixels, never an already lossy derivative.
      const context = ImageManipulator.manipulate(sourceImage);
      let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
      let encoded: File | undefined;
      let isAccepted = false;
      try {
        context.resize({
          height: Math.max(1, Math.round(height * scale)),
          width: Math.max(1, Math.round(width * scale)),
        });
        rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({
          compress: Math.max(0.6, 0.85 - attempt * 0.05),
          format,
        });
        encoded = new File(saved.uri);
        const size = encoded.size;
        if (!Number.isSafeInteger(size) || size <= 0) return undefined;
        if (size <= IMPORTED_IMAGE_MAX_BYTES) {
          isAccepted = true;
          return encoded.uri;
        }
        scale *= Math.min(0.8, Math.sqrt(IMPORTED_IMAGE_MAX_BYTES / size) * 0.9);
      } finally {
        rendered?.release();
        context.release();
        if (!isAccepted && encoded?.exists) encoded.delete();
      }
    }
    return undefined;
  } finally {
    sourceImage?.release();
    sourceContext.release();
  }
}

/** The stored name must agree with the encoded bytes, or the on-disk suffix lies about them. */
function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  // A bare name borrows its suffix from the encoded file during filename projection.
  if (dot <= 0) return name;
  return isImageFileExtension(name.slice(dot + 1))
    ? `${name.slice(0, dot)}.${extension}`
    : `${name}.${extension}`;
}
