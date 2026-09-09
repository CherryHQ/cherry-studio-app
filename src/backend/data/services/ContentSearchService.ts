import { loggerService } from '@logger';
import { sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { toDataApiError } from '@/shared/data/api/errors';
import {
  CONTENT_SEARCH_DEFAULT_LIMIT,
  CONTENT_SEARCH_MAX_LIMIT,
  type ContentSearchQuery,
  type ContentSearchResponse,
  type SessionMessageContentSearchItem,
  SESSION_MESSAGE_SEARCH_ROLES,
} from '@/shared/data/api/schemas/search';
import { coerceSearchRole } from '@/shared/data/types/message';

import { type SearchFetchContext, searchWithCursor } from './utils/ftsSearch';
import { timestampToISO } from './utils/rowMappers';
import { buildSearchSnippet } from './utils/searchSnippet';

const logger = loggerService.withContext('ContentSearchService');
const sessionMessageCursorConfig = {
  errorMessage: 'Invalid message search cursor',
  fieldMessage: 'must be a valid search cursor',
};

type SessionMessageSearchRow = {
  agentId: string;
  agentName: null | string;
  createdAt: number;
  id: string;
  role: string;
  searchableText: string;
  sessionId: string;
  sessionTitle: string;
};

export class ContentSearchService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  async search(query: ContentSearchQuery, signal?: AbortSignal): Promise<ContentSearchResponse> {
    const limit = Math.min(query.limit ?? CONTENT_SEARCH_DEFAULT_LIMIT, CONTENT_SEARCH_MAX_LIMIT);
    try {
      const result = await this.searchSessionMessages(
        {
          agentId: query.agentId,
          createdAtFrom: query.createdAtFrom,
          cursor: query.cursor,
          limit,
          q: query.q,
          sessionId: query.sessionId,
        },
        signal,
      );
      return { ...result, query: query.q };
    } catch (error) {
      signal?.throwIfAborted();
      logger.error('content search failed', error as Error);
      throw toDataApiError(error, 'content search');
    }
  }

  private searchSessionMessages(
    query: {
      agentId?: string;
      createdAtFrom?: string;
      cursor?: string;
      limit: number;
      q: string;
      sessionId?: string;
    },
    signal?: AbortSignal,
  ) {
    const sqlite = this.dbService.getSqlite();
    const sessionCondition = query.sessionId
      ? sql`message.session_id = ${query.sessionId}`
      : sql`1 = 1`;
    const agentCondition = query.agentId ? sql`session.agent_id = ${query.agentId}` : sql`1 = 1`;
    return searchWithCursor<SessionMessageSearchRow, SessionMessageContentSearchItem>({
      buildSnippet: buildSearchSnippet,
      createdAtFrom: query.createdAtFrom,
      cursor: query.cursor,
      cursorConfig: sessionMessageCursorConfig,
      fetchRows: async ({
        chunkSize,
        createdAtFromMs,
        cursor,
        ftsConditions,
      }: SearchFetchContext) => {
        const createdAtCondition =
          createdAtFromMs !== undefined
            ? sql`message.created_at >= ${createdAtFromMs}`
            : sql`1 = 1`;
        return readSqliteRows<SessionMessageSearchRow>(
          sqlite,
          sql`
          SELECT
            message.id,
            message.session_id AS "sessionId",
            session.name AS "sessionTitle",
            session.agent_id AS "agentId",
            agent.name AS "agentName",
            message.role,
            message.searchable_text AS "searchableText",
            message.created_at AS "createdAt"
          FROM agent_session_message message
          ${
            ftsConditions.length > 0
              ? sql`JOIN agent_session_message_fts fts ON message.fts_rowid = fts.rowid`
              : sql``
          }
          JOIN agent_session session ON session.id = message.session_id
          LEFT JOIN agent ON agent.id = session.agent_id AND agent.deleted_at IS NULL
          WHERE ${sessionCondition}
            AND ${agentCondition}
            AND ${createdAtCondition}
            AND ${ftsConditions.length > 0 ? sql.join(ftsConditions, sql` AND `) : sql`1 = 1`}
            AND ${
              cursor
                ? sql`(message.created_at, message.id) < (${cursor.createdAt}, ${cursor.id})`
                : sql`1 = 1`
            }
          ORDER BY message.created_at DESC, message.id DESC
          LIMIT ${chunkSize}
        `,
          signal,
        );
      },
      getCursor: (row) => ({ createdAt: Number(row.createdAt), id: row.id }),
      getSearchableText: (row) =>
        row.role === 'user' || row.role === 'assistant' ? row.searchableText : '',
      limit: query.limit,
      mapRow: (row, { snippet }) => ({
        item: {
          createdAt: timestampToISO(Number(row.createdAt)),
          agentId: row.agentId,
          agentName: row.agentName ?? undefined,
          messageId: row.id,
          role: coerceSearchRole(row.role, SESSION_MESSAGE_SEARCH_ROLES),
          sessionId: row.sessionId,
          sessionTitle: row.sessionTitle,
          snippet,
        },
        sort: { createdAt: Number(row.createdAt), id: row.id },
      }),
      q: query.q,
      signal,
    });
  }
}

export const contentSearchService = new ContentSearchService();
