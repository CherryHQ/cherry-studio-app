import { and, asc, count, desc, eq, gte, ne, sql, type SQL } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { knowledgeBaseTable, knowledgeItemTable } from '@/backend/data/db/schemas/knowledge';
import { DataApiErrorFactory } from '@cherrystudio/shared/data/api/errors';
import type {
  KnowledgeBaseListItem,
  ListKnowledgeBasesQuery,
  UpdateKnowledgeBaseDto,
} from '@cherrystudio/shared/data/api/schemas/knowledges';
import type { OffsetPaginationResponse } from '@cherrystudio/shared/data/api/types';
import {
  type CreateKnowledgeBaseDto,
  DEFAULT_KNOWLEDGE_BASE_CHUNK_OVERLAP,
  DEFAULT_KNOWLEDGE_BASE_CHUNK_SIZE,
  DEFAULT_KNOWLEDGE_BASE_STATUS,
  DEFAULT_KNOWLEDGE_CHUNK_SEPARATOR,
  DEFAULT_KNOWLEDGE_CHUNK_STRATEGY,
  type KnowledgeBase,
  KnowledgeBaseSchema,
} from '@cherrystudio/shared/data/types/knowledge';

import type { GroupService } from './GroupService';
import { timestampToISO } from './utils/rowMappers';

type KnowledgeBaseRow = typeof knowledgeBaseTable.$inferSelect;

function rowToKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return KnowledgeBaseSchema.parse({
    ...row,
    createdAt: timestampToISO(row.createdAt),
    documentCount: row.documentCount ?? undefined,
    fileProcessorId: row.fileProcessorId,
    rerankModelId: row.rerankModelId,
    threshold: row.threshold ?? undefined,
    updatedAt: timestampToISO(row.updatedAt),
  });
}

