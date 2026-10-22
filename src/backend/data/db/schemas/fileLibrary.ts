import { type AnySQLiteColumn, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';

/** Logical folders never change the flat managed-blob layout. */
export const fileFolderTable = sqliteTable(
  'file_folder',
  {
    id: uuidPrimaryKeyOrdered(),
    parentId: text().references((): AnySQLiteColumn => fileFolderTable.id, {
      onDelete: 'set null',
    }),
    name: text().notNull(),
    nameKey: text().notNull(),
    ...createUpdateDeleteTimestamps,
    /** A descendant shares its deletion root's restore/purge operation. */
    trashedWith: text(),
  },
  (t) => [
    index('file_folder_parent_idx').on(t.parentId),
    index('file_folder_trash_idx').on(t.trashedWith),
  ],
);

export type FileFolderRow = typeof fileFolderTable.$inferSelect;
export type InsertFileFolderRow = typeof fileFolderTable.$inferInsert;

/** Stable file identity and display name; file_entry owns each version's immutable bytes. */
export const libraryFileTable = sqliteTable(
  'library_file',
  {
    id: uuidPrimaryKeyOrdered(),
    folderId: text().references(() => fileFolderTable.id, { onDelete: 'set null' }),
    name: text().notNull(),
    nameKey: text().notNull(),
    // Maintained with file_entry.libraryFileId in one write transaction; no circular FK.
    currentEntryId: text().notNull(),
    ...createUpdateDeleteTimestamps,
    trashedWith: text(),
  },
  (t) => [
    index('library_file_folder_idx').on(t.folderId),
    index('library_file_trash_idx').on(t.trashedWith),
  ],
);

export type LibraryFileRow = typeof libraryFileTable.$inferSelect;
export type InsertLibraryFileRow = typeof libraryFileTable.$inferInsert;
