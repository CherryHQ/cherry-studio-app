import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * Painting board — the long-lived canvas that threads generations together.
 *
 * Each painting row belongs to exactly one board. Edges between generations
 * are not stored: within a board, a painting whose input file is another
 * painting's output was made from it. `focusPaintingId` remembers the node the
 * user last looked at so reopening the board lands there; it is a plain id
 * rather than a foreign key because deleting that node must not cascade.
 */
export const paintingBoardTable = sqliteTable('painting_board', {
  id: uuidPrimaryKey(),
  title: text().notNull(),
  focusPaintingId: text('focus_painting_id'),
  ...createUpdateTimestamps,
});

export type PaintingBoardRow = typeof paintingBoardTable.$inferSelect;
export type InsertPaintingBoardRow = typeof paintingBoardTable.$inferInsert;
