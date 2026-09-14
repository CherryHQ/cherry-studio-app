import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import type { ImageCapturePlan } from './imageCapturePlan';

// Bundle Mode evaluates the whole bundle in each runtime. Reuse one background
// encoder instead of starting a JS engine and thread for every screenshot.
let encodingRuntime: ReturnType<typeof createWorkletRuntime> | undefined;

export async function captureWebp(
  view: Parameters<typeof captureRef>[0],
  plan: ImageCapturePlan,
  signal: AbortSignal,
): Promise<Awaited<ReturnType<CaptureExportHtml>>> {
  let screenshotUri: string | undefined;
  let output: File | undefined;
  const releaseScreenshot = () => {
    if (!screenshotUri) return;
    const uri = screenshotUri;
    screenshotUri = undefined;
    try {
      releaseCapture(uri);
    } catch {
      /* Native cache cleanup must not prevent releasing the converted file. */
    }
  };
  const release = () => {
    releaseScreenshot();
    try {
      if (output?.exists) output.delete();
    } catch {
      /* Best-effort cleanup. */
    }
  };

  try {
    signal.throwIfAborted();
    screenshotUri = await captureRef(view, { format: 'png', result: 'tmpfile' });
    signal.throwIfAborted();
    const source = await new File(screenshotUri).bytes();
    releaseScreenshot();
    signal.throwIfAborted();
    encodingRuntime ??= createWorkletRuntime({ name: 'Document export WebP' });
    const encoded = await runOnRuntimeAsync(
      encodingRuntime,
      encodeWebpWorklet,
      source,
      plan.width,
      plan.height,
    );
    signal.throwIfAborted();
    if (!encoded.bytes?.length) throw new DocumentExportError('capture-failed');
    output = new File(Paths.cache, `document-export-${randomUUID()}.webp`);
    output.write(encoded.bytes);
    return { uri: output.uri, width: encoded.width, height: encoded.height, release };
  } catch (error) {
    release();
    throw error;
  }
}

function encodeWebpWorklet(encoded: Uint8Array, width: number, height: number) {
  'worklet';
  const data = Skia.Data.fromBytes(encoded);
  let image: SkImage | null | undefined;
  try {
    image = Skia.Image.MakeImageFromEncoded(data);
    if (!image || Math.abs(image.width() - width) > 1 || Math.abs(image.height() - height) > 1)
      throw new Error('Screenshot dimensions changed');
    // Quality 100 selects lossless WebP; the decoded image needs no extra canvas.
    return {
      bytes: image.encodeToBytes(ImageFormat.WEBP, 100),
      width: image.width(),
      height: image.height(),
    };
  } finally {
    image?.dispose();
    data.dispose();
  }
}
