import type { FilePreviewFile } from '@cherrystudio/ui/components';

import { type FileEntry, filenameExtension } from '@/shared/data/types/file';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'filename'>): string {
  return entry.filename;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'filename'>): string {
  return filenameExtension(entry.filename)?.slice(0, 5).toUpperCase() ?? '';
}

/**
 * The whole mapping from a managed entry to CherryUI's neutral descriptor, so
 * every caller classifies images and labels extensions the same way.
 */
export function toFilePreviewFile(
  entry: FileEntry,
  uri: string,
  previewUri?: string,
): FilePreviewFile {
  return {
    displayName: fileEntryDisplayName(entry),
    extensionLabel: fileEntryExtensionLabel(entry),
    id: entry.id,
    kind: entry.mediaType.startsWith('image/') ? 'image' : 'document',
    previewUri,
    revision: entry.updatedAt,
    uri,
  };
}
