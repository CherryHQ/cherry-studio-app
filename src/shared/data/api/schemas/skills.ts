import * as z from 'zod';

import { AgentIdSchema } from '@/shared/data/types/agent';
import {
  type AgentSkillBinding,
  AgentSkillBindingSchema,
  type Skill,
  SkillIdSchema,
  type SkillListItem,
  SkillListItemSchema,
} from '@/shared/data/types/skill';

export const SKILLS_DEFAULT_LIMIT = 50;
export const SKILLS_MAX_LIMIT = 200;
export const SKILL_SEARCH_MAX_LENGTH = 200;

/**
 * Caller-owned search scopes. Authorization is applied before ranking,
 * counting, and pagination, so an empty page is a genuinely empty scope.
 */
export const SkillSearchScopeSchema = z.enum(['library', 'agent', 'composer']);
export type SkillSearchScope = z.infer<typeof SkillSearchScopeSchema>;

export const ListSkillsQuerySchema = z
  .strictObject({
    /** Literal substring match over name and description; empty means browse. */
    search: z.string().trim().max(SKILL_SEARCH_MAX_LENGTH).optional(),
    scope: SkillSearchScopeSchema.default('library'),
    /** Required for the `agent` and `composer` scopes. */
    agentId: AgentIdSchema.optional(),
    limit: z.coerce.number().int().positive().max(SKILLS_MAX_LIMIT).default(SKILLS_DEFAULT_LIMIT),
    cursor: z.string().optional(),
  })
  .refine((query) => query.scope === 'library' || query.agentId !== undefined, {
    message: 'agentId is required for Agent-scoped Skill queries',
    path: ['agentId'],
  });
export type ListSkillsQueryParams = z.input<typeof ListSkillsQuerySchema>;
export type ListSkillsQuery = z.output<typeof ListSkillsQuerySchema>;

export const ListSkillsResponseSchema = z.strictObject({
  items: z.array(SkillListItemSchema),
  nextCursor: z.string().optional(),
});
export type ListSkillsResponse = z.infer<typeof ListSkillsResponseSchema>;

export const UpdateSkillSchema = z.strictObject({
  isGlobalEnabled: z.boolean(),
});
export type UpdateSkillDto = z.infer<typeof UpdateSkillSchema>;

export const AgentSkillUpdateSchema = z.strictObject({
  skillId: SkillIdSchema,
  /** `null` removes the binding; a boolean upserts it with that enablement. */
  isEnabled: z.boolean().nullable(),
});
export type AgentSkillUpdate = z.infer<typeof AgentSkillUpdateSchema>;

/** Applies only the listed Skills; unrelated bindings are preserved. */
export const ReplaceAgentSkillsSchema = z.strictObject({
  updates: z.array(AgentSkillUpdateSchema).max(SKILLS_MAX_LIMIT),
});
export type ReplaceAgentSkillsInput = z.input<typeof ReplaceAgentSkillsSchema>;

export const ListAgentSkillBindingsResponseSchema = z.strictObject({
  items: z.array(AgentSkillBindingSchema),
});

export type SkillSchemas = {
  '/skills': {
    GET: {
      query?: ListSkillsQueryParams;
      response: ListSkillsResponse;
    };
  };
  '/skills/:skillId': {
    GET: {
      params: { skillId: string };
      response: SkillListItem;
    };
    PATCH: {
      body: UpdateSkillDto;
      params: { skillId: string };
      response: Skill;
    };
  };
  '/agents/:agentId/skills': {
    GET: {
      params: { agentId: string };
      response: { items: SkillListItem[] };
    };
    PUT: {
      body: ReplaceAgentSkillsInput;
      params: { agentId: string };
      response: { items: AgentSkillBinding[] };
    };
  };
};
