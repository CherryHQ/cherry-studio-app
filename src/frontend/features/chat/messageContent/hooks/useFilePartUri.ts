import type { FileUIPart } from '@cherrystudio/universal/data/types/message';
import { useQuery as useTanStackQuery } from '@tanstack/react-query';
import { File } from 'expo-file-system';

import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('useFilePartUri');

export function useFilePartUri(part: FileUIPart) {
  const requiresLocalLookup = isLocalFileUri(part.url);
  const localQuery = useTanStackQuery({
    enabled: requiresLocalLookup,
    queryFn: () => resolveLocalFileUri(part.url),
    queryKey: ['file-part-uri', part.url],
  });

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
