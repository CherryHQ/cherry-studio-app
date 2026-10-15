import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PaintingFiles } from '@/shared/data/types/painting';

import {
  createUpdateTimestamps,
  orderKeyColumns,
  orderKeyIndex,
  uuidPrimaryKey,
} from './_columnHelpers';
import { paintingBoardTable } from './paintingBoard';

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
 *
 * `prompt` is exactly what the model received; `brief` is the human-written
 * request shown back to the user when the two differ (annotation edits expand
 * the brief into positional model instructions). Every painting belongs to a
 * board; deleting the board deletes its paintings.
 */
export const paintingTable = sqliteTable(
  'painting',
  {
    id: uuidPrimaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => paintingBoardTable.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id'),
    prompt: text().notNull(),
    brief: text(),
    ...orderKeyColumns,
    ...createUpdateTimestamps,
    // A database default also gives raw SQL writers an empty file list.
    files: text({ mode: 'json' })
      .$type<PaintingFiles>()
      .notNull()
      .default({ input: [], output: [] }),
  },
  (t) => [orderKeyIndex('painting')(t), index('painting_board_id_idx').on(t.boardId)],
);

export type PaintingRow = typeof paintingTable.$inferSelect;
export type InsertPaintingRow = typeof paintingTable.$inferInsert;
