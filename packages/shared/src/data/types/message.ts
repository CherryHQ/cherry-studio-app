import { CURRENCY, objectValues } from '@cherrystudio/provider-registry';
import type {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  InferUIMessageChunk,
  ReasoningUIPart,
  TextUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from 'ai';
import * as z from 'zod';

import type { CursorPaginationResponse } from '@shared/data/api/types';
import { type ReasoningEffortOption, ReasoningEffortOptionSchema } from '@shared/types/aiSdk';
import type { CherryDataPartTypes } from './uiParts';

export const MessageIdSchema = z.uuid();
export type MessageId = z.infer<typeof MessageIdSchema>;

/**
 * Materialized statistics for one assistant message. Usage, request counts,
 * costs, and provider performance are projections of immutable usage records.
 * Runtime timing is message-owned and written by runtime persistence. Scalar
 * timing fields are historical compatibility data read only when
 * `runtimeTiming` is absent.
 */
const MessageProviderPerformanceSchema = z.strictObject({
  measuredOutputTokens: z.number().nonnegative(),
  generationDurationMs: z.number().nonnegative(),
});
export type MessageProviderPerformance = z.infer<typeof MessageProviderPerformanceSchema>;

const MessageRuntimeToolExecutionSpanSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('tool-execution'),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1).optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});

const MessageRuntimeApprovalWaitSpanSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('approval-wait'),
  approvalId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1).optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});

export const MessageRuntimeTimingSchema = z.strictObject({
  startedAt: z.number(),
  completedAt: z.number().optional(),
  spans: z.array(
    z.discriminatedUnion('kind', [
      MessageRuntimeToolExecutionSpanSchema,
      MessageRuntimeApprovalWaitSpanSchema,
    ]),
  ),
});
export type MessageRuntimeTiming = z.infer<typeof MessageRuntimeTimingSchema>;
export type MessageRuntimeSpan = MessageRuntimeTiming['spans'][number];

