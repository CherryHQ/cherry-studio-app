import {
  type AnyColumn,
  and,
  asc,
  desc,
  eq,
  getTableName,
  gt,
  gte,
  lt,
  lte,
  ne,
  type SQL,
} from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import { monotonicUpdateTimestamp } from '@/backend/data/db/schemas';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { OrderRequest } from '@/shared/data/api/schemas/endpointHelpers';

type TxLike = any;

interface TableWithOrderKey extends SQLiteTable {
  orderKey: AnyColumn;
}

interface InsertWithOrderKeyOptions {
  pkColumn: AnyColumn;
  position?: 'first' | 'last';
  scope?: SQL;
}

interface InsertManyWithOrderKeyOptions {
  pkColumn: AnyColumn;
  position?: 'first' | 'last';
  scope?: SQL;
}

interface ApplyMovesOptions {
  monotonicUpdatedAtColumn?: AnyColumn;
  pkColumn: AnyColumn;
  scope?: SQL;
}

interface ApplyScopedMovesOptions {
  baseScope?: SQL;
  monotonicUpdatedAtColumn?: AnyColumn;
  pkColumn: AnyColumn;
  scopeColumn: AnyColumn;
}

interface ResetOrderOptions {
  monotonicUpdatedAtColumn?: AnyColumn;
  orderBy?: SQL[];
  pkColumn: AnyColumn;
  scope?: SQL;
}

interface ComputeOptions {
  excludePkValue?: string;
  monotonicUpdatedAtColumn?: AnyColumn;
  pkColumn: AnyColumn;
  scope?: SQL;
}

const logger = loggerService.withContext('orderKey');

/** Generate `count` evenly-spaced order keys starting from an empty space. */
export function generateOrderKeySequence(count: number): string[] {
  return generateOrderKeySequenceBetween(null, null, count);
}

export function generateOrderKeyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function generateOrderKeySequenceBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  if (count <= 0) {
    return [];
  }

  return generateNKeysBetween(before, after, count);
}

export async function insertWithOrderKey<
  TTable extends TableWithOrderKey,
  TValues extends Record<string, unknown>,
>(
  tx: TxLike,
  table: TTable,
  values: TValues,
  options: InsertWithOrderKeyOptions,
): Promise<Record<string, unknown>> {
  const [row] = await insertManyWithOrderKey(tx, table, [values], options);
  if (!row) {
    throw new Error('insertWithOrderKey: insert returned no rows');
  }
  return row;
}

export async function insertManyWithOrderKey<
  TTable extends TableWithOrderKey,
  TValues extends Record<string, unknown>,
>(
  tx: TxLike,
  table: TTable,
  valuesList: TValues[],
  options: InsertManyWithOrderKeyOptions,
): Promise<Record<string, unknown>[]> {
  if (valuesList.length === 0) {
    return [];
  }

  const position = options.position ?? 'last';
  const scope = options.scope;
  let orderKeys: string[];

  if (position === 'last') {
    const largest = await selectRepairedBoundaryKey(tx, table, 'last', scope);
    orderKeys = allocateOrderKeys(table, largest, null, valuesList.length);
  } else {
    const smallest = await selectRepairedBoundaryKey(tx, table, 'first', scope);
    orderKeys = allocateOrderKeys(table, null, smallest, valuesList.length);
  }

  const rows = await tx
    .insert(table)
    .values(valuesList.map((value, index) => ({ ...value, orderKey: orderKeys[index] })))
    .returning();

  return rows as Record<string, unknown>[];
}

export async function applyMoves(
  tx: TxLike,
  table: TableWithOrderKey,
  moves: { anchor: OrderRequest; id: string }[],
  options: ApplyMovesOptions,
): Promise<void> {
  const { deduped, droppedCount } = dedupMoves(moves);
  if (droppedCount > 0) {
    logger.warn('applyMoves: dropped duplicate move entries, keeping last occurrence', {
      droppedCount,
      totalInput: moves.length,
    });
  }

  const pkColumn = options.pkColumn;
  const scope = options.scope;

  for (const move of deduped) {
    assertAnchorNotSelf(move.id, move.anchor);

    // react-doctor-disable-next-line async-await-in-loop -- 每次 move 的新 orderKey 依赖前一次 move 已写入的 key，必须串行
    const current = await selectRowByPk(tx, table, pkColumn, move.id, scope);
    if (!current) {
      throw DataApiErrorFactory.notFound(getTableName(table), move.id);
    }

    const newKey = await computeNewOrderKey(tx, table, move.anchor, {
      excludePkValue: move.id,
      monotonicUpdatedAtColumn: options.monotonicUpdatedAtColumn,
      pkColumn,
      scope,
    });

    await tx
      .update(table)
      .set({
        orderKey: newKey,
        ...(options.monotonicUpdatedAtColumn
          ? {
              updatedAt: monotonicUpdateTimestamp(options.monotonicUpdatedAtColumn),
            }
          : {}),
      })
      .where(and(eq(pkColumn, move.id), scope, ne(table.orderKey, newKey)));
  }
}

