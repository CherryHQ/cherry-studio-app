import { loggerService } from '@logger';
import { and, asc, desc, eq, gte, isNull, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentSessionTable, agentTable } from '@/backend/data/db/schemas';
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
      case 'agent':
        return { items: await this.searchAgents(q, limit, updatedAtFrom), type };
      case 'session':
        return { items: await this.searchSessions(q, limit, updatedAtFrom), type };
      default: {
        const exhaustive: never = type;
        throw new Error(`Unknown entity search type: ${exhaustive}`);
      }
    }
  }

  private async searchAgents(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [isNull(agentTable.deletedAt)];
    conditions.push(sql`${agentTable.name} LIKE ${pattern} ESCAPE '\\'`);
    if (updatedAtFrom !== undefined) conditions.push(gte(agentTable.updatedAt, updatedAtFrom));
    const rows = await this.db
      .select({
        id: agentTable.id,
        name: agentTable.name,
        updatedAt: agentTable.updatedAt,
      })
      .from(agentTable)
      .where(and(...conditions))
      .orderBy(desc(agentTable.updatedAt), asc(agentTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'agent' }> => ({
        id: row.id,
        target: { agentId: row.id },
        title: row.name,
        type: 'agent',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }

  private async searchSessions(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [sql`${agentSessionTable.title} LIKE ${pattern} ESCAPE '\\'`];
    if (updatedAtFrom !== undefined) {
      conditions.push(gte(agentSessionTable.updatedAt, updatedAtFrom));
    }
    const rows = await this.db
      .select({
        agentId: agentSessionTable.agentId,
        // Expo SQLite exposes positional raw rows, while sqlite-proxy starts from keyed rows.
        // Alias duplicate `name` columns explicitly so both drivers preserve every value.
        agentName: sql<null | string>`${agentTable.name}`.as('agent_name'),
        id: agentSessionTable.id,
        lastActivityAt: agentSessionTable.lastActivityAt,
        title: agentSessionTable.title,
        updatedAt: agentSessionTable.updatedAt,
      })
      .from(agentSessionTable)
      .leftJoin(
        agentTable,
        and(eq(agentSessionTable.agentId, agentTable.id), isNull(agentTable.deletedAt)),
      )
      .where(and(...conditions))
      .orderBy(desc(agentSessionTable.lastActivityAt), asc(agentSessionTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'session' }> => ({
        id: row.id,
        lastActivityAt: timestampToISO(row.lastActivityAt),
        subtitle: row.agentName ?? undefined,
        target: { agentId: row.agentId, sessionId: row.id },
        title: row.title,
        type: 'session',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }
}

export const entitySearchService = new EntitySearchService();