export const MessageStatsSchema = z.strictObject({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  inputTokenDetails: z
    .strictObject({
      noCacheTokens: z.number().optional(),
      cacheReadTokens: z.number().optional(),
      cacheWriteTokens: z.number().optional(),
    })
    .optional(),
  outputTokenDetails: z
    .strictObject({
      textTokens: z.number().optional(),
      reasoningTokens: z.number().optional(),
    })
    .optional(),
  requestCount: z.number().int().nonnegative().optional(),
  estimatedRequestCount: z.number().int().nonnegative().optional(),
  unpricedRequestCount: z.number().int().nonnegative().optional(),
  costs: z
    .array(
      z.strictObject({
        currency: z.enum(objectValues(CURRENCY)),
        amount: z.number().nonnegative(),
        providerReportedRequestCount: z.number().int().nonnegative(),
        computedRequestCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  providerPerformance: MessageProviderPerformanceSchema.optional(),
  runtimeTiming: MessageRuntimeTimingSchema.optional(),
  timeCompletionMs: z.number().optional(),
  timeFirstTokenMs: z.number().optional(),
  timeThinkingMs: z.number().optional(),
});
export type MessageStats = z.infer<typeof MessageStatsSchema>;
export type MessageRuntimeStatsInput = Readonly<Pick<MessageStats, 'runtimeTiming'>>;
export interface MessageRuntimeTimingSink {
  onToolExecutionStart(event: { callId: string; toolName?: string }): void;
  onToolExecutionEnd(event: { callId: string; toolName?: string; durationMs: number }): void;
}

export type CherryMessagePart = UIMessagePart<CherryDataPartTypes, UITools>;

export interface AssistantTurnOptions {
  fastMode?: boolean;
  reasoningEffort?: ReasoningEffortOption;
}

export interface MessageData {
  parts?: CherryMessagePart[];
  turnOptions?: AssistantTurnOptions;
}

export interface CherryUIMessageMetadata {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  completionTokens?: number;
  createdAt?: string;
  modelId?: string;
  messageSnapshot?: MessageSnapshot;
  noCacheTokens?: number;
  parentId?: string | null;
  promptTokens?: number;
  siblingsGroupId?: number;
  stats?: MessageStats;
  status?: MessageStatus;
  turnOptions?: AssistantTurnOptions;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export type CherryUIMessage = UIMessage<CherryUIMessageMetadata, CherryDataPartTypes>;
export type CherryUIMessageChunk = InferUIMessageChunk<CherryUIMessage>;

export type {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  TextUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
};

export enum ReferenceCategory {
  CITATION = 'citation',
  MENTION = 'mention',
}

export enum CitationType {
  KNOWLEDGE = 'knowledge',
  MEMORY = 'memory',
  WEB = 'web',
}

export interface BaseReference {
  category: ReferenceCategory;
  marker?: string;
  range?: { end: number; start: number };
}

interface BaseCitationReference extends BaseReference {
  category: ReferenceCategory.CITATION;
  citationType: CitationType;
}

export interface WebCitationReference extends BaseCitationReference {
  citationType: CitationType.WEB;
  content: {
    results?: unknown;
    source: unknown;
  };
}

export interface KnowledgeCitationReference extends BaseCitationReference {
  citationType: CitationType.KNOWLEDGE;
  content: {
    content: string;
    file?: unknown;
    id: number;
    metadata?: Record<string, unknown>;
    sourceUrl: string;
    type: string;
  }[];
}

export interface MemoryCitationReference extends BaseCitationReference {
  citationType: CitationType.MEMORY;
  content: {
    createdAt?: string;
    hash?: string;
    id: string;
    memory: string;
    metadata?: Record<string, unknown>;
    score?: number;
    updatedAt?: string;
  }[];
}

export type CitationReference =
  | KnowledgeCitationReference
  | MemoryCitationReference
  | WebCitationReference;

export interface MentionReference extends BaseReference {
  category: ReferenceCategory.MENTION;
  displayName?: string;
  modelId: string;
}

export type ContentReference = CitationReference | MentionReference;

export interface SerializedErrorData {
  cause?: unknown;
  code?: string;
  message: string;
  name?: string;
  stack?: string;
}

export const MessageDataSchema: z.ZodType<MessageData> = z.strictObject({
  parts: z.array(z.custom<CherryMessagePart>()).optional(),
  turnOptions: z
    .strictObject({
      fastMode: z.boolean().optional(),
      reasoningEffort: ReasoningEffortOptionSchema.optional(),
    })
    .optional(),
});

export const ModelSnapshotSchema = z.strictObject({
  group: z.string().optional(),
  id: z.string(),
  name: z.string(),
  provider: z.string(),
});
export type ModelSnapshot = z.infer<typeof ModelSnapshotSchema>;

export const MessageSnapshotSchema = z.strictObject({
  emoji: z.string().optional(),
  id: z.string(),
  model: ModelSnapshotSchema,
  name: z.string(),
});
export type MessageSnapshot = z.infer<typeof MessageSnapshotSchema>;

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'root']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const ContentMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ContentMessageRole = z.infer<typeof ContentMessageRoleSchema>;

export const TOPIC_MESSAGE_SEARCH_ROLES = ['user', 'assistant'] as const;
export type TopicMessageSearchRole = (typeof TOPIC_MESSAGE_SEARCH_ROLES)[number];

export const AGENT_SESSION_MESSAGE_SEARCH_ROLES = ['user', 'assistant', 'system'] as const;
export type AgentSessionMessageSearchRole = (typeof AGENT_SESSION_MESSAGE_SEARCH_ROLES)[number];

export function coerceSearchRole<TRole extends MessageRole>(
  role: string,
  allowedRoles: readonly TRole[],
): TRole | undefined {
  return allowedRoles.includes(role as TRole) ? (role as TRole) : undefined;
}

export const MessageStatusSchema = z.enum(['pending', 'success', 'error', 'paused']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  data: MessageDataSchema,
  id: MessageIdSchema,
  modelId: z.string().nullable().optional(),
  messageSnapshot: MessageSnapshotSchema.nullable().optional(),
  parentId: z.string().nullable(),
  role: MessageRoleSchema,
  searchableText: z.string(),
  siblingsGroupId: z.number(),
  stats: MessageStatsSchema.nullable().optional(),
  status: MessageStatusSchema,
  topicId: z.string(),
  updatedAt: z.iso.datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export interface TreeNode {
  createdAt: string;
  hasChildren: boolean;
  id: string;
  modelId?: string | null;
  parentId?: string | null;
  preview: string;
  role: MessageRole;
  status: MessageStatus;
}

export interface SiblingsGroup {
  nodes: Omit<TreeNode, 'parentId'>[];
  parentId: string;
  siblingsGroupId: number;
}

export interface TreeResponse {
  activeNodeId: string | null;
  nodes: TreeNode[];
  rootId: null | string;
  siblingsGroups: SiblingsGroup[];
}

export interface BranchMessage {
  message: Message;
  siblingsGroup?: Message[];
}

export interface BranchMessagesResponse extends CursorPaginationResponse<BranchMessage> {
  activeNodeId: string | null;
  assistantId: string | null;
}