/**
 * Apply a batch of moves sequentially while keeping each move within its target
 * row's `scopeColumn` bucket (and optional `baseScope` invariant).
 */
export async function applyScopedMoves(
  tx: TxLike,
  table: TableWithOrderKey,
  moves: { anchor: OrderRequest; id: string }[],
  options: ApplyScopedMovesOptions,
): Promise<void> {
  if (moves.length === 0) {
    return;
  }

  const { deduped, droppedCount } = dedupMoves(moves);
  if (droppedCount > 0) {
    logger.warn('applyScopedMoves: dropped duplicate move entries, keeping last occurrence', {
      droppedCount,
      totalInput: moves.length,
    });
  }

  const { baseScope, monotonicUpdatedAtColumn, pkColumn, scopeColumn } = options;

  for (const move of deduped) {
    assertAnchorNotSelf(move.id, move.anchor);

    const targetWhere = baseScope ? and(eq(pkColumn, move.id), baseScope) : eq(pkColumn, move.id);
    // react-doctor-disable-next-line async-await-in-loop -- 每次 move 的 scope 和新 orderKey 依赖前一次写入，必须串行
    const [current] = (await tx
      .select({ scopeValue: scopeColumn })
      .from(table)
      .where(targetWhere)
      .limit(1)) as { scopeValue: unknown }[];

    if (!current) {
      throw DataApiErrorFactory.notFound(getTableName(table), move.id);
    }

    const bucketScope = eq(scopeColumn, current.scopeValue);
    const moveScope = baseScope ? (and(bucketScope, baseScope) as SQL) : bucketScope;

    const newKey = await computeNewOrderKey(tx, table, move.anchor, {
      excludePkValue: move.id,
      monotonicUpdatedAtColumn,
      pkColumn,
      scope: moveScope,
    });

    await tx
      .update(table)
      .set({
        orderKey: newKey,
        ...(monotonicUpdatedAtColumn
          ? {
              updatedAt: monotonicUpdateTimestamp(monotonicUpdatedAtColumn),
            }
          : {}),
      })
      .where(and(eq(pkColumn, move.id), moveScope, ne(table.orderKey, newKey)));
  }
}

/**
 * Rewrite `orderKey` for rows matching `scope` with a fresh evenly-spaced
 * sequence in `orderBy` order.
 */
export async function resetOrder(
  tx: TxLike,
  table: TableWithOrderKey,
  options: ResetOrderOptions,
): Promise<void> {
  const { monotonicUpdatedAtColumn, orderBy, pkColumn, scope } = options;
  const rows = (await tx
    .select({ id: pkColumn })
    .from(table)
    .where(scope ?? undefined)
    .orderBy(...(orderBy ?? [asc(table.orderKey), asc(pkColumn)]))) as { id: string }[];

  if (rows.length === 0) {
    return;
  }

  const keys = generateOrderKeySequence(rows.length);
  for (let index = 0; index < rows.length; index++) {
    const id = rows[index].id;
    const where = scope ? and(eq(pkColumn, id), scope) : eq(pkColumn, id);
    // react-doctor-disable-next-line async-await-in-loop -- 同一写事务内按序重写整段 order_key
    await tx
      .update(table)
      .set({
        orderKey: keys[index],
        ...(monotonicUpdatedAtColumn
          ? {
              updatedAt: monotonicUpdateTimestamp(monotonicUpdatedAtColumn),
            }
          : {}),
      })
      .where(where);
  }
}

