import * as z from 'zod';

import { AgentSessionViewSchema } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const AgentSessionEntitySchema = AgentSessionViewSchema.extend({
  /** Last real conversation activity, used for recency ordering. */
  lastActivityAt: z.iso.datetime(),
});
export type AgentSessionEntity = z.infer<typeof AgentSessionEntitySchema>;

export const ListAgentSessionsQuerySchema = z.strictObject({
  agentId: z.string().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});
export type ListAgentSessionsQueryParams = z.input<typeof ListAgentSessionsQuerySchema>;
export type ListAgentSessionsQuery = z.output<typeof ListAgentSessionsQuerySchema>;

export const UpdateAgentSessionSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
});
export type UpdateAgentSessionDto = z.infer<typeof UpdateAgentSessionSchema>;

export type AgentSessionSchemas = {
  '/agent-sessions': {
    GET: {
      query?: ListAgentSessionsQueryParams;
      response: CursorPaginationResponse<AgentSessionEntity>;
    };
  };
  '/agent-sessions/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: AgentSessionEntity;
    };
    PATCH: {
      body: UpdateAgentSessionDto;
      params: { id: string };
      response: AgentSessionEntity;
    };
  };
};
