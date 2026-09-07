import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';
import * as z from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';

import { AgentInputPartSchema } from './views';

export const AgentInputModeSchema = z.enum(['follow-up', 'steer']);
export const AgentInputQueueReasonSchema = z.enum([
  'busy',
  'target-ended',
  'configuration-changed',
  'unsupported-content',
  'runtime-unavailable',
  'undelivered',
  'interrupted',
  'invalid-input',
]);
export type AgentInputQueueReason = z.infer<typeof AgentInputQueueReasonSchema>;

/** Durable input identity survives dispatch, retries, cancellation, and route handoff. */
export const AgentSessionInputSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  parts: z.array(AgentInputPartSchema).min(1),
  mode: AgentInputModeSchema,
  modelId: UniqueModelIdSchema.optional(),
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  targetTurnId: z.string().min(1).optional(),
  position: z.number().int().nonnegative(),
  status: z.enum(['queued', 'dispatching', 'steering', 'consumed', 'interrupted', 'removed']),
  reason: AgentInputQueueReasonSchema.nullable(),
  turnId: z.string().min(1).nullable(),
  userMessageId: z.string().min(1).nullable(),
  assistantMessageId: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgentSessionInput = z.infer<typeof AgentSessionInputSchema>;

export const AgentInputQueueSchema = z.strictObject({
  isPaused: z.boolean(),
  inputs: z.array(AgentSessionInputSchema),
});
export type AgentInputQueue = z.infer<typeof AgentInputQueueSchema>;

export const AgentSubmitMessageResultSchema = z
  .strictObject({
    inputId: z.string().min(1),
    /** Redirected acknowledges delivery to the Runtime, not model consumption. */
    disposition: z.enum(['started', 'queued', 'redirected']),
    turnId: z.string().min(1).optional(),
    userMessageId: z.string().min(1).optional(),
    assistantMessageId: z.string().min(1).optional(),
    reason: AgentInputQueueReasonSchema.optional(),
  })
  .refine(
    (result) =>
      result.disposition !== 'started' ||
      Boolean(result.turnId && result.userMessageId && result.assistantMessageId),
    { message: 'Started submissions require turn and message identities.' },
  )
  .refine((result) => result.disposition !== 'redirected' || Boolean(result.turnId), {
    message: 'Redirected submissions require their target turn identity.',
  });
export type AgentSubmitMessageResult = z.infer<typeof AgentSubmitMessageResultSchema>;