export async function computeNewOrderKey(
  tx: TxLike,
  table: TableWithOrderKey,
  request: OrderRequest,
  options: ComputeOptions,
): Promise<string> {
  try {
    return await computeNewOrderKeyOnce(tx, table, request, options);
  } catch (error) {
    if (!isRepairableOrderKeyError(error)) {
      throw error;
    }

    logger.warn('computeNewOrderKey: repairing tied or malformed order keys before retrying move', {
      error: error instanceof Error ? error.message : String(error),
      table: getTableName(table),
    });

    await resetOrder(tx, table, options);

    try {
      return await computeNewOrderKeyOnce(tx, table, request, options);
    } catch (retryError) {
      if (isRepairableOrderKeyError(retryError)) {
        const reason = retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(
          `Cannot compute order key in "${getTableName(table)}" after repair: ${reason}`,
          { cause: retryError },
        );
      }
      throw retryError;
    }
  }
}

async function computeNewOrderKeyOnce(
  tx: TxLike,
  table: TableWithOrderKey,
  request: OrderRequest,
  options: ComputeOptions,
): Promise<string> {
  const { excludePkValue, pkColumn, scope } = options;
  const exclusion =
    excludePkValue !== undefined ? buildExclusion(pkColumn, excludePkValue, scope) : scope;

  if ('position' in request) {
    if (request.position === 'first') {
      const smallest = await selectBoundaryKey(tx, table, 'first', exclusion);
      return generateOrderKeyBetween(null, smallest);
    }

    const largest = await selectBoundaryKey(tx, table, 'last', exclusion);
    return generateOrderKeyBetween(largest, null);
  }

  const before = 'before' in request;
  const anchorId = before ? request.before : request.after;
  const anchorKey = await requireOrderKey(tx, table, pkColumn, anchorId, scope);
  const neighbor = await selectBoundaryKey(
    tx,
    table,
    before ? 'last' : 'first',
    and(
      exclusion,
      ne(pkColumn, anchorId),
      before ? lte(table.orderKey, anchorKey) : gte(table.orderKey, anchorKey),
    ),
  );
  // A provider can bring a matching key into this group when enabled or disabled.
  if (neighbor === anchorKey) throw new DuplicateOrderKeyError(`Duplicate order key: ${anchorKey}`);
  return before
    ? generateOrderKeyBetween(neighbor, anchorKey)
    : generateOrderKeyBetween(anchorKey, neighbor);
}

/**
 * The neighbour keys come from the table, so when one of them is malformed
 * `fractional-indexing` reports only the offending key ("invalid order key: c4")
 * with nothing to tie it to a table or a row — the failure then surfaces wherever
 * the insert happened to be (e.g. "message was not sent"). Name the table here.
 */
