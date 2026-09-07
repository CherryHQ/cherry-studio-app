import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export const fileQueryKeys = {
  viewerText: (entry: FileEntry, uri: string) =>
    ['/files/entries', entry.id, 'viewer-text', entry.updatedAt, uri] as const,
  previewUri: (entry: FileEntry) =>
    ['/files/entries', entry.id, 'preview-uri', entry.updatedAt] as const,
  uri: (entryId: FileEntryId) => ['/files/entries', entryId, 'uri'] as const,
  previewUriPage: (entries: readonly FileEntry[]) =>
    ['/files/entries', 'preview-uri-page', entries] as const,
};
