import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export const fileQueryKeys = {
  documentPreviewPage: () => ['files', 'document-preview-page'] as const,
  imageDimensions: (entry: Pick<FileEntry, 'id' | 'updatedAt'>, uri: string) =>
    ['files', entry.id, 'image-dimensions', entry.updatedAt, uri] as const,
  viewerText: (entry: Pick<FileEntry, 'id' | 'updatedAt'>, uri: string) =>
    ['files', entry.id, 'viewer-text', entry.updatedAt, uri] as const,
  previewUri: (entry: FileEntry) => ['files', entry.id, 'preview-uri', entry.updatedAt] as const,
  trashThumbnailUri: (id: FileEntryId, deletedAt: number) =>
    ['files', id, 'trash-thumbnail-uri', deletedAt] as const,
  uri: (entryId: FileEntryId) => ['files', entryId, 'uri'] as const,
  previewUriPage: (entries: readonly FileEntry[]) =>
    ['files', 'preview-uri-page', entries] as const,
};
