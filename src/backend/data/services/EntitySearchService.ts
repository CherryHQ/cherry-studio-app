import { loggerService } from '@logger';
import { and, asc, desc, eq, gte, isNull, or, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { assistantTable, topicTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory, isDataApiError, toDataApiError } from '@/shared/data/api/errors';
import {
  ENTITY_SEARCH_MAX_LIMIT_PER_TYPE,
  type EntitySearchGroup,
  type EntitySearchItem,
  type EntitySearchQuery,
  type EntitySearchResponse,
  type EntitySearchType,
  entitySearchTypes,
} from '@/shared/data/api/schemas/search';

import { timestampToISO } from './utils/rowMappers';

const defaultLimitPerType = 50;
const logger = loggerService.withContext('EntitySearchService');

function getUpdatedAtFromMs(updatedAtFrom: string | undefined): number | undefined {
  if (!updatedAtFrom) return undefined;
  const value = Date.parse(updatedAtFrom);
  return Number.isFinite(value) ? value : undefined;
}

function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
}

function withTypeContext(type: EntitySearchType, error: unknown) {
  const context = `entity search type ${type}`;
  const apiError = toDataApiError(error, context);
  if (!isDataApiError(error)) return apiError;
  return DataApiErrorFactory.create(
    apiError.code,
    `${context} failed: ${apiError.message}`,
    apiError.details,
  );
}

export class EntitySearchService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async search(query: EntitySearchQuery): Promise<EntitySearchResponse> {
    const requestedTypes = new Set(query.types ?? entitySearchTypes);
    const types = entitySearchTypes.filter((type) => requestedTypes.has(type));
    const updatedAtFromMs = getUpdatedAtFromMs(query.updatedAtFrom);
    const limit = Math.min(
      query.limitPerType ?? defaultLimitPerType,
      ENTITY_SEARCH_MAX_LIMIT_PER_TYPE,
    );
    const groups: EntitySearchGroup[] = [];

    for (const type of types) {
      try {
        // Keep desktop's fail-fast all-or-nothing behavior while adapting DB reads to Expo async.
        groups.push(await this.searchType(type, query.q, limit, updatedAtFromMs));
      } catch (error) {
        logger.error('entity search type failed', error as Error, { type });
        throw withTypeContext(type, error);
      }
    }
    return { groups, query: query.q };
  }

  private async searchType(
    type: EntitySearchType,
    q: string,
    limit: number,
    updatedAtFrom: number | undefined,
  ): Promise<EntitySearchGroup> {
    switch (type) {
      case 'assistant':
        return { items: await this.searchAssistants(q, limit, updatedAtFrom), type };
      case 'topic':
        return { items: await this.searchTopics(q, limit, updatedAtFrom), type };
      default: {
        const exhaustive: never = type;
        throw new Error(`Unknown entity search type: ${exhaustive}`);
      }
    }
  }

  private async searchAssistants(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [isNull(assistantTable.deletedAt)];
    const search = or(
      sql`${assistantTable.name} LIKE ${pattern} ESCAPE '\\'`,
      sql`${assistantTable.description} LIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) conditions.push(search);
    if (updatedAtFrom !== undefined) conditions.push(gte(assistantTable.updatedAt, updatedAtFrom));
    const rows = await this.db
      .select({
        description: assistantTable.description,
        emoji: assistantTable.emoji,
        id: assistantTable.id,
        name: assistantTable.name,
        updatedAt: assistantTable.updatedAt,
      })
      .from(assistantTable)
      .where(and(...conditions))
      .orderBy(desc(assistantTable.updatedAt), asc(assistantTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'assistant' }> => ({
        emoji: row.emoji,
        id: row.id,
        subtitle: row.description || undefined,
        target: { assistantId: row.id },
        title: row.name,
        type: 'assistant',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }

  private async searchTopics(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [
      isNull(topicTable.deletedAt),
      sql`${topicTable.name} LIKE ${pattern} ESCAPE '\\'`,
    ];
    if (updatedAtFrom !== undefined) conditions.push(gte(topicTable.updatedAt, updatedAtFrom));
    const rows = await this.db
      .select({
        assistantId: topicTable.assistantId,
        // Expo SQLite exposes positional raw rows, while sqlite-proxy starts from keyed rows.
        // Alias duplicate `name` columns explicitly so both drivers preserve every value.
        assistantName: sql<null | string>`${assistantTable.name}`.as('assistant_name'),
        id: topicTable.id,
        name: topicTable.name,
        updatedAt: topicTable.updatedAt,
      })
      .from(topicTable)
      .leftJoin(
        assistantTable,
        and(eq(topicTable.assistantId, assistantTable.id), isNull(assistantTable.deletedAt)),
      )
      .where(and(...conditions))
      .orderBy(desc(topicTable.updatedAt), asc(topicTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'topic' }> => ({
        id: row.id,
        subtitle: row.assistantName ?? undefined,
        target: { assistantId: row.assistantId ?? undefined, topicId: row.id },
        title: row.name,
        type: 'topic',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }
}

export const entitySearchService = new EntitySearchService();
