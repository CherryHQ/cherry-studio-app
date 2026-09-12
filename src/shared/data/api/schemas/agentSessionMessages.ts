import * as z from 'zod';

import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const AGENT_SESSION_MESSAGES_DEFAULT_LIMIT = 50;
export const AGENT_SESSION_MESSAGES_MAX_LIMIT = 200;

/**
 * Items always remain newest-first. nextCursor continues toward older messages;
 * previousCursor is read with direction=newer. An initial aroundMessageId page
 * contains the target and its neighbors, bounded by limit in total.
 */
export const ListAgentSessionMessagesQuerySchema = z
  .strictObject({
    aroundMessageId: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    direction: z.enum(['older', 'newer']).optional(),
    limit: z.coerce.number().int().positive().max(AGENT_SESSION_MESSAGES_MAX_LIMIT).optional(),
  })
  .refine((query) => !query.aroundMessageId || (!query.cursor && !query.direction), {
    message: 'aroundMessageId cannot be combined with cursor or direction',
    path: ['aroundMessageId'],
  })
  .refine((query) => query.direction !== 'newer' || Boolean(query.cursor), {
    message: 'Newer pagination requires a cursor',
    path: ['cursor'],
  });
export type ListAgentSessionMessagesQueryParams = z.input<
  typeof ListAgentSessionMessagesQuerySchema
>;
export type ListAgentSessionMessagesQuery = z.output<typeof ListAgentSessionMessagesQuerySchema>;

export type AgentSessionMessagePage = CursorPaginationResponse<AgentMessageView> & {
  previousCursor?: string;
};

export type AgentSessionMessageSchemas = {
  '/agent-sessions/:sessionId/messages': {
    GET: {
      params: { sessionId: string };
      query?: ListAgentSessionMessagesQueryParams;
      response: AgentSessionMessagePage;
    };
  };
};
