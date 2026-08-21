/**
 * Search read-model API schemas.
 *
 * Entity search is navigation-oriented and returns lightweight targets.
 * Content search is full-text-oriented and keeps per-source cursor semantics.
 */

import type { TopicMessageSearchRole } from '@cherrystudio/universal/data/types/message';
import * as z from 'zod';

export type EntitySearchTarget =
  | { type: 'assistant'; target: { assistantId: string } }
  | { type: 'topic'; target: { topicId: string; assistantId?: string } };

export type EntitySearchType = EntitySearchTarget['type'];
export const entitySearchTypes = [
  'assistant',
  'topic',
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
  emoji?: string;
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
 * Content search reads one source — topic messages over FTS. The former
 * multi-source shell (`sources` array, per-source cursor/filter records)
 * described desktop surfaces mobile never had.
 */
export const ContentSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1),
  cursor: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(CONTENT_SEARCH_MAX_LIMIT).optional(),
  createdAtFrom: z.iso.datetime().optional(),
});
export type ContentSearchQueryParams = z.input<typeof ContentSearchQuerySchema>;
export type ContentSearchQuery = z.output<typeof ContentSearchQuerySchema>;

export interface TopicMessageContentSearchItem {
  messageId: string;
  topicId: string;
  topicName: string;
  topicAssistantId?: string;
  role?: TopicMessageSearchRole;
  topicCreatedAt: string;
  topicUpdatedAt: string;
  snippet: string;
  createdAt: string;
}

export type ContentSearchResponse = {
  query: string;
  items: TopicMessageContentSearchItem[];
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
