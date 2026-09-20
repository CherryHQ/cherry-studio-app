/**
 * Agent Protocol operation inputs, validated by the Host at the boundary.
 */

import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';
import * as z from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';

import {
  AgentExecutionTargetSchema,
  AgentImageGenerationSchema,
  AgentInputPartSchema,
} from './views';

/** Operation inputs, validated by the Host at the protocol boundary. */
export const AgentRenameSessionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  title: z.string().min(1),
});
export const AgentDeleteSessionInputSchema = z.strictObject({
  sessionId: z.string().min(1),
});
export const AgentSubmitMessageInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  /** Allocated once by the send action and reused for display and persistence. */
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  parts: z.array(AgentInputPartSchema).min(1),
  /** Snapshots the composer's selected model while its Agent mutation settles. */
  modelId: UniqueModelIdSchema.optional(),
  /** Per-turn only; this value is never persisted back to the Agent. */
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  imageGeneration: AgentImageGenerationSchema.optional(),
});
export type AgentSubmitMessageInput = z.infer<typeof AgentSubmitMessageInputSchema>;
export const AgentStartSessionInputSchema = z.strictObject({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  executionTarget: AgentExecutionTargetSchema,
  parts: z.array(AgentInputPartSchema).min(1),
  /** Snapshots the draft composer's selected model while its Agent mutation settles. */
  modelId: UniqueModelIdSchema.optional(),
  /** Per-turn only; this value is never persisted back to the Agent. */
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  imageGeneration: AgentImageGenerationSchema.optional(),
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
  title: z.string().min(1).max(255).optional(),
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
export const AgentRetryMessageInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
});
export type AgentRetryMessageInput = z.infer<typeof AgentRetryMessageInputSchema>;
export const AgentCancelTurnInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
});
export const AgentRespondApprovalInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
});
