import * as z from 'zod';

import type { CursorPaginationResponse } from '@/shared/contracts/dataTypes';
import { type Topic, TopicSchema } from '@/shared/domain/topic';

import { type OrderEndpoints } from './_endpointHelpers';

export const CreateTopicSchema = TopicSchema.pick({
  groupId: true,
  name: true,
})
  .partial()
  .extend({
    assistantId: z.string().nullable().optional(),
  })
  .strict();
export type CreateTopicDto = z.infer<typeof CreateTopicSchema>;

export const UpdateTopicSchema = TopicSchema.pick({
  groupId: true,
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

export interface ActiveNodeResponse {
  activeNodeId: string;
}

export type TopicSchemas = {
  '/topics': {
    GET: {
      query?: ListTopicsQuery;
      response: CursorPaginationResponse<Topic>;
    };
    POST: {
      body: CreateTopicDto;
      response: Topic;
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
} & OrderEndpoints<'/topics'>;
