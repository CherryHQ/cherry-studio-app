/**
 * Group Service - handles group CRUD and scoped reorder operations
 *
 * Groups are user-managed flat containers keyed by `entityType`. Ordering within
 * an entityType bucket is preserved via a fractional-indexing `orderKey`.
 *
 * USAGE GUIDANCE:
 * - `listByEntityType` is the canonical read path; `entityType` is always required.
 * - `create` auto-assigns `orderKey` via `insertWithOrderKey` (scope=entityType)
 *   so consumers never touch the column directly.
 * - `reorder` / `reorderBatch` delegate to `applyScopedMoves`, which performs
 *   scope inference and enforces "batch stays within one entityType".
 */

import { asc, eq } from 'drizzle-orm';
import type { DbService } from '@/backend/infrastructure/db/DbService';
import { groupTable } from '@/backend/infrastructure/db/schemas';
import type { GroupRow } from '@/backend/infrastructure/db/schemas/group';
import type { OrderRequest } from '@/shared/data/api/schemas/_endpointHelpers';
import { DataApiErrorFactory } from '@/shared/data/api/types';
import type { EntityType } from '@/shared/data/types/entityType';
import type { CreateGroupDto, Group, UpdateGroupDto } from '@/shared/data/types/group';

import { applyScopedMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

function rowToGroup(row: GroupRow): Group {
  return {
    createdAt: timestampToISO(row.createdAt),
    entityType: row.entityType as EntityType,
    id: row.id,
    name: row.name,
    orderKey: row.orderKey,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class GroupService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  /**
   * List groups for a given entityType, ordered by orderKey ASC.
   */
  async listByEntityType(entityType: EntityType): Promise<Group[]> {
    const rows = await this.db
      .select()
      .from(groupTable)
      .where(eq(groupTable.entityType, entityType))
      .orderBy(asc(groupTable.orderKey));
    return rows.map(rowToGroup);
  }

  /**
   * Get a group by ID.
   */
  async getById(id: string): Promise<Group> {
    const [row] = await this.db.select().from(groupTable).where(eq(groupTable.id, id)).limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Group', id);
    }

    return rowToGroup(row);
  }

  /**
   * Create a new group. The new row is appended to the end of its entityType
   * bucket with a fresh fractional-indexing orderKey.
   */
  async create(dto: CreateGroupDto): Promise<Group> {
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(
        tx,
        groupTable,
        { entityType: dto.entityType, name: dto.name },
        {
          pkColumn: groupTable.id,
          scope: eq(groupTable.entityType, dto.entityType),
        },
      ),
    )) as GroupRow;

    return rowToGroup(row);
  }

  /**
   * Update an existing group. `entityType` is immutable — only `name` can change.
   */
  async update(id: string, dto: UpdateGroupDto): Promise<Group> {
    const updates: Partial<typeof groupTable.$inferInsert> = {};
    if (dto.name !== undefined) {
      updates.name = dto.name;
    }

    if (Object.keys(updates).length === 0) {
      return this.getById(id);
    }

    const [row] = await this.dbService.withWriteTx((tx) =>
      tx.update(groupTable).set(updates).where(eq(groupTable.id, id)).returning(),
    );

    if (!row) {
      throw DataApiErrorFactory.notFound('Group', id);
    }

    return rowToGroup(row);
  }

  /**
   * Delete a group.
   */
  async delete(id: string): Promise<void> {
    const [row] = await this.dbService.withWriteTx((tx) => {
      return tx.delete(groupTable).where(eq(groupTable.id, id)).returning({
        id: groupTable.id,
      });
    });

    if (!row) {
      throw DataApiErrorFactory.notFound('Group', id);
    }
  }

  /**
   * Move a single group relative to an anchor. Scope (entityType) is inferred
   * from the target row — callers do not pass scope.
   */
  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      applyScopedMoves(tx, groupTable, [{ anchor, id }], {
        pkColumn: groupTable.id,
        scopeColumn: groupTable.entityType,
      }),
    );
  }

  /**
   * Apply a batch of moves atomically. `applyScopedMoves` rejects batches that
   * span multiple entityTypes with a VALIDATION_ERROR.
   */
  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      applyScopedMoves(tx, groupTable, moves, {
        pkColumn: groupTable.id,
        scopeColumn: groupTable.entityType,
      }),
    );
  }
}