function searchPredicate(search?: string): SQL | undefined {
  const trimmed = search?.trim();
  if (!trimmed) return undefined;
  const pattern = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`;
  return sql`${knowledgeBaseTable.name} LIKE ${pattern} ESCAPE '\\'`;
}

function validateConfig(config: {
  chunkOverlap: number;
  chunkSeparator: string;
  chunkSize: number;
  chunkStrategy: string;
}): void {
  const fieldErrors: Record<string, string[]> = {};
  if (config.chunkOverlap >= config.chunkSize) {
    fieldErrors.chunkOverlap = ['Chunk overlap must be smaller than chunk size'];
  }
  if (config.chunkStrategy === 'delimiter' && !config.chunkSeparator) {
    fieldErrors.chunkSeparator = ['Separator is required when chunk strategy is delimiter'];
  }
  if (Object.keys(fieldErrors).length) throw DataApiErrorFactory.validation(fieldErrors);
}

function validateDimensions(modelId: string | null, dimensions: number | null): void {
  if (modelId !== null && (!Number.isInteger(dimensions) || (dimensions ?? 0) <= 0)) {
    throw DataApiErrorFactory.validation({
      dimensions: ['A knowledge base with an embedding model requires positive dimensions'],
    });
  }
}

export class KnowledgeBaseService {
  constructor(
    private readonly dbService: DbService,
    private readonly groups: GroupService,
  ) {}

  async list(
    query: ListKnowledgeBasesQuery,
  ): Promise<OffsetPaginationResponse<KnowledgeBaseListItem>> {
    const conditions: SQL[] = [];
    const search = searchPredicate(query.search);
    if (search) conditions.push(search);
    if (query.updatedAtFrom) {
      conditions.push(gte(knowledgeBaseTable.updatedAt, Date.parse(query.updatedAtFrom)));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const order = query.sortOrder === 'asc' ? asc : desc;
    const sortColumn = {
      createdAt: knowledgeBaseTable.createdAt,
      name: knowledgeBaseTable.name,
      updatedAt: knowledgeBaseTable.updatedAt,
    }[query.sortBy ?? 'createdAt'];
    const db = this.dbService.getDb();
    const rows = await db
      .select({ base: knowledgeBaseTable, itemCount: count(knowledgeItemTable.id) })
      .from(knowledgeBaseTable)
      .leftJoin(
        knowledgeItemTable,
        and(
          eq(knowledgeItemTable.baseId, knowledgeBaseTable.id),
          ne(knowledgeItemTable.status, 'deleting'),
        ),
      )
      .where(where)
      .groupBy(knowledgeBaseTable.id)
      .orderBy(order(sortColumn), order(knowledgeBaseTable.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    const [{ total = 0 } = {}] = await db
      .select({ total: count() })
      .from(knowledgeBaseTable)
      .where(where);
    return {
      items: rows.map(({ base, itemCount }) => ({ ...rowToKnowledgeBase(base), itemCount })),
      page: query.page,
      total,
    };
  }

  async getById(id: string): Promise<KnowledgeBase> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(knowledgeBaseTable)
      .where(eq(knowledgeBaseTable.id, id))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeBase', id);
    return rowToKnowledgeBase(row);
  }

  async create(dto: CreateKnowledgeBaseDto): Promise<KnowledgeBase> {
    await this.validateGroup(dto.groupId);
    const embeddingModelId = dto.embeddingModelId?.trim() || null;
    const dimensions = embeddingModelId ? (dto.dimensions ?? null) : null;
    const config = {
      chunkOverlap: dto.chunkOverlap ?? DEFAULT_KNOWLEDGE_BASE_CHUNK_OVERLAP,
      chunkSeparator: dto.chunkSeparator ?? DEFAULT_KNOWLEDGE_CHUNK_SEPARATOR,
      chunkSize: dto.chunkSize ?? DEFAULT_KNOWLEDGE_BASE_CHUNK_SIZE,
      chunkStrategy: dto.chunkStrategy ?? DEFAULT_KNOWLEDGE_CHUNK_STRATEGY,
    };
    validateConfig(config);
    validateDimensions(embeddingModelId, dimensions);
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(knowledgeBaseTable)
        .values({
          ...config,
          dimensions,
          documentCount: dto.documentCount ?? null,
          embeddingModelId,
          error: null,
          fileProcessorId: dto.fileProcessorId ?? null,
          groupId: dto.groupId ?? null,
          name: dto.name.trim(),
          rerankModelId: dto.rerankModelId ?? null,
          status: DEFAULT_KNOWLEDGE_BASE_STATUS,
          threshold: dto.threshold ?? null,
        })
        .returning(),
    );
    if (!row) throw new Error('Insert did not return a knowledge base');
    return rowToKnowledgeBase(row);
  }

  async update(id: string, dto: UpdateKnowledgeBaseDto): Promise<KnowledgeBase> {
    const existing = await this.getById(id);
    if (dto.groupId !== undefined) await this.validateGroup(dto.groupId);
    const embeddingModelId =
      dto.embeddingModelId !== undefined
        ? dto.embeddingModelId?.trim() || null
        : existing.embeddingModelId;
    const dimensions = dto.dimensions !== undefined ? dto.dimensions : existing.dimensions;
    if (embeddingModelId !== existing.embeddingModelId || dimensions !== existing.dimensions) {
      const [{ itemCount = 0 } = {}] = await this.dbService
        .getDb()
        .select({ itemCount: count() })
        .from(knowledgeItemTable)
        .where(and(eq(knowledgeItemTable.baseId, id), ne(knowledgeItemTable.status, 'deleting')));
      if (itemCount > 0) {
        throw DataApiErrorFactory.validation({
          embeddingModelId: [
            'Cannot change the embedding model of a knowledge base that already has items',
          ],
        });
      }
    }
    const config = {
      chunkOverlap: dto.chunkOverlap ?? existing.chunkOverlap,
      chunkSeparator: dto.chunkSeparator ?? existing.chunkSeparator,
      chunkSize: dto.chunkSize ?? existing.chunkSize,
      chunkStrategy: dto.chunkStrategy ?? existing.chunkStrategy,
    };
    validateConfig(config);
    validateDimensions(embeddingModelId, dimensions);
    const updates: Partial<typeof knowledgeBaseTable.$inferInsert> = {
      ...config,
      dimensions,
      embeddingModelId,
    };
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.groupId !== undefined) updates.groupId = dto.groupId;
    if (dto.rerankModelId !== undefined) updates.rerankModelId = dto.rerankModelId;
    if (dto.fileProcessorId !== undefined) updates.fileProcessorId = dto.fileProcessorId;
    if (dto.threshold !== undefined) updates.threshold = dto.threshold;
    if (dto.documentCount !== undefined) updates.documentCount = dto.documentCount;
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx.update(knowledgeBaseTable).set(updates).where(eq(knowledgeBaseTable.id, id)).returning(),
    );
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeBase', id);
    return rowToKnowledgeBase(row);
  }

  async delete(id: string): Promise<void> {
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .delete(knowledgeBaseTable)
        .where(eq(knowledgeBaseTable.id, id))
        .returning({ id: knowledgeBaseTable.id }),
    );
    if (!row) throw DataApiErrorFactory.notFound('KnowledgeBase', id);
  }

  private async validateGroup(groupId: string | null | undefined): Promise<void> {
    if (groupId == null) return;
    let group;
    try {
      group = await this.groups.getById(groupId);
    } catch {
      throw DataApiErrorFactory.validation({
        groupId: [`Knowledge base group not found: ${groupId}`],
      });
    }
    if (group.entityType !== 'knowledge') {
      throw DataApiErrorFactory.validation({
        groupId: [`Knowledge base group must have entityType 'knowledge': ${groupId}`],
      });
    }
  }
}
