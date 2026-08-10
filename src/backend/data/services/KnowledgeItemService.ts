import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type {
  KnowledgeItemListResponse,
  ListKnowledgeItemsQuery,
} from '@cherrystudio/universal/data/api/schemas/knowledges';
import {
  type CreateKnowledgeItemDto,
  type KnowledgeItem,
  KnowledgeItemSchema,
  type KnowledgeItemStatus,
} from '@cherrystudio/universal/data/types/knowledge';
import { and, asc, count, desc, eq, gt, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { knowledgeItemTable } from '@/backend/data/db/schemas/knowledge';

import type { KnowledgeBaseService } from './KnowledgeBaseService';
import { timestampToISO } from './utils/rowMappers';

type KnowledgeItemRow = typeof knowledgeItemTable.$inferSelect;
type Cursor = { createdAt: number; directoryRank: number; id: string };

function rowToKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
  return KnowledgeItemSchema.parse({
    ...row,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

function encodeCursor(cursor: Cursor): string {
  return globalThis
    .btoa(JSON.stringify(cursor))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const base64 = raw
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const value = JSON.parse(globalThis.atob(base64)) as Partial<Cursor>;
    if (
      (value.directoryRank !== 0 && value.directoryRank !== 1) ||
      !Number.isFinite(value.createdAt) ||
      !value.id
    )
      return null;
    return value as Cursor;
  } catch {
    return null;
  }
}

export class KnowledgeItemService {
  constructor(
    private readonly dbService: DbService,
    private readonly bases: KnowledgeBaseService,
  ) {}

  async list(baseId: string, query: ListKnowledgeItemsQuery): Promise<KnowledgeItemListResponse> {
    await this.bases.getById(baseId);
    const filters: SQL[] = [
      eq(knowledgeItemTable.baseId, baseId),
      ne(knowledgeItemTable.status, 'deleting'),
    ];
    if (query.type !== undefined) filters.push(eq(knowledgeItemTable.type, query.type));
    if (query.groupId !== undefined) {
      filters.push(
        query.groupId === null
          ? isNull(knowledgeItemTable.groupId)
          : eq(knowledgeItemTable.groupId, query.groupId),
      );
    }
    const directoryRank = sql<number>`case when ${knowledgeItemTable.type} = 'directory' then 0 else 1 end`;
    const conditions = [...filters];
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      conditions.push(
        or(
          gt(directoryRank, cursor.directoryRank),
          and(
            eq(directoryRank, cursor.directoryRank),
            lt(knowledgeItemTable.createdAt, cursor.createdAt),
          ),
          and(
            eq(directoryRank, cursor.directoryRank),
            eq(knowledgeItemTable.createdAt, cursor.createdAt),
            gt(knowledgeItemTable.id, cursor.id),
          ),
        )!,
      );
    }
    const db = this.dbService.getDb();
    const rows = await db
      .select()
      .from(knowledgeItemTable)
      .where(and(...conditions))
      .orderBy(asc(directoryRank), desc(knowledgeItemTable.createdAt), asc(knowledgeItemTable.id))
      .limit(query.limit + 1);
    const [{ total = 0 } = {}] = await db
      .select({ total: count() })
      .from(knowledgeItemTable)
      .where(and(...filters));
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(rowToKnowledgeItem),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({
              createdAt: last.createdAt,
              directoryRank: last.type === 'directory' ? 0 : 1,
              id: last.id,
            })
          : undefined,
      total,
    };
  }

  async getById(id: string): Promise<KnowledgeItem> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(knowledgeItemTable)
      .where(eq(knowledgeItemTable.id, id))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeItem', id);
    return rowToKnowledgeItem(row);
  }

  async create(baseId: string, dto: CreateKnowledgeItemDto): Promise<KnowledgeItem> {
    await this.bases.getById(baseId);
    if (dto.groupId) {
      const owner = await this.getById(dto.groupId);
      if (owner.baseId !== baseId || owner.type !== 'directory' || owner.status === 'deleting') {
        throw DataApiErrorFactory.validation({ groupId: ['Invalid knowledge item group owner'] });
      }
    }
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(knowledgeItemTable)
        .values({
          baseId,
          data: dto.data,
          error: null,
          groupId: dto.groupId ?? null,
          status: 'idle',
          type: dto.type,
        })
        .returning(),
    );
    if (!row) throw new Error('Insert did not return a knowledge item');
    return rowToKnowledgeItem(row);
  }

  async updateStatus(
    id: string,
    status: KnowledgeItemStatus,
    error?: string,
  ): Promise<KnowledgeItem> {
    const normalizedError = status === 'failed' ? error?.trim() : null;
    if (status === 'failed' && !normalizedError) {
      throw DataApiErrorFactory.validation({ error: ['Failed items require an error'] });
    }
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .update(knowledgeItemTable)
        .set({ error: normalizedError, status })
        .where(eq(knowledgeItemTable.id, id))
        .returning(),
    );
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeItem', id);
    return rowToKnowledgeItem(row);
  }

  async delete(id: string): Promise<void> {
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .delete(knowledgeItemTable)
        .where(eq(knowledgeItemTable.id, id))
        .returning({ id: knowledgeItemTable.id }),
    );
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeItem', id);
  }
}
