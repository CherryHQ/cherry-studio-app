/**
 * Column helper utilities for Drizzle schemas
 *
 * USAGE RULES:
 * - DO NOT manually set id, createdAt, or updatedAt - they are auto-generated
 * - Use .returning() to get inserted/updated rows instead of re-querying
 *
 * TIMESTAMP SEMANTICS:
 * - `createUpdateTimestamps.createdAt` / `.updatedAt` are DB-level NOT NULL.
 *   The `$defaultFn` / `$onUpdateFn` hooks fill them at insert/update time, so
 *   application code can still omit them in `.values({...})`.
 * - `createUpdateDeleteTimestamps.deletedAt` stays nullable by design: NULL
 *   encodes "not soft-deleted". Setting it to a timestamp marks the row as
 *   soft-deleted.
 */

import { type AnySQLiteColumn, index, integer, text } from 'drizzle-orm/sqlite-core';
import { v7 as uuidv7 } from 'uuid';

const createTimestamp = () => Date.now();

type ExpoCryptoModule = {
  getRandomValues: (typedArray: Uint8Array) => Uint8Array;
  randomUUID: () => string;
};

// Keep Expo Crypto out of the schema module's top-level imports so drizzle-kit
// can load schemas in a plain Node.js process.
const loadExpoCrypto = (): ExpoCryptoModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep Expo Crypto lazy for drizzle-kit.
    return require('expo-crypto') as ExpoCryptoModule;
  } catch {
    return null;
  }
};

const createRandomUuid = () => {
  const crypto = loadExpoCrypto();
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  throw new Error('No secure UUID generator is available');
};

const createUuidBytes = () => {
  const bytes = new Uint8Array(16);
  const crypto = loadExpoCrypto();
  if (crypto?.getRandomValues) {
    return crypto.getRandomValues(bytes);
  }

  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(bytes);
  }

  throw new Error('No secure random byte generator is available');
};

/**
 * UUID v4 primary key with auto-generation.
 * Use for general purpose tables.
 */
export const uuidPrimaryKey = () => text().primaryKey().$defaultFn(createRandomUuid);

/**
 * UUID v7 primary key with auto-generation (time-ordered).
 * Use for tables with large datasets that benefit from sequential inserts.
 */
export const uuidPrimaryKeyOrdered = () =>
  text()
    .primaryKey()
    .$defaultFn(() => uuidv7({ rng: createUuidBytes }));

export const createUpdateTimestamps = {
  createdAt: integer().notNull().$defaultFn(createTimestamp),
  updatedAt: integer().notNull().$defaultFn(createTimestamp).$onUpdateFn(createTimestamp),
};

export const createUpdateDeleteTimestamps = {
  createdAt: integer().notNull().$defaultFn(createTimestamp),
  updatedAt: integer().notNull().$defaultFn(createTimestamp).$onUpdateFn(createTimestamp),
  deletedAt: integer(),
};

/**
 * Fractional-indexing order key column (string score), keyed as `orderKey`.
 *
 * Spread into a sqliteTable definition so the field name is locked at the
 * type level — consumers cannot rename it to something custom, and every
 * helper that references `table.orderKey` (indexes, services/utils/orderKey.ts
 * runtime helpers, migrator helpers) can rely on the property existing.
 *
 * Usage:
 *   sqliteTable('miniapp', {
 *     appId: text('app_id').primaryKey(),
 *     ...orderKeyColumns,
 *   }, (table) => [orderKeyIndex('miniapp')(table)])
 */
export const orderKeyColumns = {
  orderKey: text('order_key').notNull(),
};

/**
 * Index on the `order_key` column. Use inside the `sqliteTable` second-argument callback.
 */
export const orderKeyIndex =
  <T extends { orderKey: AnySQLiteColumn }>(tableName: string) =>
  (table: T) =>
    index(`${tableName}_order_key_idx`).on(table.orderKey);

const toSnakeCase = (value: string) => value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

/**
 * Composite `(scope, order_key)` index for scoped reorderable lists.
 * The scope column is referenced by its camelCase TS property (`table[scopeColumn]`);
 * only the index NAME is snake_cased for consistency with DB naming.
 *
 * Example:
 *   scopedOrderKeyIndex('topic', 'groupId')(table)
 *   // index topic_group_id_order_key_idx ON topic(group_id, order_key)
 */
export const scopedOrderKeyIndex =
  <T extends { orderKey: AnySQLiteColumn } & Record<string, AnySQLiteColumn>>(
    tableName: string,
    scopeColumn: keyof T & string,
  ) =>
  (table: T) =>
    index(`${tableName}_${toSnakeCase(scopeColumn)}_order_key_idx`).on(
      table[scopeColumn],
      table.orderKey,
    );
