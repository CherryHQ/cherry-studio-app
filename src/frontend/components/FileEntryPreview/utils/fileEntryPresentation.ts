import type { FileEntry } from '@cherrystudio/universal/data/types/file';

export function fileEntryDisplayName(entry: Pick<FileEntry, 'ext' | 'name'>): string {
  return entry.ext ? `${entry.name}.${entry.ext}` : entry.name;
}

export function fileEntryExtensionLabel(entry: Pick<FileEntry, 'ext'>): string {
  return entry.ext?.slice(0, 5).toUpperCase() ?? '';
}
