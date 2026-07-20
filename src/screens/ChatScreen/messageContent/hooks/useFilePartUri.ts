import { File } from 'expo-file-system';

import { loggerService } from '@/core/logger/LoggerService';
import { useDataQuery } from '@/data/hooks';
import type { FileUIPart } from '@/data/types/message';
import { readCherryMeta } from '@/data/types/uiParts';

const logger = loggerService.withContext('useFilePartUri');

type ResolveFileEntryUri = (fileEntryId: string) => Promise<string | undefined>;

export function useFilePartUri(part: FileUIPart) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId;
  const requiresLookup = Boolean(fileEntryId) || isLocalFileUri(part.url);
  const query = useDataQuery({
    enabled: requiresLookup,
    queryFn: (services) => resolveFilePartUri(part, (id) => services.fileEntry.resolveUri(id)),
    queryKey: ['file-part-uri', fileEntryId ?? null, part.url],
  });

  return {
    isLoading: requiresLookup && query.isPending,
    uri: requiresLookup ? query.data : part.url,
  };
}

export async function resolveFilePartUri(
  part: FileUIPart,
  resolveFileEntryUri: ResolveFileEntryUri,
): Promise<string | undefined> {
  const fileEntryId = readCherryMeta(part)?.fileEntryId;

  if (fileEntryId) {
    try {
      const managedUri = await resolveFileEntryUri(fileEntryId);
      if (managedUri) {
        return managedUri;
      }
      logger.warn('Managed file entry is unavailable', { fileEntryId });
    } catch (error) {
      logger.warn('Failed to resolve managed file entry', toError(error), { fileEntryId });
    }

    return undefined;
  }

  if (!isLocalFileUri(part.url)) {
    return part.url;
  }

  try {
    return new File(part.url).exists ? part.url : undefined;
  } catch (error) {
    logger.warn('Failed to inspect file URI', toError(error));
    return undefined;
  }
}

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('content://');
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
