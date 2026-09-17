import { File, FileMode } from 'expo-file-system';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

export async function capturePng(
  view: Parameters<typeof captureRef>[0],
  plan: { width: number; height: number },
  signal: AbortSignal,
): Promise<Awaited<ReturnType<CaptureExportHtml>>> {
  let screenshotUri: string | undefined;
  const release = () => {
    if (!screenshotUri) return;
    const uri = screenshotUri;
    screenshotUri = undefined;
    try {
      releaseCapture(uri);
    } catch {
      /* Best-effort native cache cleanup. */
    }
  };

  try {
    signal.throwIfAborted();
    screenshotUri = await captureRef(view, { format: 'png', result: 'tmpfile' });
    signal.throwIfAborted();
    const { width, height } = readPngDimensions(screenshotUri);
    if (Math.abs(width - plan.width) > 1 || Math.abs(height - plan.height) > 1) {
      throw new DocumentExportError('capture-failed');
    }
    signal.throwIfAborted();
    return { uri: screenshotUri, width, height, release };
  } catch (error) {
    release();
    throw error;
  }
}

/** Read exact dimensions without loading or decoding the full PNG in JavaScript. */
export function readPngDimensions(uri: string) {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    const bytes = handle.readBytes(24);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      bytes.length < 24 ||
      header.getUint32(0) !== 0x89504e47 ||
      header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 ||
      header.getUint32(12) !== 0x49484452
    ) {
      throw new DocumentExportError('capture-failed');
    }
    const width = header.getUint32(16);
    const height = header.getUint32(20);
    if (width < 1 || height < 1) throw new DocumentExportError('capture-failed');
    return { width, height };
  } finally {
    handle.close();
  }
}
