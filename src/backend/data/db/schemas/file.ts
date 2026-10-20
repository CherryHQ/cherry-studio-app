import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { FileEntryProvenance } from '@/shared/data/types/file';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';
import { libraryFileTable } from './fileLibrary';

/**
 * NOTE: `file_upload` (AI provider upload cache) is intentionally NOT included
 * — deferred until Vercel AI SDK's Files Upload API exits pre-release status.
 */

/**
 * File entry table — Cherry-owned sandbox files (mobile-native model; see
 * docs/references/data/file-model.md).
 *
 * Intentionally diverges from Cherry Desktop's file schema: mobile has no
 * external-path entries, no content hashing, and no cleanup-policy state.
 * Every row is a blob stored at `Data/Files/{id}.{ext}` (path derived at
 * runtime, never persisted). Content is immutable once the Agent turn that
 * produced the row ends; only that turn's file tools rewrite it in place, and
 * every other "edit" creates a new version entry. User deletion moves rows to
 * trash; permanent removal is explicit or follows 30-day retention. Business-object
 * deletion never removes files.
 * `provenance` is stable source identity for the library UI, not a mutable
 * owner association; it is written once, by whoever creates the bytes, and
 * never derived from an owner at read time.
 *
 * - `updatedAt` advances monotonically on draft rewrites; logical renames
 *   live on library_file and never change the immutable blob suffix.
 * - `deletedAt` marks trash membership; active reads exclude it. Trash/restore
 *   preserve `updatedAt`, so preview revision keys remain valid.
 */
export const fileEntryTable = sqliteTable(
  'file_entry',
  {
    id: uuidPrimaryKeyOrdered(),

    libraryFileId: text().references(() => libraryFileTable.id, { onDelete: 'restrict' }),
    /** Null for an individually deleted historical version; otherwise its deletion root. */
    trashedWith: text(),

    /** User-visible name including extension, e.g. `report.pdf` */
    filename: text().notNull(),
    /** IANA media type captured at import (picker metadata first, extension inference as fallback) */
    mediaType: text().notNull(),
    /** File size in bytes */
    size: integer().notNull(),

    ...createUpdateDeleteTimestamps,
    // Writers supply the source when known; unspecified origins stay `unknown`.
    provenance: text().$type<FileEntryProvenance>().notNull().default('unknown'),
  },
  (t) => [
    index('fe_created_at_idx').on(t.createdAt),
    index('fe_deleted_at_idx').on(t.deletedAt),
    index('fe_library_file_idx').on(t.libraryFileId),
  ],
);

export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
