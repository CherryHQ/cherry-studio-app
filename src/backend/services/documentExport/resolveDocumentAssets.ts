import { fetch } from 'expo/fetch';

import type { DocumentExportIssue, ExportDocument } from '@/shared/contracts/documentExport';

import { safeExportUrl } from './normalizeDocument';

export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 8_000_000;
const MAX_TOTAL_PIXELS = 16_000_000;
export type PreparedAsset = { dataUrl: string; bytes: number; pixels: number };
export type ReadManagedImage = (id: string, signal: AbortSignal) => Promise<Uint8Array>;

export async function resolveDocumentAssets(
  sources: ReadonlyMap<string, NonNullable<ExportDocument['assets']>[string]>,
  cache: Map<string, PreparedAsset>,
  readManagedImage: ReadManagedImage,
  signal: AbortSignal,
): Promise<{ images: Map<string, string>; issues: DocumentExportIssue[] }> {
  const images = new Map<string, string>();
  const issues: DocumentExportIssue[] = [];
  let totalBytes = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
  let totalPixels = [...cache.values()].reduce((sum, item) => sum + item.pixels, 0);
  for (const [key, source] of sources) {
    signal.throwIfAborted();
    try {
      let asset = cache.get(key);
      if (!asset) {
        const bytes =
          source.kind === 'managed-file'
            ? await readManagedImage(source.fileEntryId, signal)
            : await fetchImage(source.url, signal);
        signal.throwIfAborted();
        if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error('Image exceeds byte limit');
        const { width, height, mediaType } = inspectImage(bytes);
        const pixels = width * height;
        if (
          width < 1 ||
          height < 1 ||
          width > 8192 ||
          height > 8192 ||
          pixels > MAX_IMAGE_PIXELS ||
          totalPixels + pixels > MAX_TOTAL_PIXELS ||
          totalBytes + bytes.byteLength > MAX_TOTAL_BYTES
        ) {
          throw new Error('Image exceeds resource limit');
        }
        asset = {
          bytes: bytes.byteLength,
          pixels,
          dataUrl: `data:${mediaType};base64,${encodeBase64(bytes)}`,
        };
        cache.set(key, asset);
        totalBytes += asset.bytes;
        totalPixels += pixels;
      }
      images.set(key, asset.dataUrl);
    } catch {
      signal.throwIfAborted();
      // Failed resources stay retryable; no private file paths or URLs in diagnostic copy.
      issues.push({ code: 'image-unavailable', label: 'Image' });
    }
  }
  return { images, issues };
}

async function fetchImage(value: string, signal: AbortSignal): Promise<Uint8Array> {
  const url = safeExportUrl(value);
  if (!url?.startsWith('https://') && !url?.startsWith('http://'))
    throw new Error('Invalid image URL');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_ASSET_BYTES)
      throw new Error('Image unavailable');
    reader = response.body?.getReader();
    if (!reader) throw new Error('Image stream unavailable');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_ASSET_BYTES) throw new Error('Image exceeds byte limit');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}

/** Inspect headers before any native decoder sees the source; only still PNG/JPEG are admitted. */
export function inspectImage(bytes: Uint8Array): {
  width: number;
  height: number;
  mediaType: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 33 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    let position = 8;
    let hasEnd = false;
    while (position + 12 <= bytes.length) {
      const size = view.getUint32(position);
      const kind = view.getUint32(position + 4);
      if (
        position + size + 12 > bytes.length ||
        kind === 0x6163544c ||
        (position !== 8 && kind === 0x49484452)
      )
        throw new Error('Invalid or animated PNG');
      if (kind === 0x49454e44) {
        hasEnd = true;
        break;
      }
      position += size + 12;
    }
    if (!hasEnd) throw new Error('Incomplete PNG');
    return { width: view.getUint32(16), height: view.getUint32(20), mediaType: 'image/png' };
  }
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let position = 2;
    while (position + 4 <= bytes.length) {
      if (bytes[position++] !== 0xff) break;
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xd9 || marker === 0xda) break;
      const size = view.getUint16(position);
      if (size < 2 || position + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
        return {
          height: view.getUint16(position + 3),
          width: view.getUint16(position + 5),
          mediaType: 'image/jpeg',
        };
      }
      position += size;
    }
  }
  throw new Error('Unsupported image');
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
