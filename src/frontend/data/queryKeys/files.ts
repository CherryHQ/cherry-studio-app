import type { FileEntryId } from '@cherrystudio/universal/data/types/file';

export const fileQueryKeys = {
  uri: (entryId: FileEntryId) => ['/files/entries', entryId, 'uri'] as const,
};
