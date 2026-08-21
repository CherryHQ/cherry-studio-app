import type { FileEntryId } from '@/shared/data/types/file';

export const fileQueryKeys = {
  uri: (entryId: FileEntryId) => ['/files/entries', entryId, 'uri'] as const,
};
