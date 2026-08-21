import { type FileEntry, filenameExtension } from '@/shared/data/types/file';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'filename'>): string {
  return entry.filename;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'filename'>): string {
  return filenameExtension(entry.filename)?.slice(0, 5).toUpperCase() ?? '';
}
