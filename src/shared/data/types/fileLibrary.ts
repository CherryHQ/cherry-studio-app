import * as z from 'zod';

import { DataApiErrorFactory } from '@/shared/data/api/errors';

import { FileEntrySchema, SafeNameSchema, TimestampSchema } from './file';

export const FileFolderSchema = z.strictObject({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: SafeNameSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: TimestampSchema.nullable(),
});
export type FileFolder = z.infer<typeof FileFolderSchema>;

export const LibraryFileSchema = z.strictObject({
  id: z.uuid(),
  folderId: z.uuid().nullable(),
  name: SafeNameSchema,
  entry: FileEntrySchema,
  versionCount: z.int().positive(),
});
export type LibraryFile = z.infer<typeof LibraryFileSchema>;

export type FilePlacement = {
  folderId?: string | null;
  /** The version read by the caller. Commit fails if the logical file has advanced. */
  baseFileEntryId?: string;
  /** Path writes fail on a concurrent create instead of silently adding a suffix. */
  conflictIfExists?: boolean;
  workspaceFolderId?: string | null;
  baseUpdatedAt?: number;
  expectedName?: string;
};

/** Readable paths use a platform-independent namespace, including for non-Latin names. */
export function fileNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export function workspacePathSegments(path: string): string[] {
  if (
    path.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw DataApiErrorFactory.invalidOperation('workspace path', 'Use a relative workspace path.');
  }
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') {
      if (segments.length === 0)
        throw DataApiErrorFactory.invalidOperation('workspace path', 'Path leaves the workspace.');
      segments.pop();
    } else {
      segments.push(SafeNameSchema.parse(segment));
    }
  }
  return segments;
}
