import type { CursorPaginationResponse } from '@shared/data/api/types';
import { type Topic, TopicNameSchema, TopicSchema } from '@shared/data/types/topic';
import * as z from 'zod';

import type { OrderEndpoints } from './_endpointHelpers';

export const CreateTopicSchema = TopicSchema.pick({
  assistantId: true,
  name: true,
}).partial();
export type CreateTopicDto = z.infer<typeof CreateTopicSchema>;

export const UpdateTopicSchema = TopicSchema.pick({
  isNameManuallyEdited: true,
  name: true,
})
  .partial()
  .extend({
    assistantId: z.string().nullable().optional(),
  });
export type UpdateTopicDto = z.infer<typeof UpdateTopicSchema>;

export const ListTopicsQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  q: z.string().optional(),
});
export type ListTopicsQuery = z.infer<typeof ListTopicsQuerySchema>;

export const SetActiveNodeSchema = z.strictObject({
  nodeId: z.string().min(1),
});
export type SetActiveNodeDto = z.infer<typeof SetActiveNodeSchema>;

export const DuplicateTopicSchema = z.strictObject({
  name: z.string().trim().pipe(TopicNameSchema).optional(),
  nodeId: z.string().min(1),
});
export type DuplicateTopicDto = z.infer<typeof DuplicateTopicSchema>;

export interface ActiveNodeResponse {
  activeNodeId: string;
}

export interface DeleteTopicsResult {
  deletedCount: number;
  deletedIds: string[];
}

export interface LatestTopicResponse {
  topic: Topic | null;
}

const CommaSeparatedTopicIdsSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(1));

// The in-process mobile transport accepts structured arrays in addition to the
// desktop HTTP comma-separated representation.
const DeleteTopicsIdsQueryValueSchema = z.union([
  CommaSeparatedTopicIdsSchema,
  z.array(z.string().min(1)).min(1),
]);

export const DeleteTopicsQuerySchema = z.strictObject({
  ids: DeleteTopicsIdsQueryValueSchema,
});
export type DeleteTopicsQuery = z.input<typeof DeleteTopicsQuerySchema>;

export type TopicSchemas = {
  '/assistants/:assistantId/topics': {
    DELETE: {
      params: { assistantId: string };
      response: DeleteTopicsResult;
    };
  };
  '/topics': {
    DELETE: {
      query: DeleteTopicsQuery;
      response: DeleteTopicsResult;
    };
    GET: {
      query?: ListTopicsQuery;
      response: CursorPaginationResponse<Topic>;
    };
    POST: {
      body: CreateTopicDto;
      response: Topic;
    };
  };
  '/topics/latest': {
    GET: {
      response: LatestTopicResponse;
    };
  };
  '/topics/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: Topic;
    };
    PATCH: {
      body: UpdateTopicDto;
      params: { id: string };
      response: Topic;
    };
  };
  '/topics/:id/active-node': {
    PUT: {
      body: SetActiveNodeDto;
      params: { id: string };
      response: ActiveNodeResponse;
    };
  };
  '/topics/:id/duplicate': {
    POST: {
      body: DuplicateTopicDto;
      params: { id: string };
      response: Topic;
    };
  };
} & OrderEndpoints<'/topics'>;
