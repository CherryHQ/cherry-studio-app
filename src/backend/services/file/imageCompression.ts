import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_COMPRESSED_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;
const MAX_ATTEMPTS = 6;

/** A request-only derivative. The managed original and its media type never change. */
export async function compressImageDataUrl(
  uri: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted();
  const format =
    mediaType === 'image/jpeg'
      ? SaveFormat.JPEG
      : mediaType === 'image/png'
        ? SaveFormat.PNG
        : mediaType === 'image/webp'
          ? SaveFormat.WEBP
          : undefined;
  // Preserve animated GIFs rather than silently replacing them with a still frame.
  if (!format) return undefined;

  const source = new File(uri);
  const sourceSize = source.size;
  if (!source.exists || !Number.isSafeInteger(sourceSize) || sourceSize <= 0) return undefined;

  const sourceContext = ImageManipulator.manipulate(uri);
  let sourceImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  try {
    sourceImage = await sourceContext.renderAsync();
    signal?.throwIfAborted();
    const { width, height } = sourceImage;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }
    let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      signal?.throwIfAborted();
      const context = ImageManipulator.manipulate(sourceImage);
      let output: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
      let temporary: File | undefined;
      try {
        context.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        });
        output = await context.renderAsync();
        signal?.throwIfAborted();
        const saved = await output.saveAsync({
          compress: Math.max(0.6, 0.85 - attempt * 0.05),
          format,
        });
        temporary = new File(saved.uri);
        signal?.throwIfAborted();
        const size = temporary.size;
        if (!Number.isSafeInteger(size) || size <= 0) return undefined;
        if (size <= MAX_COMPRESSED_BYTES && size < sourceSize) {
          const base64 = await temporary.base64();
          signal?.throwIfAborted();
          return `data:${mediaType};base64,${base64}`;
        }
        // Re-render from the original pixels, never from an already lossy derivative.
        scale *= Math.min(0.8, Math.sqrt(Math.min(MAX_COMPRESSED_BYTES, sourceSize) / size) * 0.9);
      } finally {
        output?.release();
        context.release();
        if (temporary?.exists) temporary.delete();
      }
    }
    return undefined;
  } finally {
    sourceImage?.release();
    sourceContext.release();
  }
}
