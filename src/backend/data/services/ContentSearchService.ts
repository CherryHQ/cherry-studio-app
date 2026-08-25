import { loggerService } from '@logger';
import { sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
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

  private get db() {
    return this.dbService.getDb();
  }

  async search(query: ContentSearchQuery): Promise<ContentSearchResponse> {
    const limit = Math.min(query.limit ?? CONTENT_SEARCH_DEFAULT_LIMIT, CONTENT_SEARCH_MAX_LIMIT);
    try {
      const result = await this.searchSessionMessages({
        createdAtFrom: query.createdAtFrom,
        cursor: query.cursor,
        limit,
        q: query.q,
        sessionId: query.sessionId,
      });
      return { ...result, query: query.q };
    } catch (error) {
      logger.error('content search failed', error as Error);
      throw toDataApiError(error, 'content search');
    }
  }

  private searchSessionMessages(query: {
    createdAtFrom?: string;
    cursor?: string;
    limit: number;
    q: string;
    sessionId?: string;
  }) {
    const sessionCondition = query.sessionId
      ? sql`message.session_id = ${query.sessionId}`
      : sql`1 = 1`;
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
        offset,
      }: SearchFetchContext) => {
        const createdAtCondition =
          createdAtFromMs !== undefined
            ? sql`message.created_at >= ${createdAtFromMs}`
            : sql`1 = 1`;
        return await this.db.all<SessionMessageSearchRow>(sql`
          SELECT
            message.id,
            message.session_id AS "sessionId",
            session.title AS "sessionTitle",
            session.agent_id AS "agentId",
            agent.name AS "agentName",
            message.role,
            message.searchable_text AS "searchableText",
            message.created_at AS "createdAt"
          FROM agent_session_message message
          JOIN agent_session_message_fts fts ON message.fts_rowid = fts.rowid
          JOIN agent_session session ON session.id = message.session_id
          LEFT JOIN agent ON agent.id = session.agent_id AND agent.deleted_at IS NULL
          WHERE message.searchable_text != ''
            AND ${sessionCondition}
            AND ${createdAtCondition}
            AND ${sql.join(ftsConditions, sql` AND `)}
            AND ${
              cursor
                ? sql`(message.created_at < ${cursor.createdAt} OR (message.created_at = ${cursor.createdAt} AND message.id < ${cursor.id}))`
                : sql`1 = 1`
            }
          ORDER BY message.created_at DESC, message.id DESC
          LIMIT ${chunkSize}
          OFFSET ${offset}
        `);
      },
      getSearchableText: (row) => row.searchableText,
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
    });
  }
}

export const contentSearchService = new ContentSearchService();
