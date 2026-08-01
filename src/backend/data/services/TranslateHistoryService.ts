import { and, eq, or, sql, type SQL } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { translateHistoryTable } from '@/backend/data/db/schemas/translateHistory';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type {
  CreateTranslateHistoryDto,
  TranslateHistoryListResponse,
  TranslateHistoryQuery,
  UpdateTranslateHistoryDto,
} from '@/shared/data/api/schemas/translate';
import { parsePersistedLangCode } from '@/shared/data/preference/preferenceTypes';
import type { TranslateHistory } from '@/shared/data/types/translate';

import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';
import { timestampToISO } from './utils/rowMappers';

function rowToTranslateHistory(row: typeof translateHistoryTable.$inferSelect): TranslateHistory {
  return {
    createdAt: timestampToISO(row.createdAt),
    id: row.id,
    sourceLanguage: row.sourceLanguage === null ? null : parsePersistedLangCode(row.sourceLanguage),
    sourceText: row.sourceText,
    star: row.star,
    targetLanguage: row.targetLanguage === null ? null : parsePersistedLangCode(row.targetLanguage),
    targetText: row.targetText,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class TranslateHistoryService {
  constructor(private readonly dbService: DbService) {}

  async list(query: TranslateHistoryQuery): Promise<TranslateHistoryListResponse> {
    const filters: SQL[] = [];
    if (query.star !== undefined) filters.push(eq(translateHistoryTable.star, query.star));
    if (query.search) {
      const pattern = `%${query.search.replace(/[%_\\]/g, '\\$&')}%`;
      const search = or(
        sql`${translateHistoryTable.sourceText} LIKE ${pattern} ESCAPE '\\'`,
        sql`${translateHistoryTable.targetText} LIKE ${pattern} ESCAPE '\\'`,
      );
      if (search) filters.push(search);
    }
    const ordering = keysetOrdering(translateHistoryTable.createdAt, translateHistoryTable.id, {
      major: 'desc',
      tie: 'asc',
    });
    const conditions = [...filters];
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'translate-history');
    if (cursor) conditions.push(ordering.where(cursor));
    const db = this.dbService.getDb();
    const rows = await db
      .select()
      .from(translateHistoryTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...ordering.orderBy)
      .limit(query.limit + 1);
    const [{ count = 0 } = {}] = await db
      .select({ count: sql<number>`count(*)` })
      .from(translateHistoryTable)
      .where(filters.length ? and(...filters) : undefined);
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(rowToTranslateHistory),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : undefined,
      total: count,
    };
  }

  async getById(id: string): Promise<TranslateHistory> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(translateHistoryTable)
      .where(eq(translateHistoryTable.id, id))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('TranslateHistory', id);
    return rowToTranslateHistory(row);
  }

  async create(dto: CreateTranslateHistoryDto): Promise<TranslateHistory> {
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(translateHistoryTable)
        .values({
          sourceLanguage: dto.sourceLanguage,
          sourceText: dto.sourceText,
          targetLanguage: dto.targetLanguage,
          targetText: dto.targetText,
        })
        .returning(),
    );
    if (!row) throw new Error('Insert did not return a translate history');
    return rowToTranslateHistory(row);
  }

  async update(id: string, dto: UpdateTranslateHistoryDto): Promise<TranslateHistory> {
    return this.dbService.withWriteTx(async (tx) => {
      const updates: Partial<typeof translateHistoryTable.$inferInsert> = {};
      if (dto.sourceText !== undefined) updates.sourceText = dto.sourceText;
      if (dto.targetText !== undefined) updates.targetText = dto.targetText;
      if (dto.sourceLanguage !== undefined) updates.sourceLanguage = dto.sourceLanguage;
      if (dto.targetLanguage !== undefined) updates.targetLanguage = dto.targetLanguage;
      if (dto.star !== undefined) updates.star = dto.star;
      if (Object.keys(updates).length === 0) {
        const [current] = await tx
          .select()
          .from(translateHistoryTable)
          .where(eq(translateHistoryTable.id, id))
          .limit(1);
        if (!current) throw DataApiErrorFactory.notFound('TranslateHistory', id);
        return rowToTranslateHistory(current);
      }
      const [row] = await tx
        .update(translateHistoryTable)
        .set(updates)
        .where(eq(translateHistoryTable.id, id))
        .returning();
      if (!row) throw DataApiErrorFactory.notFound('TranslateHistory', id);
      return rowToTranslateHistory(row);
    });
  }

  async delete(id: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .delete(translateHistoryTable)
        .where(eq(translateHistoryTable.id, id))
        .returning({ id: translateHistoryTable.id });
      if (!row) throw DataApiErrorFactory.notFound('TranslateHistory', id);
    });
  }

  async clearAll(): Promise<void> {
    await this.dbService.withWriteTx((tx) => tx.delete(translateHistoryTable));
  }
}
