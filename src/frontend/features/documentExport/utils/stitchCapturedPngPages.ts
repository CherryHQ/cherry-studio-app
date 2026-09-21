import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { DocumentExportError, type CapturedHtmlPage } from '@/shared/contracts/documentExport';

type CapturePages = (
  onPage: (
    page: CapturedHtmlPage,
    index: number,
    total: number,
    signal: AbortSignal,
  ) => Promise<void>,
) => Promise<void>;

/** Captures bounded strips to disk, then joins them without resizing or recompressing each strip. */
export async function stitchCapturedPngPages(
  capture: CapturePages,
  signal: AbortSignal,
): Promise<CapturedHtmlPage> {
  const directory = new Directory(Paths.cache, 'DocumentExportStitch', randomUUID());
  const pages: { file: File; width: number; height: number }[] = [];
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
        (expectedTotal !== undefined && expectedTotal !== total)
      )
        throw new DocumentExportError('capture-failed');
      expectedTotal = total;
      const file = new File(directory, `${String(index).padStart(4, '0')}.png`);
      await new File(page.uri).copy(file);
      pageSignal.throwIfAborted();
      pages.push({ file, width: page.width, height: page.height });
      if (pages.length === total) stitched = await composePages(pageSignal);
    });
    signal.throwIfAborted();
    if (!stitched || !pages.length || pages.length !== expectedTotal)
      throw new DocumentExportError('capture-failed');
    return stitched;
  } catch (error) {
    release();
    if (
      error instanceof DocumentExportError ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new DocumentExportError('capture-failed');
  }

  async function composePages(operationSignal: AbortSignal): Promise<CapturedHtmlPage> {
    const width = pages[0].width;
    const height = pages.reduce((sum, page) => sum + page.height, 0);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      pages.some((page) => page.width !== width)
    )
      throw new DocumentExportError('capture-failed');

    // Single-image mode already accepts full-output allocation. CPU stitching keeps each WebView
    // snapshot bounded while preserving the same final dimensions and lossless PNG output.
    const surface = Skia.Surface.Make(width, height);
    if (!surface) throw new DocumentExportError('capture-failed');
    try {
      const canvas = surface.getCanvas();
      let top = 0;
      for (const page of pages) {
        operationSignal.throwIfAborted();
        const data = await Skia.Data.fromURI(page.file.uri);
        try {
          const image = Skia.Image.MakeImageFromEncoded(data);
          if (!image) throw new DocumentExportError('capture-failed');
          try {
            if (image.width() !== width || image.height() !== page.height)
              throw new DocumentExportError('capture-failed');
            canvas.drawImage(image, 0, top);
            top += page.height;
          } finally {
            image.dispose();
          }
        } finally {
          data.dispose();
        }
      }
      operationSignal.throwIfAborted();
      surface.flush();
      const snapshot = surface.makeImageSnapshot();
      try {
        const output = new File(directory, 'stitched.png');
        output.write(snapshot.encodeToBytes(ImageFormat.PNG));
        operationSignal.throwIfAborted();
        return { uri: output.uri, width, height, release };
      } finally {
        snapshot.dispose();
      }
    } finally {
      surface.dispose();
    }
  }
}
