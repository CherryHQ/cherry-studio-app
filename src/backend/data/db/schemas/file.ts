import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';

/**
 * NOTE: `file_upload` (AI provider upload cache) is intentionally NOT included
 * — deferred until Vercel AI SDK's Files Upload API exits pre-release status.
 */

/**
 * File entry table — Cherry-owned sandbox files (mobile-native model; see
 * docs/references/file-model.md).
 *
 * Intentionally diverges from Cherry Desktop's file schema: mobile has no
 * external-path entries, no content hashing, and no cleanup-policy state.
 * Every row is an immutable blob stored at `Data/Files/{id}.{ext}` (path
 * derived at runtime, never persisted); content never changes after creation —
 * "edits" create new entries. Rows are removed only by explicit user action;
 * business-object deletion never removes files.
 *
 * - `updatedAt` equals `createdAt` until a future metadata update (file-library
 *   rename) writes it; nothing writes it today.
 * - `deletedAt` is reserved for the future file-library trash; nothing reads or
 *   writes it today, and cleanup logic must not consult it.
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
  },
  (t) => [index('fe_created_at_idx').on(t.createdAt)],
);

export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
