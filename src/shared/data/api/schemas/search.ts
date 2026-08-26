/**
 * Search read-model API schemas.
 *
 * Entity search is navigation-oriented and returns lightweight targets.
 * Content search is full-text-oriented and keeps per-source cursor semantics.
 */

import * as z from 'zod';

import type { AgentMessageView } from '@/shared/contracts/agent';

export type EntitySearchTarget =
  | { type: 'agent'; target: { agentId: string } }
  | { type: 'session'; target: { sessionId: string; agentId: string } };

export type EntitySearchType = EntitySearchTarget['type'];
export const entitySearchTypes = [
  'agent',
  'session',
] as const satisfies readonly EntitySearchType[];
export const EntitySearchTypeSchema = z.enum(entitySearchTypes);
export const ENTITY_SEARCH_MAX_LIMIT_PER_TYPE = 200;

export const EntitySearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1),
  types: z.array(EntitySearchTypeSchema).min(1).optional(),
  updatedAtFrom: z.iso.datetime().optional(),
  limitPerType: z.coerce.number().int().positive().max(ENTITY_SEARCH_MAX_LIMIT_PER_TYPE).optional(),
});
export type EntitySearchQueryParams = z.input<typeof EntitySearchQuerySchema>;
export type EntitySearchQuery = z.output<typeof EntitySearchQuerySchema>;

export type EntitySearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  lastActivityAt?: string;
  updatedAt?: string;
} & EntitySearchTarget;

export type EntitySearchGroup = {
  [T in EntitySearchType]: {
    type: T;
    items: Extract<EntitySearchItem, { type: T }>[];
  };
}[EntitySearchType];

export type EntitySearchResponse = {
  query: string;
  groups: EntitySearchGroup[];
};

export type EntitySearchSchemas = {
  '/search/entities': {
    GET: {
      query: EntitySearchQueryParams;
      response: EntitySearchResponse;
    };
  };
};

export const CONTENT_SEARCH_DEFAULT_LIMIT = 50;
export const CONTENT_SEARCH_MAX_LIMIT = 1000;

/**
 * Content search reads one source — Agent Session messages over FTS. The
 * former multi-source shell described desktop surfaces mobile never had.
 */
export const ContentSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1),
  cursor: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(CONTENT_SEARCH_MAX_LIMIT).optional(),
  createdAtFrom: z.iso.datetime().optional(),
});
export type ContentSearchQueryParams = z.input<typeof ContentSearchQuerySchema>;
export type ContentSearchQuery = z.output<typeof ContentSearchQuerySchema>;

export const SESSION_MESSAGE_SEARCH_ROLES = [
  'user',
  'assistant',
  'system',
] as const satisfies readonly AgentMessageView['role'][];
export type SessionMessageSearchRole = (typeof SESSION_MESSAGE_SEARCH_ROLES)[number];

export interface SessionMessageContentSearchItem {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  agentId: string;
  agentName?: string;
  role?: SessionMessageSearchRole;
  snippet: string;
  createdAt: string;
}

export type ContentSearchResponse = {
  query: string;
  items: SessionMessageContentSearchItem[];
  nextCursor?: string;
};

export type ContentSearchSchemas = {
  '/search/contents': {
    GET: {
      query: ContentSearchQueryParams;
      response: ContentSearchResponse;
    };
  };
};

export type SearchSchemas = EntitySearchSchemas & ContentSearchSchemas;
