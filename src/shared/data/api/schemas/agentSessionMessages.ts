import * as z from 'zod';

import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const AGENT_SESSION_MESSAGES_DEFAULT_LIMIT = 50;
export const AGENT_SESSION_MESSAGES_MAX_LIMIT = 200;

/**
 * Walks the linear transcript newest-first. Each nextCursor continues toward
 * older messages using the stable (createdAt, id) boundary.
 */
export const ListAgentSessionMessagesQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(AGENT_SESSION_MESSAGES_MAX_LIMIT).optional(),
});
export type ListAgentSessionMessagesQueryParams = z.input<
  typeof ListAgentSessionMessagesQuerySchema
>;
export type ListAgentSessionMessagesQuery = z.output<typeof ListAgentSessionMessagesQuerySchema>;

export type AgentSessionMessageSchemas = {
  '/agent-sessions/:sessionId/messages': {
    GET: {
      params: { sessionId: string };
      query?: ListAgentSessionMessagesQueryParams;
      response: CursorPaginationResponse<AgentMessageView>;
    };
  };
};
