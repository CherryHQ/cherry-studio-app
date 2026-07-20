import {
  type AnyColumn,
  and,
  asc,
  desc,
  eq,
  getTableName,
  gt,
  inArray,
  lt,
  ne,
  type SQL,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { loggerService } from '@/core/logger/LoggerService';
import type { OrderRequest } from '@/data/api/schemas/_endpointHelpers';
import { DataApiErrorFactory } from '@/data/types/apiTypes';

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
  pkColumn: AnyColumn;
  scope?: SQL;
}

interface ResetOrderOptions {
  pkColumn: AnyColumn;
}

interface ComputeOptions {
  excludePkValue?: string;
  pkColumn: AnyColumn;
  scope?: SQL;
}

const logger = loggerService.withContext('orderKey');

export function generateOrderKeySequence(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  return generateNKeysBetween(null, null, count);
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
    const largest = await selectBoundaryKey(tx, table, 'last', scope);
    orderKeys = generateOrderKeySequenceBetween(largest, null, valuesList.length);
  } else {
    const smallest = await selectBoundaryKey(tx, table, 'first', scope);
    orderKeys = generateOrderKeySequenceBetween(null, smallest, valuesList.length);
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
      pkColumn,
      scope,
    });

    if (newKey === current.orderKey) {
      continue;
    }

    await tx
      .update(table)
      .set({ orderKey: newKey })
      .where(scope ? and(eq(pkColumn, move.id), scope) : eq(pkColumn, move.id));
  }
}

/**
 * Apply a batch of moves that are implicitly scoped by a discriminator column
 * (e.g. `entityType`). The scope value for each target is looked up from the
 * row itself — callers only declare the `scopeColumn`; they do not pre-compute
 * or pass in the scope value.
 *
 * Contract rejections (surfaced as `DataApiError` for direct propagation to
 * the API layer):
 * - The batch spans more than one distinct scope value → `VALIDATION_ERROR`.
 *   Scoped reorders must not cross scope boundaries; a single request is
 *   expected to stay within one scope bucket.
 * - Missing target / anchor ids → `NOT_FOUND` (raised from `applyMoves`,
 *   which performs the actual scoped lookup per move).
 *
 * Empty `moves` is a no-op (no DB access).
 */
export async function applyScopedMoves<TTable extends TableWithOrderKey>(
  tx: TxLike,
  table: TTable,
  moves: { anchor: OrderRequest; id: string }[],
  options: { pkColumn: AnySQLiteColumn; scopeColumn: AnySQLiteColumn },
): Promise<void> {
  if (moves.length === 0) {
    return;
  }

  const { pkColumn, scopeColumn } = options;
  const ids = moves.map((move) => move.id);

  const rows = (await tx
    .select({ id: pkColumn, scope: scopeColumn })
    .from(table)
    .where(inArray(pkColumn, ids))) as { id: string; scope: unknown }[];

  // All requested ids are missing — drizzle would reject `eq(scopeColumn, undefined)`
  // at the driver layer before applyMoves can issue its own NOT_FOUND. Surface
  // the same DataApiError shape applyMoves would produce, so the contract is
  // observable as a single uniform error regardless of which layer detected it.
  if (rows.length === 0) {
    throw DataApiErrorFactory.notFound(getTableName(table), ids[0]);
  }

  // Cross-scope batch check — applyMoves cannot do this because it doesn't know
  // `scopeColumn`. Partial-miss cases (some ids found, some missing) are still
  // delegated to applyMoves, which throws NOT_FOUND when it walks to the missing
  // move within the derived scope.
  const scopes = new Set(rows.map((row) => row.scope));
  if (scopes.size > 1) {
    const scopeList = [...scopes].map((scope) => String(scope)).join(', ');
    const message = `applyScopedMoves: batch spans multiple scopes (${scopeList})`;
    throw DataApiErrorFactory.validation({ _root: [message] }, message);
  }

  const [scopeValue] = [...scopes];
  await applyMoves(tx, table, moves, {
    pkColumn,
    scope: eq(scopeColumn, scopeValue),
  });
}

export async function resetOrder<T extends Record<string, unknown>>(
  tx: TxLike,
  table: TableWithOrderKey,
  orderedRows: T[],
  options: ResetOrderOptions,
): Promise<void> {
  if (orderedRows.length === 0) {
    return;
  }

  const orderKeys = generateOrderKeySequence(orderedRows.length);
  const pkColumn = options.pkColumn;

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i] as Record<string, unknown>;
    const pkValue = resolvePkValue(row, pkColumn);
    // react-doctor-disable-next-line async-await-in-loop -- 写事务内本质串行，按序重置 orderKey，并行化无收益
    await tx.update(table).set({ orderKey: orderKeys[i] }).where(eq(pkColumn, pkValue));
  }
}

export async function computeNewOrderKey(
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

  if ('before' in request) {
    const anchorKey = await requireOrderKey(tx, table, pkColumn, request.before, scope);
    const predecessor = await selectAdjacentKey(tx, table, 'predecessor', anchorKey, exclusion);
    return generateOrderKeyBetween(predecessor, anchorKey);
  }

  const anchorKey = await requireOrderKey(tx, table, pkColumn, request.after, scope);
  const successor = await selectAdjacentKey(tx, table, 'successor', anchorKey, exclusion);
  return generateOrderKeyBetween(anchorKey, successor);
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

function resolvePkValue(row: Record<string, unknown>, pkColumn: AnyColumn): string {
  const name = pkColumn.name;
  const value = row[name];
  if (value === undefined || value === null || value === '') {
    throw new Error(`resolvePkValue: row is missing primary-key field "${name}"`);
  }
  return String(value);
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
