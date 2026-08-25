/**
 * Read-only, SQL-first File DataApi contract.
 *
 * Filesystem access, physical URI resolution, and mutations belong to the host
 * platform file capability. Deliberately minimal: routes are added when a
 * consumer needs them — the list route below backs the file library.
 */
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

/**
 * One time-ordered stream of every entry. Media-type filtering is deliberately
 * absent: the library's kind tabs partition what the client has already paged
 * in, so a per-kind cursor walk here would fragment that one stream into three
 * that cannot share their pages.
 */
export type FileEntryListQuery = {
  cursor?: string;
  limit?: number;
};

export type FileSchemas = {
  '/files/entries': {
    GET: {
      query?: FileEntryListQuery;
      response: CursorPaginationResponse<FileEntry>;
    };
  };
  '/files/entries/:id': {
    GET: {
      params: { id: FileEntryId };
      response: FileEntry;
    };
  };
};
