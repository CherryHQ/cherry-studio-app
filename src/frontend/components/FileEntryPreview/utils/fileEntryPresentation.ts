import type { FilePreviewFile } from '@cherrystudio/ui/components';

import { type FileEntry, filenameExtension } from '@/shared/data/types/file';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'filename'>): string {
  return entry.filename;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'filename'>): string {
  return filenameExtension(entry.filename)?.slice(0, 5).toUpperCase() ?? '';
}

export type FileEntryKind = 'document' | 'html' | 'image' | 'markdown' | 'text';

const kindByMediaType = new Map<string, FileEntryKind>([
  ['text/html', 'html'],
  ['text/markdown', 'markdown'],
  ['application/json', 'text'],
  ['application/xml', 'text'],
  ['application/yaml', 'text'],
  ['application/x-yaml', 'text'],
]);

/** One product vocabulary for file surfaces and their opening policy. */
export function fileEntryPreviewKind(entry: Pick<FileEntry, 'mediaType'>): FileEntryKind {
  // Media types carry parameters — `text/plain; charset=utf-8` — that the exact
  // lookup must not see.
  const mediaType = entry.mediaType.split(';')[0]?.trim().toLowerCase() ?? '';

  return (
    kindByMediaType.get(mediaType) ??
    (mediaType.startsWith('image/') ? 'image' : undefined) ??
    (mediaType.startsWith('text/') ? 'text' : undefined) ??
    'document'
  );
}

/**
 * The whole mapping from a managed entry to CherryUI's neutral descriptor, so
 * every caller classifies and labels files the same way.
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
    kind: fileEntryPreviewKind(entry),
    previewUri,
    revision: entry.updatedAt,
    uri,
  };
}
