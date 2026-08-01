import { loggerService } from '@logger';
import { and, asc, desc, eq, gte, isNull, or, type SQL, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import {
  agentSessionTable,
  agentTable,
  assistantTable,
  knowledgeBaseTable,
  topicTable,
} from '@/backend/data/db/schemas';
import {
  DataApiErrorFactory,
  isDataApiError,
  toDataApiError,
} from '@cherrystudio/universal/data/api/errors';
import {
  ENTITY_SEARCH_MAX_LIMIT_PER_TYPE,
  type EntitySearchGroup,
  type EntitySearchItem,
  type EntitySearchQuery,
  type EntitySearchResponse,
  type EntitySearchType,
  entitySearchTypes,
} from '@cherrystudio/universal/data/api/schemas/search';

import { timestampToISO } from './utils/rowMappers';

const defaultLimitPerType = 50;
const builtinAgentDescription =
  'Built-in Cherry Studio advisor. Diagnose issues, guide operations, collect FAQs, submit bugs/feature requests, and search/create Skills';
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
    apiError.requestContext,
  );
}

function agentAvatar(configuration: Record<string, unknown>): string | undefined {
  return typeof configuration.avatar === 'string' ? configuration.avatar : undefined;
}

function agentDescription(
  description: string,
  configuration: Record<string, unknown>,
): string | undefined {
  if (description) return description;
  return configuration.builtin_role === 'assistant' ? builtinAgentDescription : undefined;
}

export class EntitySearchService {
  constructor(private readonly dbService: DbService) {}

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
      case 'agent':
        return { items: await this.searchAgents(q, limit, updatedAtFrom), type };
      case 'topic':
        return { items: await this.searchTopics(q, limit, updatedAtFrom), type };
      case 'session':
        return { items: await this.searchSessions(q, limit, updatedAtFrom), type };
      case 'knowledge-base':
        return { items: await this.searchKnowledgeBases(q, limit, updatedAtFrom), type };
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

  private async searchAgents(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [isNull(agentTable.deletedAt)];
    const search = or(
      sql`${agentTable.name} LIKE ${pattern} ESCAPE '\\'`,
      sql`${agentTable.description} LIKE ${pattern} ESCAPE '\\'`,
      sql`${agentTable.description} = '' AND json_extract(${agentTable.configuration}, '$.builtin_role') = 'assistant' AND ${builtinAgentDescription} LIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) conditions.push(search);
    if (updatedAtFrom !== undefined) conditions.push(gte(agentTable.updatedAt, updatedAtFrom));
    const rows = await this.db
      .select({
        configuration: agentTable.configuration,
        description: agentTable.description,
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
        emoji: agentAvatar(row.configuration),
        id: row.id,
        subtitle: agentDescription(row.description, row.configuration),
        target: { agentId: row.id },
        title: row.name,
        type: 'agent',
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

  private async searchSessions(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [];
    const search = or(
      sql`${agentSessionTable.name} LIKE ${pattern} ESCAPE '\\'`,
      sql`${agentSessionTable.description} LIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) conditions.push(search);
    if (updatedAtFrom !== undefined) {
      conditions.push(gte(agentSessionTable.updatedAt, updatedAtFrom));
    }
    const rows = await this.db
      .select({
        agentId: agentSessionTable.agentId,
        agentName: sql<null | string>`${agentTable.name}`.as('agent_name'),
        id: agentSessionTable.id,
        name: agentSessionTable.name,
        updatedAt: agentSessionTable.updatedAt,
      })
      .from(agentSessionTable)
      .leftJoin(
        agentTable,
        and(eq(agentSessionTable.agentId, agentTable.id), isNull(agentTable.deletedAt)),
      )
      .where(and(...conditions))
      .orderBy(desc(agentSessionTable.updatedAt), asc(agentSessionTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'session' }> => ({
        id: row.id,
        subtitle: row.agentName ?? undefined,
        target: { agentId: row.agentId, sessionId: row.id },
        title: row.name,
        type: 'session',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }

  private async searchKnowledgeBases(q: string, limit: number, updatedAtFrom?: number) {
    const pattern = likePattern(q);
    const conditions: SQL[] = [sql`${knowledgeBaseTable.name} LIKE ${pattern} ESCAPE '\\'`];
    if (updatedAtFrom !== undefined) {
      conditions.push(gte(knowledgeBaseTable.updatedAt, updatedAtFrom));
    }
    const rows = await this.db
      .select({
        id: knowledgeBaseTable.id,
        name: knowledgeBaseTable.name,
        updatedAt: knowledgeBaseTable.updatedAt,
      })
      .from(knowledgeBaseTable)
      .where(and(...conditions))
      .orderBy(desc(knowledgeBaseTable.updatedAt), asc(knowledgeBaseTable.id))
      .limit(limit);
    return rows.map(
      (row): Extract<EntitySearchItem, { type: 'knowledge-base' }> => ({
        id: row.id,
        target: { knowledgeBaseId: row.id },
        title: row.name,
        type: 'knowledge-base',
        updatedAt: timestampToISO(row.updatedAt),
      }),
    );
  }
}
