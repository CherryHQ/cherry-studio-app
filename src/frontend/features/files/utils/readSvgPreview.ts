import { File } from 'expo-file-system';

const MAX_SVG_PREVIEW_BYTES = 4 * 1024 * 1024;

export async function readSvgPreview(uri: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const file = new File(uri);
  if (file.size > MAX_SVG_PREVIEW_BYTES) throw new Error('SVG exceeds its preview size limit');
  const data = await file.base64();
  signal.throwIfAborted();
  if (data.length > Math.ceil(MAX_SVG_PREVIEW_BYTES / 3) * 4)
    throw new Error('SVG exceeds its preview size limit');
  return data;
}
