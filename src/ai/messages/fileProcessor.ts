/**
 * Mobile file reader for AI message parts.
 *
 * Cherry's v2 messages may store `FileUIPart.url` as `file://` or `content://`
 * (Android). AI SDK's `convertToModelMessages` won't fetch these URIs, so we
 * inline the bytes as base64 data URLs before they reach the provider.
 *
 * PDF native vs text-extraction routing lives in `attachmentRouting.ts`.
 */

import { File } from 'expo-file-system';

import type { FileUIPart } from '@/data/types/message';

const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

/**
 * Read a local-file URI from a `FileUIPart` into a base64 data URL.
 *
 * Accepts both `file://` and `content://` (Android) URIs. Leaves `data:` /
 * `https:` / `http:` URLs untouched. Returns `null` on failure so the caller
 * can degrade gracefully (e.g. to a text note) rather than abort the request.
 */
export async function materializeNativeFilePart(part: FileUIPart): Promise<FileUIPart | null> {
  const url = part.url;
  if (!url) return part;
  if (!url.startsWith('file://') && !url.startsWith('content://')) return part;

  try {
    const file = new File(url);
    const base64 = await file.base64();
    const mediaType = file.type || part.mediaType || FALLBACK_MEDIA_TYPE;
    return { ...part, mediaType, url: `data:${mediaType};base64,${base64}` };
  } catch {
    return null;
  }
}