function allocateOrderKeys(
  table: TableWithOrderKey,
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  try {
    return generateOrderKeySequenceBetween(before, after, count);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Cannot allocate order keys in "${getTableName(table)}" between ${String(before)} and ${String(after)}: ${reason}`,
      { cause: error },
    );
  }
}

function dedupMoves(moves: { anchor: OrderRequest; id: string }[]): {
  deduped: { anchor: OrderRequest; id: string }[];
  droppedCount: number;
} {
  const byId = new Map<string, { anchor: OrderRequest; id: string }>();
  for (const move of moves) {
    byId.set(move.id, move);
  }
  return {
    deduped: [...byId.values()],
    droppedCount: moves.length - byId.size,
  };
}

function isValidOrderKey(key: string): boolean {
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

class DuplicateOrderKeyError extends Error {}

function isRepairableOrderKeyError(error: unknown): boolean {
  return (
    error instanceof DuplicateOrderKeyError ||
    (error instanceof Error && error.message.includes('invalid order key'))
  );
}

async function collectInvalidBoundaryKeys(
  tx: TxLike,
  table: TableWithOrderKey,
  which: 'first' | 'last',
  scope?: SQL,
): Promise<{ invalidKeys: string[]; nearestValid: string | null }> {
  const side = which === 'last' ? 'predecessor' : 'successor';
  const invalidKeys: string[] = [];
  let cursor = await selectBoundaryKey(tx, table, which, scope);
  while (cursor !== null && !isValidOrderKey(cursor)) {
    invalidKeys.push(cursor);
    // react-doctor-disable-next-line async-await-in-loop -- 沿边界依次向内定位首个合法 key，必须串行
    cursor = await selectAdjacentKey(tx, table, side, cursor, scope);
  }
  return { invalidKeys, nearestValid: cursor };
}

async function selectRepairedBoundaryKey(
  tx: TxLike,
  table: TableWithOrderKey,
  which: 'first' | 'last',
  scope?: SQL,
): Promise<string | null> {
  const { invalidKeys, nearestValid } = await collectInvalidBoundaryKeys(tx, table, which, scope);
  if (invalidKeys.length === 0) {
    return nearestValid;
  }

  let anchor = nearestValid;
  let newKey = '';
  for (let index = invalidKeys.length - 1; index >= 0; index -= 1) {
    const invalidKey = invalidKeys[index];
    newKey =
      which === 'last'
        ? generateOrderKeyBetween(anchor, null)
        : generateOrderKeyBetween(null, anchor);
    const where = scope
      ? (and(eq(table.orderKey, invalidKey), scope) as SQL)
      : eq(table.orderKey, invalidKey);
    // react-doctor-disable-next-line async-await-in-loop -- 依次向外修复非法 legacy orderKey
    await tx.update(table).set({ orderKey: newKey }).where(where);
    logger.warn('insertManyWithOrderKey: re-keyed legacy invalid order key', {
      invalidKey,
      newKey,
      table: getTableName(table),
    });
    anchor = newKey;
  }

  return newKey;
}

async function selectBoundaryKey(
  tx: TxLike,
  table: TableWithOrderKey,
  which: 'first' | 'last',
  scope?: SQL,
): Promise<string | null> {
  const orderExpression = which === 'first' ? asc(table.orderKey) : desc(table.orderKey);
  const rows = await tx
    .select({ orderKey: table.orderKey })
    .from(table)
    .where(scope ?? undefined)
    .orderBy(orderExpression)
    .limit(1);
  const first = rows[0] as { orderKey: string | null } | undefined;
  return first?.orderKey ?? null;
}

async function selectAdjacentKey(
  tx: TxLike,
  table: TableWithOrderKey,
  side: 'predecessor' | 'successor',
  anchorKey: string,
  scope?: SQL,
): Promise<string | null> {
  const predicate =
    side === 'predecessor' ? lt(table.orderKey, anchorKey) : gt(table.orderKey, anchorKey);
  const where = scope ? and(predicate, scope) : predicate;
  const orderExpression = side === 'predecessor' ? desc(table.orderKey) : asc(table.orderKey);
  const rows = await tx
    .select({ orderKey: table.orderKey })
    .from(table)
    .where(where)
    .orderBy(orderExpression)
    .limit(1);
  const first = rows[0] as { orderKey: string | null } | undefined;
  return first?.orderKey ?? null;
}

async function requireOrderKey(
  tx: TxLike,
  table: TableWithOrderKey,
  pkColumn: AnyColumn,
  id: string,
  scope: SQL | undefined,
): Promise<string> {
  const row = await selectRowByPk(tx, table, pkColumn, id, scope);
  if (!row) {
    throw DataApiErrorFactory.notFound(getTableName(table), id);
  }

  return row.orderKey;
}

async function selectRowByPk(
  tx: TxLike,
  table: TableWithOrderKey,
  pkColumn: AnyColumn,
  id: string,
  scope?: SQL,
): Promise<{ orderKey: string } | null> {
  const where = scope ? and(eq(pkColumn, id), scope) : eq(pkColumn, id);
  const rows = await tx.select({ orderKey: table.orderKey }).from(table).where(where).limit(1);
  return (rows[0] as { orderKey: string } | undefined) ?? null;
}

function buildExclusion(pkColumn: AnyColumn, excludePkValue: string, scope?: SQL): SQL {
  const notSelf = ne(pkColumn, excludePkValue);
  if (!scope) {
    return notSelf;
  }

  return and(notSelf, scope) as SQL;
}

function assertAnchorNotSelf(moveId: string, anchor: OrderRequest) {
  if ('before' in anchor && anchor.before === moveId) {
    throw DataApiErrorFactory.validation(
      { anchor: ['anchor "before" id must not equal the move id'] },
      `applyMoves: anchor "before" id "${moveId}" cannot equal the move's own id`,
    );
  }

  if ('after' in anchor && anchor.after === moveId) {
    throw DataApiErrorFactory.validation(
      { anchor: ['anchor "after" id must not equal the move id'] },
      `applyMoves: anchor "after" id "${moveId}" cannot equal the move's own id`,
    );
  }
}
