import { Directory, File, Paths } from 'expo-file-system';

import type { FileEntry } from '@/shared/data/types/file';

const cacheVersion = 1;

/** Derived image thumbnails, owned by `filePreviewStorage` and removed with their entry. */
export function filePreviewDirectory(): Directory {
  return new Directory(Paths.cache, 'FilePreviewImages');
}

export function imageThumbnailCacheKey(entry: Pick<FileEntry, 'id' | 'updatedAt'>): string {
  return `v${cacheVersion}_${entry.id}_${entry.updatedAt}.webp`;
}

/** Managed image bytes never change, so the entry's revision names its only thumbnail. */
export function deleteFilePreview(entry: Pick<FileEntry, 'id' | 'updatedAt'>): void {
  const thumbnail = new File(filePreviewDirectory(), imageThumbnailCacheKey(entry));
  if (thumbnail.exists) thumbnail.delete();
}
