import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

export async function captureWebp(
  view: Parameters<typeof captureRef>[0],
  signal: AbortSignal,
): Promise<Pick<Awaited<ReturnType<CaptureExportHtml>>, 'uri' | 'release'>> {
  let screenshotUri: string | undefined;
  let output: File | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (screenshotUri) releaseCapture(screenshotUri);
    } catch {
      /* Native cache cleanup must not prevent releasing the converted file. */
    }
    try {
      if (output?.exists) output.delete();
    } catch {
      /* The OS may already have evicted the temporary file. */
    }
  };

  try {
    signal.throwIfAborted();
    // view-shot's historical "webm" option encodes WebP. Android 10+ makes
    // quality 100 lossless; older Android and iOS need the Skia encoder.
    const directWebp = Platform.OS === 'android' && Number(Platform.Version) >= 29;
    screenshotUri = await captureRef(view, {
      format: directWebp ? 'webm' : 'png',
      quality: 1,
      result: 'tmpfile',
    });
    signal.throwIfAborted();
    if (directWebp) return { uri: screenshotUri, release };

    const source = await new File(screenshotUri).bytes();
    signal.throwIfAborted();
    // Decode and encode off the JS/UI threads; the runtime belongs to this job.
    const runtime = createWorkletRuntime({ name: 'Document export WebP' });
    const bytes = await runOnRuntimeAsync(
      runtime,
      (encoded: Uint8Array) => {
        'worklet';
        const data = Skia.Data.fromBytes(encoded);
        let image: SkImage | null | undefined;
        try {
          image = Skia.Image.MakeImageFromEncoded(data);
          // Skia explicitly selects lossless WebP at quality 100.
          return image?.encodeToBytes(ImageFormat.WEBP, 100);
        } finally {
          image?.dispose();
          data.dispose();
        }
      },
      source,
    );
    signal.throwIfAborted();
    if (!bytes?.length) throw new DocumentExportError('capture-failed');
    output = new File(Paths.cache, `document-export-${randomUUID()}.webp`);
    output.write(bytes);
    return { uri: output.uri, release };
  } catch (error) {
    release();
    throw error;
  }
}
