import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';

import { DocumentExportError, type CapturedHtmlPage } from '@/shared/contracts/documentExport';

type CapturePages = (
  onPage: (
    page: CapturedHtmlPage & { left: number; top: number },
    index: number,
    total: number,
    signal: AbortSignal,
  ) => Promise<void>,
) => Promise<void>;

/** Captures viewport-sized tiles to disk, then draws and encodes them on a worker thread. */
export async function stitchCapturedPngPages(
  capture: CapturePages,
  signal: AbortSignal,
): Promise<CapturedHtmlPage> {
  const directory = new Directory(Paths.cache, 'DocumentExportStitch', randomUUID());
  const pages: { file: File; width: number; height: number; left: number; top: number }[] = [];
  let expectedTotal: number | undefined;
  let stitched: CapturedHtmlPage | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (directory.exists) directory.delete();
    } catch {
      /* Best-effort native cache cleanup. */
    }
  };

  try {
    directory.create({ intermediates: true });
    await capture(async (page, index, total, pageSignal) => {
      signal.throwIfAborted();
      pageSignal.throwIfAborted();
      if (
        index !== pages.length ||
        !Number.isSafeInteger(total) ||
        total < 1 ||
        index >= total ||
        (expectedTotal !== undefined && expectedTotal !== total) ||
        ![page.left, page.top, page.width, page.height].every(Number.isSafeInteger) ||
        page.left < 0 ||
        page.top < 0 ||
        page.width < 1 ||
        page.height < 1
      )
        throw new DocumentExportError('capture-failed');
      expectedTotal = total;
      const file = new File(directory, `${String(index).padStart(4, '0')}.png`);
      await new File(page.uri).copy(file);
      pageSignal.throwIfAborted();
      pages.push({ file, width: page.width, height: page.height, left: page.left, top: page.top });
      if (pages.length === total) stitched = await composePages(pageSignal);
    });
    signal.throwIfAborted();
    if (!stitched || !pages.length || pages.length !== expectedTotal)
      throw new DocumentExportError('capture-failed');
    return stitched;
  } catch (error) {
    release();
    // AbortSignal can throw a DOMException from another realm, outside this Error constructor.
    if (
      error instanceof DocumentExportError ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError')
    )
      throw error;
    throw new DocumentExportError('capture-failed');
  }

  async function composePages(operationSignal: AbortSignal): Promise<CapturedHtmlPage> {
    const width = pages.reduce((max, page) => Math.max(max, page.left + page.width), 0);
    const height = pages.reduce((max, page) => Math.max(max, page.top + page.height), 0);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
      throw new DocumentExportError('capture-failed');

    // Single-image mode already accepts full-output allocation. CPU stitching keeps each WebView
    // snapshot bounded while preserving the same final dimensions and lossless PNG output.
    const runtime = createWorkletRuntime({ name: 'DocumentExportStitch' });
    // Pass native host objects explicitly so the worker does not import React Native modules.
    const surface = await runOnRuntimeAsync(
      runtime,
      (skia, width, height) => {
        'worklet';
        return skia.Surface.Make(width, height);
      },
      Skia,
      width,
      height,
    );
    if (!surface) throw new DocumentExportError('capture-failed');
    try {
      for (const page of pages) {
        operationSignal.throwIfAborted();
        const data = await Skia.Data.fromURI(page.file.uri);
        try {
          operationSignal.throwIfAborted();
          await runOnRuntimeAsync(
            runtime,
            (skia, surface, data, width, height, left, top) => {
              'worklet';
              const image = skia.Image.MakeImageFromEncoded(data);
              if (!image) throw new Error('Cannot decode capture tile');
              try {
                if (image.width() !== width || image.height() !== height)
                  throw new Error('Unexpected capture tile dimensions');
                surface.getCanvas().drawImage(image, left, top);
              } finally {
                image.dispose();
              }
            },
            Skia,
            surface,
            data,
            page.width,
            page.height,
            page.left,
            page.top,
          );
        } finally {
          data.dispose();
        }
      }
      operationSignal.throwIfAborted();
      // Await physical completion even on cancellation; the worker still owns these pixels.
      const bytes = await runOnRuntimeAsync(
        runtime,
        (surface, format) => {
          'worklet';
          surface.flush();
          const snapshot = surface.makeImageSnapshot();
          try {
            return snapshot.encodeToBytes(format);
          } finally {
            snapshot.dispose();
          }
        },
        surface,
        ImageFormat.PNG,
      );
      operationSignal.throwIfAborted();
      if (!bytes?.length) throw new DocumentExportError('capture-failed');
      const output = new File(directory, 'stitched.png');
      output.create();
      const handle = output.open(FileMode.WriteOnly);
      try {
        const chunkSize = 256 * 1024;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          operationSignal.throwIfAborted();
          handle.writeBytes(bytes.subarray(offset, offset + chunkSize));
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } finally {
        handle.close();
      }
      operationSignal.throwIfAborted();
      return { uri: output.uri, width, height, release };
    } finally {
      surface.dispose();
    }
  }
}
