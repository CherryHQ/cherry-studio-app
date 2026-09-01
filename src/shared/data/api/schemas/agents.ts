import * as z from 'zod';

import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import { type Agent, AgentSchema } from '@/shared/data/types/agent';

import { type OrderEndpoints } from './endpointHelpers';

/**
 * `avatar` is deliberately not mutable here: it is a managed file reference
 * written by the avatar workflow (create-new → update-db → delete-old), not a
 * value a caller may set directly.
 */
const AGENT_MUTABLE_FIELDS = {
  disabledCapabilities: true,
  instructions: true,
  modelId: true,
  name: true,
  toolApprovalMode: true,
} as const;

export const CreateAgentSchema = AgentSchema.pick(AGENT_MUTABLE_FIELDS)
  .partial()
  .required({ name: true })
  .strict();
export type CreateAgentDto = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = AgentSchema.pick(AGENT_MUTABLE_FIELDS).partial().strict();
export type UpdateAgentDto = z.infer<typeof UpdateAgentSchema>;

/**
 * The avatar's own write channel, kept off the CRUD DTOs because setting one is
 * a workflow (normalize → store → update column → drop the previous file)
 * rather than a field assignment.
 */
export const SetAgentAvatarSchema = z.strictObject({
  /** Transient picker or camera URI; the workflow normalizes and copies it. */
  sourceUri: z.string().min(1),
});
export type SetAgentAvatarDto = z.infer<typeof SetAgentAvatarSchema>;

export const AGENTS_DEFAULT_PAGE = 1;
export const AGENTS_DEFAULT_LIMIT = 100;
export const AGENTS_MAX_LIMIT = 500;

export const ListAgentsQuerySchema = z.strictObject({
  id: z.string().optional(),
  limit: z.coerce.number().int().positive().max(AGENTS_MAX_LIMIT).default(AGENTS_DEFAULT_LIMIT),
  page: z.coerce.number().int().positive().default(AGENTS_DEFAULT_PAGE),
  search: z.string().trim().min(1).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'orderKey']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type ListAgentsQueryParams = z.input<typeof ListAgentsQuerySchema>;
export type ListAgentsQuery = z.output<typeof ListAgentsQuerySchema>;

/** Soft delete: the row is tombstoned and its Sessions stay readable. */
export interface DeleteAgentResult {
  deleted: boolean;
}

export type AgentSchemas = {
  '/agents': {
    GET: {
      query?: ListAgentsQueryParams;
      response: OffsetPaginationResponse<Agent>;
    };
    POST: {
      body: CreateAgentDto;
      response: Agent;
    };
  };
  '/agents/:id': {
    DELETE: {
      params: { id: string };
      response: DeleteAgentResult;
    };
    GET: {
      params: { id: string };
      response: Agent;
    };
    PATCH: {
      body: UpdateAgentDto;
      params: { id: string };
      response: Agent;
    };
  };
  '/agents/:id/avatar': {
    PUT: {
      body: SetAgentAvatarDto;
      params: { id: string };
      response: Agent;
    };
  };
} & OrderEndpoints<'/agents'>;
