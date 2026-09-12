import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PaintingFiles } from '@/shared/data/types/painting';

import {
  createUpdateTimestamps,
  orderKeyColumns,
  orderKeyIndex,
  uuidPrimaryKey,
} from './_columnHelpers';

/**
 * Painting row — a frozen receipt of a completed image generation.
 *
 * `files` holds the entry ids the receipt points at, the same way a message
 * carries its file parts: the painting owns its own file list rather than
 * deriving it from association rows. That keeps a file's deletion from
 * rewriting the receipt — the id stays, and the surface renders the
 * unavailable placeholder (see docs/references/data/file-model.md).
 *
 * The frozen receipt shape avoids carrying mutable form state (mode, size,
 * seed, etc.) on the row — the live painting draft lives in renderer React
 * state and is discarded on app exit.
 */
export const paintingTable = sqliteTable(
  'painting',
  {
    id: uuidPrimaryKey(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id'),
    prompt: text().notNull(),
    ...orderKeyColumns,
    ...createUpdateTimestamps,
    // Declared last to match the physical column order: SQLite's ADD COLUMN
    // appends, and this column arrived that way in 0002 — with this DB DEFAULT,
    // which migrations.test.ts guards. A `$defaultFn` here instead would drift
    // the schema from the deployed table and make drizzle-kit queue a rebuild.
    files: text({ mode: 'json' })
      .$type<PaintingFiles>()
      .notNull()
      .default({ input: [], output: [] }),
  },
  (t) => [orderKeyIndex('painting')(t)],
);

export type PaintingRow = typeof paintingTable.$inferSelect;
export type InsertPaintingRow = typeof paintingTable.$inferInsert;
