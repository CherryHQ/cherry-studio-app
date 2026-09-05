import { CURRENCY, objectValues } from '@cherrystudio/provider-registry';
import * as z from 'zod';

/** Desktop-aligned materialized statistics for one assistant message. */
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
  // Token and provider fields retain the desktop shape. Mobile currently
  // writes runtimeTiming here and keeps its existing usage ledger unchanged.
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  contextTokens: z.number().optional(),
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
  timeFirstTokenMs: z.number().optional(),
  timeCompletionMs: z.number().optional(),
  timeThinkingMs: z.number().optional(),
});
export type MessageStats = z.infer<typeof MessageStatsSchema>;
export type MessageRuntimeStatsInput = Readonly<
  Pick<MessageStats, 'runtimeTiming' | 'contextTokens'>
>;
