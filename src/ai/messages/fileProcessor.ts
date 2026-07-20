/**
 * Mobile file resolver for AI message parts.
 *
 * Cherry's v2 messages may store `FileUIPart.url` as `file://...`.
 * AI SDK's `convertToModelMessages` won't fetch `file://` URLs. Desktop
 * rewrites those with Node fs; mobile uses Expo FileSystem to produce data URLs.
 */

import { File } from 'expo-file-system';

import { loggerService } from '@/core/logger/LoggerService';
import type { FileUIPart } from '@/data/types/message';
import { readCherryMeta } from '@/data/types/uiParts';

const FALLBACK_MEDIA_TYPE = 'application/octet-stream';
const logger = loggerService.withContext('fileProcessor');

export type ResolveFileEntryUri = (fileEntryId: string) => Promise<string | undefined>;

/**
 * Resolve a managed file before falling back to the wire URL. Local files are
 * rewritten to data URLs because the AI SDK cannot fetch device-only URIs.
 */
export async function resolveFileUIPart(
  part: FileUIPart,
  resolveFileEntryUri?: ResolveFileEntryUri,
): Promise<FileUIPart | null> {
  const fileEntryId = readCherryMeta(part)?.fileEntryId;
  let managedUri: string | undefined;

  if (fileEntryId && resolveFileEntryUri) {
    try {
      managedUri = await resolveFileEntryUri(fileEntryId);
    } catch (error) {
      logger.warn('Failed to resolve managed file entry', toError(error), { fileEntryId });
    }

    if (!managedUri) {
      logger.warn('Managed file entry is unavailable', { fileEntryId });
    } else {
      const resolved = await readLocalFilePart(part, managedUri, fileEntryId, 'managed');
      if (resolved) {
        return resolved;
      }
    }
  }

  if (part.url === managedUri) {
    return null;
  }

  if (!isLocalFileUri(part.url)) {
    return part;
  }

  return readLocalFilePart(part, part.url, fileEntryId, 'fallback');
}

async function readLocalFilePart(
  part: FileUIPart,
  uri: string,
  fileEntryId: string | undefined,
  source: 'fallback' | 'managed',
): Promise<FileUIPart | null> {
  try {
    const file = new File(uri);
    const base64 = await file.base64();
    const mediaType = file.type || part.mediaType || FALLBACK_MEDIA_TYPE;
    return { ...part, mediaType, url: `data:${mediaType};base64,${base64}` };
  } catch (error) {
    logger.warn('Failed to read attachment for AI request', toError(error), {
      fileEntryId,
      source,
    });
    return null;
  }
}

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('content://');
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
