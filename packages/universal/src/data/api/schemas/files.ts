import type { CursorPaginationParams, CursorPaginationResponse } from '@shared/data/api/types';
import type { FileEntry, FileEntryId, FileRef } from '@shared/data/types/file';
import {
  ContentHashSchema,
  FileEntryIdSchema,
  FileEntryOriginSchema,
  FileRefSourceTypeSchema,
  SafeNameSchema,
} from '@shared/data/types/file';
import * as z from 'zod';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export const ImportFileBodySchema = z.strictObject({
  name: SafeNameSchema.optional(),
  uri: z.string().min(1),
});
export type ImportFileBody = z.input<typeof ImportFileBodySchema>;

export interface DiscardFileResponse {
  deleted: boolean;
}

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

  // Mobile compatibility routes. They expose the Expo URI adapter and remain
  // separate from the desktop-aligned, SQL-only entry routes above.
  '/files/:id': {
    DELETE: {
      params: { id: FileEntryId };
      response: DiscardFileResponse;
    };
    GET: {
      params: { id: FileEntryId };
      response: FileEntry | null;
    };
  };
  '/files/import': {
    POST: {
      body: ImportFileBody;
      response: ResolvedFile;
    };
  };
  '/files/:id/renderable-uri': {
    GET: {
      params: { id: FileEntryId };
      response: string | null;
    };
  };
  '/files/:id/resolved': {
    GET: {
      params: { id: FileEntryId };
      response: ResolvedFile | null;
    };
  };
};
