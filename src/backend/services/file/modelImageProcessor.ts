import { fromByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { loggerService } from '@/shared/core/logger/LoggerService';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

const logger = loggerService.withContext('ModelImageProcessor');
const MAX_ATTEMPTS = 5;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
let queue: Promise<unknown> = Promise.resolve();

/** Keep at most one tool image's decoded pixels in memory during fitting. */
export function createNativeModelImageProcessor() {
  const prepare: typeof prepareImage = (bytes, mimeType, limits) => {
    const run = queue.then(() => prepareImage(bytes, mimeType, limits));
    queue = run.catch(() => undefined);
    return run;
  };
  return { prepare };
}

async function prepareImage(
  bytes: Uint8Array,
  mimeType: string,
  limits: { readonly maxWidth: number; readonly maxHeight: number; readonly maxBytes: number },
) {
  const declaredMime = mimeType.trim().toLowerCase();
  const maxWidth = Math.floor(limits.maxWidth);
  const maxHeight = Math.floor(limits.maxHeight);
  const rawByteLimit = Math.floor((limits.maxBytes * 3) / 4);
  if (limits.maxBytes < 4 || Math.min(maxWidth, maxHeight, bytes.byteLength) < 1) return undefined;

  const detectedMime = detectImageContainerMimeType(bytes);
  if (detectedMime === undefined) return undefined;
  const header = readImageHeaderInfo(bytes, detectedMime);
  if (!header || !validDimensions(header.width, header.height)) return undefined;

  const canPassThrough =
    detectedMime === declaredMime &&
    isAiSupportedImageMediaType(detectedMime) &&
    !header.needsOrientation &&
    header.width <= maxWidth &&
    header.height <= maxHeight &&
    base64Length(bytes.byteLength) <= limits.maxBytes;

  // Expo renders a single frame; keep an inline animated GIF/WebP intact or omit it.
  if (!canPassThrough && header.animated) return undefined;

  let source: File | undefined;
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let image: ImageRef | undefined;
  try {
    const directory = new Directory(Paths.cache, 'ModelImages');
    directory.create({ idempotent: true, intermediates: true });
    source = new File(directory, `model-image-${randomUUID()}`);
    source.create();
    await source.write(bytes);
    context = ImageManipulator.manipulate(source.uri, { maxWidth, maxHeight });
    image = await context.renderAsync();
    if (!validDimensions(image.width, image.height)) return undefined;
    if (canPassThrough) return { data: fromByteArray(bytes), mimeType: detectedMime };

    const originalWidth = header.width;
    const originalHeight = header.height;
    const format = detectedMime === 'image/webp' ? SaveFormat.WEBP : SaveFormat.JPEG;
    const outputMimeType = format === SaveFormat.WEBP ? 'image/webp' : 'image/jpeg';
    let scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const outputContext = ImageManipulator.manipulate(image);
      let rendered: ImageRef | undefined;
      try {
        if (scale < 1) {
          outputContext.resize({
            width: Math.max(1, Math.round(image.width * scale)),
            height: Math.max(1, Math.round(image.height * scale)),
          });
        }
        rendered = await outputContext.renderAsync();
        if (attempt === 0 && detectedMime === 'image/png') {
          const pngAttempt = await encodeAttempt(
            rendered,
            { format: SaveFormat.PNG },
            'image/png',
            declaredMime,
            originalWidth,
            originalHeight,
            maxWidth,
            maxHeight,
            limits.maxBytes,
          );
          if (pngAttempt.kind === 'ok') return pngAttempt.result;
          if (pngAttempt.kind === 'invalid') return undefined;
        }
        const fallbackAttempt = await encodeAttempt(
          rendered,
          { compress: (85 - attempt * 5) / 100, format },
          outputMimeType,
          declaredMime,
          originalWidth,
          originalHeight,
          maxWidth,
          maxHeight,
          limits.maxBytes,
        );
        if (fallbackAttempt.kind === 'ok') return fallbackAttempt.result;
        if (fallbackAttempt.kind === 'invalid') return undefined;
        scale *= Math.min(0.8, Math.sqrt(Math.max(1, rawByteLimit) / fallbackAttempt.size) * 0.9);
      } finally {
        release(rendered);
        release(outputContext);
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    release(image);
    release(context);
    deleteTemporaryFile(source);
  }
}

async function encodeAttempt(
  rendered: ImageRef,
  saveOptions: { format: SaveFormat; compress?: number },
  outputMimeType: string,
  declaredMime: string,
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
  maxBytes: number,
) {
  let encoded: File | undefined;
  try {
    const saved = await rendered.saveAsync(saveOptions);
    encoded = new File(saved.uri);
    const { size } = encoded;
    if (!Number.isSafeInteger(size) || size <= 0) return { kind: 'invalid' as const };
    if (
      base64Length(size) <= maxBytes &&
      validDimensions(saved.width, saved.height) &&
      saved.width <= maxWidth &&
      saved.height <= maxHeight
    ) {
      return {
        kind: 'ok' as const,
        result: {
          data: fromByteArray(await encoded.bytes()),
          mimeType: outputMimeType,
          ...(originalWidth !== saved.width || originalHeight !== saved.height
            ? {
                resized: {
                  from: { width: originalWidth, height: originalHeight },
                  to: { width: saved.width, height: saved.height },
                },
              }
            : {}),
          ...(outputMimeType !== declaredMime ? { convertedFrom: declaredMime } : {}),
        },
      };
    }
    return { kind: 'too-large' as const, size };
  } finally {
    deleteTemporaryFile(encoded);
  }
}

function detectImageContainerMimeType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return bytes[3] === 0xf7 ? undefined : 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return isStaticPng(bytes) ? 'image/png' : undefined;
  if (startsWithAscii(bytes, 0, 'GIF87a') || startsWithAscii(bytes, 0, 'GIF89a'))
    return 'image/gif';
  if (startsWithAscii(bytes, 0, 'RIFF') && startsWithAscii(bytes, 8, 'WEBP')) return 'image/webp';
  if (startsWithAscii(bytes, 0, 'BM')) return 'image/bmp';
  return undefined;
}

type ImageHeaderInfo = {
  width: number;
  height: number;
  needsOrientation?: boolean;
  animated?: boolean;
};

function readImageHeaderInfo(bytes: Uint8Array, mimeType: string): ImageHeaderInfo | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (mimeType) {
    case 'image/png':
      return bytes.length < 24
        ? undefined
        : { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    case 'image/gif':
      return bytes.length < 13
        ? undefined
        : {
            width: view.getUint16(6, true),
            height: view.getUint16(8, true),
            ...(isAnimatedGif(bytes) ? { animated: true } : {}),
          };
    case 'image/webp':
      return readWebpHeaderInfo(bytes, view);
    case 'image/jpeg':
      return readJpegHeaderInfo(bytes, view);
    case 'image/bmp': {
      if (bytes.length < 26) return undefined;
      const dibHeaderSize = view.getUint32(14, true);
      if (dibHeaderSize === 12) {
        return { width: view.getUint16(18, true), height: view.getUint16(20, true) };
      }
      if (dibHeaderSize >= 40) {
        const rawHeight = view.getInt32(22, true);
        if (rawHeight === -0x80000000) return undefined;
        return { width: view.getInt32(18, true), height: Math.abs(rawHeight) };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function isStaticPng(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 24 ||
    view.getUint32(PNG_SIGNATURE.length, false) !== 13 ||
    !startsWithAscii(bytes, 12, 'IHDR')
  ) {
    return false;
  }
  for (let offset = PNG_SIGNATURE.length; offset + 8 <= bytes.length;) {
    if (startsWithAscii(bytes, offset + 4, 'acTL')) return false;
    if (startsWithAscii(bytes, offset + 4, 'IDAT')) return true;
    const nextOffset = offset + 8 + view.getUint32(offset, false) + 4;
    if (nextOffset <= offset || nextOffset > bytes.length) return true;
    offset = nextOffset;
  }
  return true;
}

function isAnimatedGif(bytes: Uint8Array): boolean {
  let offset = 13;
  const screenPacked = bytes[10] ?? 0;
  if ((screenPacked & 0x80) !== 0) offset += 3 * (1 << ((screenPacked & 0x07) + 1));

  let frames = 0;
  while (offset < bytes.length) {
    const introducer = bytes[offset++];
    if (introducer === 0x3b) return frames !== 1;
    if (introducer === 0x2c) {
      frames++;
      if (frames >= 2 || offset + 9 > bytes.length) return true;
      const imagePacked = bytes[offset + 8] ?? 0;
      offset += 9;
      if ((imagePacked & 0x80) !== 0) offset += 3 * (1 << ((imagePacked & 0x07) + 1));
      if (offset >= bytes.length) return true;
      offset += 1;
    } else if (introducer === 0x21) {
      if (offset >= bytes.length) return true;
      offset += 1;
    } else {
      return true;
    }
    while (offset < bytes.length) {
      const size = bytes[offset++] ?? 0;
      if (size === 0) break;
      offset += size;
      if (offset > bytes.length) return true;
    }
    if (offset > bytes.length) return true;
  }
  return true;
}

function readWebpHeaderInfo(bytes: Uint8Array, view: DataView): ImageHeaderInfo | undefined {
  if (bytes.length < 30) return undefined;
  if (startsWithAscii(bytes, 12, 'VP8 ')) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (startsWithAscii(bytes, 12, 'VP8L')) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (startsWithAscii(bytes, 12, 'VP8X')) {
    if (view.getUint32(16, true) !== 10) return undefined;
    const uint24 = (pos: number) => view.getUint16(pos, true) + ((bytes[pos + 2] ?? 0) << 16);
    const animated = ((bytes[20] ?? 0) & 0x02) !== 0;
    return { width: uint24(24) + 1, height: uint24(27) + 1, ...(animated ? { animated } : {}) };
  }
  return undefined;
}

function readJpegHeaderInfo(bytes: Uint8Array, view: DataView): ImageHeaderInfo | undefined {
  let dimensions: { width: number; height: number } | undefined;
  let orientation: number | undefined;

  for (let offset = 2; offset + 1 < bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) offset++;
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = view.getUint16(offset + 2, false);
    const segmentEnd = offset + 2 + length;
    if (length < 2 || segmentEnd > bytes.length) break;

    if (
      marker === 0xe1 &&
      orientation === undefined &&
      offset + 10 <= segmentEnd &&
      startsWithAscii(bytes, offset + 4, 'Exif\0\0')
    ) {
      orientation = readTiffOrientation(bytes, offset + 10, segmentEnd);
    } else if (
      dimensions === undefined &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      offset + 9 <= segmentEnd
    ) {
      dimensions = {
        width: view.getUint16(offset + 7, false),
        height: view.getUint16(offset + 5, false),
      };
    }
    if (dimensions !== undefined && orientation !== undefined) break;
    offset = segmentEnd;
  }

  if (!dimensions) return undefined;
  if (orientation === undefined) return dimensions;
  const swapped = orientation >= 5 && orientation <= 8;
  return {
    width: swapped ? dimensions.height : dimensions.width,
    height: swapped ? dimensions.width : dimensions.height,
    ...(orientation !== 1 ? { needsOrientation: true } : {}),
  };
}

function readTiffOrientation(
  bytes: Uint8Array,
  tiffStart: number,
  end: number,
): number | undefined {
  if (tiffStart + 8 > end) return undefined;
  const littleEndian = startsWithAscii(bytes, tiffStart, 'II')
    ? true
    : startsWithAscii(bytes, tiffStart, 'MM')
      ? false
      : undefined;
  if (littleEndian === undefined) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return undefined;
  const ifdStart = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
  if (ifdStart < tiffStart || ifdStart + 2 > end) return undefined;
  const entryCount = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, littleEndian) !== 0x0112) continue;
    if (
      view.getUint16(entry + 2, littleEndian) !== 3 ||
      view.getUint32(entry + 4, littleEndian) < 1
    )
      return undefined;
    const orientation = view.getUint16(entry + 8, littleEndian);
    return orientation >= 1 && orientation <= 8 ? orientation : undefined;
  }
  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
}

function startsWithAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

function validDimensions(width: number, height: number): boolean {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
}

function release(resource: { release(): void } | undefined): void {
  try {
    resource?.release();
  } catch (error) {
    logger.warn('Failed to release a model image resource', { error });
  }
}

function deleteTemporaryFile(file: File | undefined): void {
  try {
    if (file?.exists) file.delete();
  } catch (error) {
    logger.warn('Failed to delete a temporary model image', { error });
  }
}
