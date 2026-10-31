import type { FilePreviewFile } from '@cherrystudio/ui/components';

import { type FileEntry, filenameExtension } from '@/shared/data/types/file';
import { isAudioMediaType } from '@/shared/utils/audioFileTypes';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'filename'>): string {
  return entry.filename;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'filename'>): string {
  return filenameExtension(entry.filename)?.slice(0, 5).toUpperCase() ?? '';
}

export type FileEntryKind = 'audio' | 'document' | 'html' | 'image' | 'markdown' | 'text';

const kindByMediaType = new Map<string, FileEntryKind>([
  ['text/html', 'html'],
  ['text/markdown', 'markdown'],
  // iOS reports Markdown picked from Files under its legacy type.
  ['text/x-markdown', 'markdown'],
  ['application/json', 'text'],
  ['application/xml', 'text'],
  ['application/yaml', 'text'],
  ['application/x-yaml', 'text'],
  ['text/rtf', 'document'],
]);

/** One product vocabulary for file surfaces and their opening policy. */
export function fileEntryPreviewKind(entry: Pick<FileEntry, 'mediaType'>): FileEntryKind {
  // Media types carry parameters — `text/plain; charset=utf-8` — that the exact
  // lookup must not see.
  const mediaType = entry.mediaType.split(';')[0]?.trim().toLowerCase() ?? '';

  return (
    kindByMediaType.get(mediaType) ??
    (isAudioMediaType(mediaType) ? 'audio' : undefined) ??
    (mediaType.startsWith('image/') ? 'image' : undefined) ??
    (mediaType.startsWith('text/') ? 'text' : undefined) ??
    'document'
  );
}

const inAppDocumentMediaTypes = new Set([
  'application/pdf',
  'application/rtf',
  'text/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** PDF, RTF and Office Open XML documents open in the app; other documents open with the system. */
export function canPreviewDocument(entry: Pick<FileEntry, 'mediaType'>): boolean {
  return inAppDocumentMediaTypes.has(entry.mediaType.split(';')[0]?.trim().toLowerCase() ?? '');
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
