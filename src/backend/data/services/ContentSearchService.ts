import {
  coerceSearchRole,
  TOPIC_MESSAGE_SEARCH_ROLES,
} from '@cherrystudio/universal/data/types/message';
import { loggerService } from '@logger';
import { sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { toDataApiError } from '@/shared/data/api/errors';
import {
  CONTENT_SEARCH_DEFAULT_LIMIT,
  CONTENT_SEARCH_MAX_LIMIT,
  type ContentSearchQuery,
  type ContentSearchResponse,
  type TopicMessageContentSearchItem,
} from '@/shared/data/api/schemas/search';

import { type SearchFetchContext, searchWithCursor } from './utils/ftsSearch';
import { timestampToISO } from './utils/rowMappers';
import { buildSearchSnippet } from './utils/searchSnippet';

const logger = loggerService.withContext('ContentSearchService');
const topicMessageCursorConfig = {
  errorMessage: 'Invalid message search cursor',
  fieldMessage: 'must be a valid search cursor',
};

type TopicMessageSearchRow = {
  createdAt: number;
  id: string;
  role: string;
  searchableText: string;
  topicAssistantId: null | string;
  topicCreatedAt: number;
  topicId: string;
  topicName: string;
  topicUpdatedAt: number;
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
      const result = await this.searchTopicMessages({
        createdAtFrom: query.createdAtFrom,
        cursor: query.cursor,
        limit,
        q: query.q,
        topicId: query.topicId,
      });
      return { ...result, query: query.q };
    } catch (error) {
      logger.error('content search failed', error as Error);
      throw toDataApiError(error, 'content search');
    }
  }

  private searchTopicMessages(query: {
    createdAtFrom?: string;
    cursor?: string;
    limit: number;
    q: string;
    topicId?: string;
  }) {
    const topicCondition = query.topicId ? sql`message.topic_id = ${query.topicId}` : sql`1 = 1`;
    return searchWithCursor<TopicMessageSearchRow, TopicMessageContentSearchItem>({
      buildSnippet: buildSearchSnippet,
      createdAtFrom: query.createdAtFrom,
      cursor: query.cursor,
      cursorConfig: topicMessageCursorConfig,
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
        return await this.db.all<TopicMessageSearchRow>(sql`
          SELECT
            message.id,
            message.topic_id AS "topicId",
            t.name AS "topicName",
            t.assistant_id AS "topicAssistantId",
            message.role,
            t.created_at AS "topicCreatedAt",
            t.updated_at AS "topicUpdatedAt",
            message.searchable_text AS "searchableText",
            message.created_at AS "createdAt"
          FROM message
          JOIN message_fts fts ON message.fts_rowid = fts.rowid
          JOIN topic t ON t.id = message.topic_id
          WHERE message.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND message.searchable_text != ''
            AND ${topicCondition}
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
          messageId: row.id,
          role: coerceSearchRole(row.role, TOPIC_MESSAGE_SEARCH_ROLES),
          snippet,
          topicAssistantId: row.topicAssistantId ?? undefined,
          topicCreatedAt: timestampToISO(Number(row.topicCreatedAt)),
          topicId: row.topicId,
          topicName: row.topicName,
          topicUpdatedAt: timestampToISO(Number(row.topicUpdatedAt)),
        },
        sort: { createdAt: Number(row.createdAt), id: row.id },
      }),
      q: query.q,
    });
  }
}

export const contentSearchService = new ContentSearchService();
