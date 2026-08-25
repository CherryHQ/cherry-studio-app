/**
 * Message API Schema definitions
 *
 * Contains the message endpoints for the conversation view and message management.
 */

import * as z from 'zod';

import type { CursorPaginationParams, CursorPaginationResponse } from '@/shared/data/api/types';
import type { Message } from '@/shared/data/types/message';
import {
  ContentMessageRoleSchema,
  MessageDataSchema,
  MessageSnapshotSchema,
  MessageStatusSchema,
} from '@/shared/data/types/message';

export interface BranchMessage {
  message: Message;
  siblingsGroup?: Message[];
}

export interface BranchMessagesResponse extends CursorPaginationResponse<BranchMessage> {
  activeNodeId: string | null;
  assistantId: string | null;
}

// ============================================================================
// DTOs
// ============================================================================

/**
 * DTO for creating a new message.
 *
 * Hand-written (not `MessageSchema.pick(...)`) because `parentId` has DTO-only
 * semantics — omitted means "auto-resolve", explicit `null` means "create as
 * root", a string means "attach to parent". The entity shape can't express
 * this three-way distinction, so the DTO is authored directly.
 */
export const CreateMessageSchema = z.strictObject({
  /**
   * Parent message ID for positioning this message in the conversation tree.
   *
   * Behavior (every topic owns a content-less virtual root; see message-tree.md):
   * - `undefined` (omitted): attach to `activeNodeId`, or to the virtual root on an
   *   empty topic (a first-turn message).
   * - `null` (explicit): first-turn message — resolved to the topic's virtual root, so
   *   first turns and their resends are ordinary siblings under it.
   * - `string` (message ID): Attach to specified parent. Throws NOT_FOUND if
   *   parent doesn't exist, or INVALID_OPERATION if parent belongs to a different topic.
   */
  parentId: z.string().nullable().optional(),
  /** Message role — content roles only; the virtual root is created internally, not via this DTO */
  role: ContentMessageRoleSchema,
  /** Message content */
  data: MessageDataSchema,
  /** Message status */
  status: MessageStatusSchema.optional(),
  /** Siblings group ID (0 = normal, >0 = multi-model group) */
  siblingsGroupId: z.number().optional(),
  /** Model identifier */
  modelId: z.string().optional(),
  /** Model snapshot captured at message creation time */
  messageSnapshot: MessageSnapshotSchema.optional(),
  /** Set this message as the active node in the topic (default: true) */
  setAsActive: z.boolean().optional(),
});
export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;

/**
 * DTO for updating an existing message
 */
export const UpdateMessageSchema = z.strictObject({
  /** Updated message content */
  data: MessageDataSchema.optional(),
  /** Move message to new parent */
  parentId: z.string().nullable().optional(),
  /** Change siblings group */
  siblingsGroupId: z.number().optional(),
  /** Update status */
  status: MessageStatusSchema.optional(),
});
export type UpdateMessageDto = z.infer<typeof UpdateMessageSchema>;

/**
 * Strategy for updating activeNodeId when the active message is deleted
 */
export const ActiveNodeStrategySchema = z.enum(['parent', 'clear']);
export type ActiveNodeStrategy = z.infer<typeof ActiveNodeStrategySchema>;

/**
 * Response for delete operation
 */
export interface DeleteMessageResponse {
  /** IDs of deleted messages */
  deletedIds: string[];
  /** IDs of reparented children (only when cascade=false) */
  reparentedIds?: string[];
  /** New activeNodeId for the topic (only if activeNodeId was affected by deletion) */
  newActiveNodeId?: string | null;
}

/**
 * Response for "clear all messages" — deletes every content message of a topic
 * (the virtual root's whole subtree) in one transaction, keeping the content-less
 * virtual root and clearing activeNodeId.
 */
export interface ClearTopicMessagesResponse {
  /** IDs of the deleted (live) messages */
  deletedIds: string[];
}

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Query parameters for GET /topics/:id/messages
 *
 * Uses "before cursor" semantics for loading historical messages:
 * - First request (no cursor): Returns the most recent `limit` messages
 * - Subsequent requests: Pass `nextCursor` from previous response as `cursor`
 *   to load older messages towards root
 * - The cursor message itself is NOT included in the response
 */
export const BranchMessagesQuerySchema = z.strictObject({
  /** Cursor for pagination (exclusive boundary) */
  cursor: z.string().optional(),
  /** Page size */
  limit: z.number().int().positive().optional(),
  /** End node ID (defaults to topic.activeNodeId) */
  nodeId: z.string().optional(),
  /** Whether to include siblingsGroup in response */
  includeSiblings: z.boolean().optional(),
});
export type BranchMessagesQueryParams = z.infer<typeof BranchMessagesQuerySchema> &
  CursorPaginationParams;

// ============================================================================
// API Schema Definitions
// ============================================================================

/**
 * Message API Schema definitions
 *
 * Organized by domain responsibility:
 * - /topics/:id/messages - Branch messages for conversation
 * - /messages/:id - Individual message operations
 */
export type MessageSchemas = {
  /**
   * Branch messages endpoint for conversation view
   * @example GET /topics/abc123/messages?limit=20
   * @example POST /topics/abc123/messages { "parentId": "msg1", "role": "user", "data": {...} }
   */
  '/topics/:topicId/messages': {
    /** Get messages along active branch with pagination */
    GET: {
      params: { topicId: string };
      query?: BranchMessagesQueryParams;
      response: BranchMessagesResponse;
    };
    /** Create a new message in the topic */
    POST: {
      params: { topicId: string };
      body: CreateMessageDto;
      response: Message;
    };
    /** Clear all of the topic's messages, keeping the (content-less) virtual root */
    DELETE: {
      params: { topicId: string };
      response: ClearTopicMessagesResponse;
    };
  };

  /**
   * Individual message endpoint
   * @example GET /messages/msg123
   * @example PATCH /messages/msg123 { "data": {...} }
   */
  '/messages/:id': {
    /** Get a single message by ID */
    GET: {
      params: { id: string };
      response: Message;
    };
    /** Update a message's content or status */
    PATCH: {
      params: { id: string };
      body: UpdateMessageDto;
      response: Message;
    };
  };
};
