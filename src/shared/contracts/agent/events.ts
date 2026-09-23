/**
 * Agent Protocol observation: the live Session snapshot and the event deltas
 * a subscriber composes over it.
 */

import * as z from 'zod';

import { AgentPendingQuestionSchema } from './userQuestion';
import {
  AgentApprovalViewSchema,
  AgentCapabilitiesSchema,
  AgentMessagePartSchema,
  AgentMessageViewSchema,
  AgentSessionViewSchema,
  AgentToolInputPreviewSchema,
  AgentTurnViewSchema,
  AgentViewSchema,
} from './views';

export const AgentMessageDeltaSchema = z.union([
  z.strictObject({
    op: z.literal('part.add'),
    index: z.number().int().nonnegative(),
    part: AgentMessagePartSchema,
  }),
  z.strictObject({
    op: z.literal('text.append'),
    partId: z.string().min(1),
    text: z.string(),
  }),
  z.strictObject({
    op: z.literal('tool.input.preview'),
    partId: z.string().min(1),
    preview: AgentToolInputPreviewSchema,
  }),
  z.strictObject({
    op: z.literal('part.replace'),
    part: AgentMessagePartSchema,
  }),
]);
export type AgentMessageDelta = z.infer<typeof AgentMessageDeltaSchema>;

export const AgentEventSchema = z.union([
  z.strictObject({
    type: z.literal('question.updated'),
    question: AgentPendingQuestionSchema.nullable(),
  }),
  z.strictObject({ type: z.literal('session.updated'), session: AgentSessionViewSchema }),
  z.strictObject({ type: z.literal('turn.updated'), turn: AgentTurnViewSchema }),
  z.strictObject({ type: z.literal('message.created'), message: AgentMessageViewSchema }),
  z.strictObject({
    type: z.literal('message.delta'),
    messageId: z.string().min(1),
    delta: AgentMessageDeltaSchema,
  }),
  z.strictObject({ type: z.literal('message.finalized'), message: AgentMessageViewSchema }),
  /** One settled turn left the transcript; its rows are gone, not superseded. */
  z.strictObject({
    type: z.literal('turn.deleted'),
    turnId: z.string().min(1),
    messageIds: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({ type: z.literal('approval.requested'), approval: AgentApprovalViewSchema }),
  z.strictObject({ type: z.literal('approval.resolved'), approval: AgentApprovalViewSchema }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/**
 * Live state composed over persisted messages. Only the active turn's rows are
 * repeated for route handoff; older transcript pagination remains a data read.
 */
export const AgentSessionSnapshotSchema = z.strictObject({
  agent: AgentViewSchema,
  session: AgentSessionViewSchema,
  capabilities: AgentCapabilitiesSchema,
  activeTurn: AgentTurnViewSchema.nullable(),
  activeUserMessage: AgentMessageViewSchema.nullable(),
  hasHistoryBeforeActiveTurn: z.boolean().nullable(),
  streamingMessage: AgentMessageViewSchema.nullable(),
  pendingApprovals: z.array(AgentApprovalViewSchema),
  pendingQuestion: AgentPendingQuestionSchema.nullable(),
});
export type AgentSessionSnapshot = z.infer<typeof AgentSessionSnapshotSchema>;

export type AgentSessionObservation = {
  snapshot: AgentSessionSnapshot;
  unsubscribe(): void;
};
