import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

// Invalidate every list page size without refetching stable URI and preview queries.
export const fileQueryKeys = {
  entries: () => ['/files/entries'] as const,
  previewUri: (entry: FileEntry) => ['files', entry.id, 'preview-uri', entry.updatedAt] as const,
  uri: (entryId: FileEntryId) => ['files', entryId, 'uri'] as const,
  previewUriPage: (entries: readonly FileEntry[]) =>
    ['files', 'preview-uri-page', entries] as const,
};
