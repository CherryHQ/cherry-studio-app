import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { FileEntryProvenance } from '@/shared/data/types/file';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';

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
 * produced the row ends; only that turn's `edit_file` rewrites it in place, and
 * every other "edit" creates a new version entry. Rows are removed only by
 * explicit user action; business-object deletion never removes files.
 * `provenance` is stable source identity for the library UI, not a mutable
 * owner association; it is written once, by whoever creates the bytes, and
 * never derived from an owner at read time.
 *
 * - `updatedAt` is bumped by the draft rewrite (`size` changes) and by a future
 *   metadata update (file-library rename).
 * - `deletedAt` is reserved for the future file-library trash. Attachment
 *   admission and direct preview reads already treat a marked row as
 *   unavailable; no production path writes it yet.
 */
export const fileEntryTable = sqliteTable(
  'file_entry',
  {
    id: uuidPrimaryKeyOrdered(),

    /** User-visible name including extension, e.g. `report.pdf` */
    filename: text().notNull(),
    /** IANA media type captured at import (picker metadata first, extension inference as fallback) */
    mediaType: text().notNull(),
    /** File size in bytes */
    size: integer().notNull(),

    ...createUpdateDeleteTimestamps,
    // Added after the timestamp columns to match SQLite's physical ADD COLUMN order.
    // Unproven rows stay `unknown`; the upgrade only labels what it can prove.
    provenance: text().$type<FileEntryProvenance>().notNull().default('unknown'),
  },
  (t) => [index('fe_created_at_idx').on(t.createdAt)],
);

export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
