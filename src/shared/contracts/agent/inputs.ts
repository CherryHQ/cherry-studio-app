/**
 * Agent Protocol operation inputs, validated by the Host at the boundary.
 */

import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';
import * as z from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';
import { SkillActionSchema, SkillIdSchema } from '@/shared/data/types/skill';

import { AgentImageGenerationSchema, AgentInputPartSchema } from './views';

/** Operation inputs, validated by the Host at the protocol boundary. */
export const AgentRenameSessionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  name: z.string().min(1),
});
export const AgentDeleteSessionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
});
/**
 * Further models answering the same question in parallel. Each answer is an
 * ordinary assistant message in the same multi-model sibling group.
 */
export const AgentAdditionalReplySchema = z.strictObject({
  modelId: UniqueModelIdSchema,
  assistantMessageId: z.string().min(1),
});
/** Models answering one question in parallel, the composer's own model included. */
export const MAX_PARALLEL_ANSWERS = 8;
export const AgentAdditionalRepliesSchema = z
  .array(AgentAdditionalReplySchema)
  .min(1)
  .max(MAX_PARALLEL_ANSWERS - 1);
export type AgentAdditionalReply = z.infer<typeof AgentAdditionalReplySchema>;

export const AgentSubmitMessageInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  /** Allocated once by the send action and reused for display and persistence. */
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  parts: z.array(AgentInputPartSchema).min(1),
  /** Snapshots the composer's selected model while its Agent mutation settles. */
  modelId: UniqueModelIdSchema.optional(),
  additionalReplies: AgentAdditionalRepliesSchema.optional(),
  /** Per-turn only; this value is never persisted back to the Agent. */
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  imageGeneration: AgentImageGenerationSchema.optional(),
  /**
   * Skills the user selected explicitly in the composer. Each must be bound,
   * enabled, and user-invocable for this Agent; the Host loads their
   * instructions for this turn only and never persists the selection.
   */
  skillIds: z.array(SkillIdSchema).max(8).optional(),
  /** App-owned composer action; no installation occurs until the user sends the request. */
  skillAction: SkillActionSchema.optional(),
});
export type AgentSubmitMessageInput = z.infer<typeof AgentSubmitMessageInputSchema>;
export const AgentStartSessionInputSchema = z.strictObject({
  agentId: z.string().min(1),
  /** Optional workspace chosen before sending the first message. */
  workspaceFolderId: z.uuid().optional(),
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  parts: z.array(AgentInputPartSchema).min(1),
  /** Snapshots the draft composer's selected model while its Agent mutation settles. */
  modelId: UniqueModelIdSchema.optional(),
  additionalReplies: AgentAdditionalRepliesSchema.optional(),
  /** Per-turn only; this value is never persisted back to the Agent. */
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  imageGeneration: AgentImageGenerationSchema.optional(),
  /**
   * Skills the user selected explicitly in the composer. Each must be bound,
   * enabled, and user-invocable for this Agent; the Host loads their
   * instructions for this turn only and never persists the selection.
   */
  skillIds: z.array(SkillIdSchema).max(8).optional(),
  /** App-owned composer action; no installation occurs until the user sends the request. */
  skillAction: SkillActionSchema.optional(),
});
export type AgentStartSessionInput = z.infer<typeof AgentStartSessionInputSchema>;
export const AgentForkSessionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  /** Inclusive fork point; its turn must already be terminal. */
  fromMessageId: z.string().min(1),
  /**
   * Title for the new Session, defaulting to the source's. The client supplies
   * it because any derived wording is localized copy, and the Host has no
   * locale: it never composes user-visible text.
   */
  name: z.string().min(1).max(255).optional(),
});
export type AgentForkSessionInput = z.infer<typeof AgentForkSessionInputSchema>;
/**
 * Deletion is turn-scoped. A transcript replays `tool-call` and `tool-result`
 * as a pair, so removing one message of a turn would leave history no provider
 * accepts; the UI therefore resolves the pressed message to its turn.
 */
export const AgentDeleteTurnInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
});
export type AgentDeleteTurnInput = z.infer<typeof AgentDeleteTurnInputSchema>;
/** Moves the Session's selected leaf into the branch that contains `messageId`. */
export const AgentSelectMessageInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
});
export type AgentSelectMessageInput = z.infer<typeof AgentSelectMessageInputSchema>;
export const AgentRetryMessageInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
  /** Answers with this model instead of the original one, always as a sibling answer. */
  modelId: UniqueModelIdSchema.optional(),
});
export type AgentRetryMessageInput = z.infer<typeof AgentRetryMessageInputSchema>;
export const AgentCancelTurnInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  /** Stops one answer of a multi-model question; omitted, every answer of the turn stops. */
  messageId: z.string().min(1).optional(),
});
export const AgentCancelSubmissionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
});
export const AgentRespondApprovalInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
});
