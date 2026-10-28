import * as z from 'zod';

/**
 * SQL-first file-library metadata contract.
 *
 * Filesystem access and physical URI resolution belong to the host platform
 * file capability. Folder, lineage, and workspace mutations own database rows.
 */
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema, SafeNameSchema } from '@/shared/data/types/file';
import {
  MAX_FILE_MOVE_BATCH_SIZE,
  type FileFolder,
  type FileMoveResult,
  type LibraryFile,
} from '@/shared/data/types/fileLibrary';

export const FileLibraryQuerySchema = z.strictObject({
  folderId: z.uuid().nullable().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(255).optional(),
});
export const CreateFileFolderSchema = z.strictObject({
  parentId: z.uuid().nullable(),
  name: SafeNameSchema,
});
export const UpdateFileFolderSchema = z.strictObject({
  parentId: z.uuid().nullable().optional(),
  name: SafeNameSchema.optional(),
});
export const UpdateLibraryFileSchema = z.strictObject({
  folderId: z.uuid().nullable().optional(),
  name: SafeNameSchema.optional(),
});
export const MoveLibraryFilesSchema = z.strictObject({
  fileEntryIds: z.array(FileEntryIdSchema).min(1).max(MAX_FILE_MOVE_BATCH_SIZE),
  folderId: z.uuid().nullable(),
});

export type FileSchemas = {
  '/files/library': {
    GET: {
      query?: z.input<typeof FileLibraryQuerySchema>;
      response: CursorPaginationResponse<LibraryFile>;
    };
  };
  '/files/library/:id': {
    PATCH: {
      params: { id: string };
      body: z.infer<typeof UpdateLibraryFileSchema>;
      response: undefined;
    };
  };
  '/files/library/move': {
    POST: {
      body: z.infer<typeof MoveLibraryFilesSchema>;
      response: FileMoveResult[];
    };
  };
  '/files/history': { GET: { query: { id: string }; response: FileEntry[] } };
  '/files/folders': {
    GET: { response: FileFolder[] };
    POST: { body: z.infer<typeof CreateFileFolderSchema>; response: FileFolder };
  };
  '/files/folders/:id': {
    PATCH: {
      params: { id: string };
      body: z.infer<typeof UpdateFileFolderSchema>;
      response: undefined;
    };
    DELETE: { params: { id: string }; response: undefined };
  };
  '/files/workspace': { GET: { query: { sessionId: string }; response: FileFolder | null } };
  '/files/workspace/:id': {
    PATCH: {
      params: { id: string };
      body: { folderId: string | null };
      response: FileFolder | null;
    };
  };
  '/files/entries/:id': {
    GET: {
      params: { id: FileEntryId };
      response: FileEntry;
    };
  };
};
