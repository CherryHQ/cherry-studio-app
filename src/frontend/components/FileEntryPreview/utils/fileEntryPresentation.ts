import type { FilePreviewFile, FilePreviewKind } from '@cherrystudio/ui/components';

import { type FileEntry, filenameExtension } from '@/shared/data/types/file';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'filename'>): string {
  return entry.filename;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'filename'>): string {
  return filenameExtension(entry.filename)?.slice(0, 5).toUpperCase() ?? '';
}

const kindByMediaType = new Map<string, FilePreviewKind>([['application/pdf', 'pdf']]);

// Audio and video are deliberately absent: nothing previews them yet, so they
// stay `document` until a renderer exists to key off a name of their own.
const kindByMediaTypePrefix: readonly (readonly [string, FilePreviewKind])[] = [
  ['image/', 'image'],
  ['text/', 'text'],
];

/**
 * Classifies more finely than CherryUI renders today. An unclaimed kind falls
 * back to the platform preview, so naming `pdf` or `video` now costs nothing
 * and is the key a registered preview plugin matches on later.
 */
export function fileEntryPreviewKind(entry: Pick<FileEntry, 'mediaType'>): FilePreviewKind {
  // Media types carry parameters — `text/plain; charset=utf-8` — that the exact
  // lookup must not see.
  const mediaType = entry.mediaType.split(';')[0]?.trim().toLowerCase() ?? '';

  return (
    kindByMediaType.get(mediaType) ??
    kindByMediaTypePrefix.find(([prefix]) => mediaType.startsWith(prefix))?.[1] ??
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
