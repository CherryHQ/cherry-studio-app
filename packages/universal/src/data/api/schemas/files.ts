/**
 * Read-only, SQL-first File DataApi contract.
 *
 * Filesystem access, physical URI resolution, and mutations belong to the host
 * platform file capability, matching Cherry Desktop's File IPC boundary.
 */
import type { CursorPaginationParams, CursorPaginationResponse } from '@shared/data/api/types';
import type { FileEntry, FileEntryId, FileRef } from '@shared/data/types/file';
import {
  ContentHashSchema,
  FileEntryIdSchema,
  FileEntryOriginSchema,
  FileRefSourceTypeSchema,
} from '@shared/data/types/file';
import * as z from 'zod';

export interface FileEntryRefCount {
  entryId: FileEntryId;
  refCount: number;
}

export const LIST_FILES_DEFAULT_LIMIT = 50;
export const LIST_FILES_MAX_LIMIT = 100;
export const REF_COUNTS_MAX_ENTRY_IDS = 500;

export const ListFilesQuerySchema = z
  .strictObject({
    cursor: z.string().optional(),
    inTrash: z.boolean().optional(),
    limit: z.int().positive().max(LIST_FILES_MAX_LIMIT).default(LIST_FILES_DEFAULT_LIMIT),
    origin: FileEntryOriginSchema.optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'size', 'ext']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .refine(
    (query) => !(query.inTrash === true && query.origin === 'external'),
    'inTrash=true is incompatible with origin=external',
  );
export type ListFilesQueryParams = z.input<typeof ListFilesQuerySchema> & CursorPaginationParams;
export type ListFilesQuery = z.output<typeof ListFilesQuerySchema>;

export const ContentHashQuerySchema = z.strictObject({ contentHash: ContentHashSchema });
export type ContentHashQueryParams = z.input<typeof ContentHashQuerySchema>;

export interface FileEntryListResponse extends CursorPaginationResponse<FileEntry> {
  total: number;
}

export interface FileEntryExtCount {
  count: number;
  ext: string | null;
}

export interface FileEntryStats {
  activeTotal: number;
  extCounts: FileEntryExtCount[];
  trashTotal: number;
}

export const RefCountsQuerySchema = z.strictObject({
  entryIds: z.array(FileEntryIdSchema).max(REF_COUNTS_MAX_ENTRY_IDS),
});
export type RefCountsQueryParams = z.input<typeof RefCountsQuerySchema>;
export type RefCountsQuery = z.output<typeof RefCountsQuerySchema>;

export const RefsBySourceQuerySchema = z.strictObject({
  sourceId: z.string().min(1),
  sourceType: FileRefSourceTypeSchema,
});
export type RefsBySourceQueryParams = z.input<typeof RefsBySourceQuerySchema>;
export type RefsBySourceQuery = z.output<typeof RefsBySourceQuerySchema>;

export type FileSchemas = {
  '/files/entries': {
    GET: {
      query?: ListFilesQueryParams;
      response: FileEntryListResponse;
    };
  };
  '/files/entries/:id': {
    GET: {
      params: { id: FileEntryId };
      response: FileEntry;
    };
  };
  '/files/entries/by-content-hash': {
    GET: {
      query: ContentHashQueryParams;
      response: FileEntry[];
    };
  };
  '/files/entries/stats': {
    GET: {
      response: FileEntryStats;
    };
  };
  '/files/entries/ref-counts': {
    GET: {
      query: RefCountsQueryParams;
      response: FileEntryRefCount[];
    };
  };
  '/files/entries/:id/refs': {
    GET: {
      params: { id: FileEntryId };
      response: FileRef[];
    };
  };
  '/files/refs': {
    GET: {
      query: RefsBySourceQueryParams;
      response: FileRef[];
    };
  };
};
