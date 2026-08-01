import { useQuery as useTanStackQuery } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useEffect } from 'react';
import { useQuery } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { FileUIPart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

const logger = loggerService.withContext('useFilePartUri');

export function useFilePartUri(part: FileUIPart) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId;
  const managedQuery = useQuery('/files/:id/renderable-uri', {
    enabled: Boolean(fileEntryId),
    params: { id: (fileEntryId ?? '') as FileEntryId },
    retry: false,
  });
  const requiresLocalLookup = !fileEntryId && isLocalFileUri(part.url);
  const localQuery = useTanStackQuery({
    enabled: requiresLocalLookup,
    queryFn: () => resolveLocalFileUri(part.url),
    queryKey: ['file-part-uri', fileEntryId ?? null, part.url],
  });

  useEffect(() => {
    if (managedQuery.error && fileEntryId) {
      logger.warn('Failed to resolve managed file entry', managedQuery.error, { fileEntryId });
    }
  }, [fileEntryId, managedQuery.error]);

  if (fileEntryId) {
    return { isLoading: managedQuery.isLoading, uri: managedQuery.data ?? undefined };
  }

  return {
    isLoading: requiresLocalLookup && localQuery.isPending,
    uri: requiresLocalLookup ? localQuery.data : part.url,
  };
}

function resolveLocalFileUri(uri: string): string | undefined {
  try {
    return new File(uri).exists ? uri : undefined;
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
