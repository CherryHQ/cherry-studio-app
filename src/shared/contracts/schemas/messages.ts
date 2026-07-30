import * as z from 'zod';

import type { CursorPaginationParams } from '@/shared/contracts/dataTypes';
import type {
  BranchMessagesResponse,
  Message,
  MessageData,
  TreeResponse,
} from '@/shared/domain/message';
import {
  MessageDataSchema,
  MessageRoleSchema,
  MessageStatsSchema,
  MessageStatusSchema,
  ModelSnapshotSchema,
} from '@/shared/domain/message';

export const CreateMessageSchema = z.strictObject({
  data: MessageDataSchema,
  modelId: z.string().optional(),
  modelSnapshot: ModelSnapshotSchema.optional(),
  parentId: z.string().nullable().optional(),
  role: MessageRoleSchema,
  setAsActive: z.boolean().optional(),
  siblingsGroupId: z.number().optional(),
  stats: MessageStatsSchema.optional(),
  status: MessageStatusSchema.optional(),
});
export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;

export const UpdateMessageSchema = z.strictObject({
  data: MessageDataSchema.optional(),
  parentId: z.string().nullable().optional(),
  siblingsGroupId: z.number().optional(),
  stats: MessageStatsSchema.nullable().optional(),
  status: MessageStatusSchema.optional(),
});
export type UpdateMessageDto = z.infer<typeof UpdateMessageSchema>;

export const ActiveNodeStrategySchema = z.enum(['parent', 'clear']);
export type ActiveNodeStrategy = z.infer<typeof ActiveNodeStrategySchema>;

export interface DeleteMessageResponse {
  deletedIds: string[];
  newActiveNodeId?: string | null;
  reparentedIds?: string[];
}

export const TreeQuerySchema = z.strictObject({
  depth: z.number().int().optional(),
  nodeId: z.string().optional(),
  rootId: z.string().optional(),
});
export type TreeQueryParams = z.infer<typeof TreeQuerySchema>;

export const BranchMessagesQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  includeSiblings: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  nodeId: z.string().optional(),
});
export type BranchMessagesQueryParams = z.infer<typeof BranchMessagesQuerySchema> &
  CursorPaginationParams;

export const DeleteMessageQuerySchema = z.strictObject({
  activeNodeStrategy: ActiveNodeStrategySchema.optional(),
  cascade: z.boolean().optional(),
});
export type DeleteMessageQuery = z.infer<typeof DeleteMessageQuerySchema>;

export const PathThroughQuerySchema = z.strictObject({
  nodeId: z.string().min(1),
});
export type PathThroughQueryParams = z.infer<typeof PathThroughQuerySchema>;

export type MessageSchemas = {
  '/messages/:id': {
    DELETE: {
      params: { id: string };
      query?: DeleteMessageQuery;
      response: DeleteMessageResponse;
    };
    GET: {
      params: { id: string };
      response: Message;
    };
    PATCH: {
      body: UpdateMessageDto;
      params: { id: string };
      response: Message;
    };
  };
  '/messages/:id/siblings': {
    POST: {
      body: MessageData;
      params: { id: string };
      response: Message;
    };
  };
  '/topics/:topicId/messages': {
    GET: {
      params: { topicId: string };
      query?: BranchMessagesQueryParams;
      response: BranchMessagesResponse;
    };
    POST: {
      body: CreateMessageDto;
      params: { topicId: string };
      response: Message;
    };
  };
  '/topics/:topicId/path': {
    GET: {
      params: { topicId: string };
      query: PathThroughQueryParams;
      response: Message[];
    };
  };
  '/topics/:topicId/tree': {
    GET: {
      params: { topicId: string };
      query?: TreeQueryParams;
      response: TreeResponse;
    };
  };
};
