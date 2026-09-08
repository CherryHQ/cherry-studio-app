import * as z from 'zod';

export const TraceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, 'traceId must be 32 lowercase hex chars');
export type TraceId = z.infer<typeof TraceIdSchema>;

export const TraceSpanStatusSchema = z.enum(['running', 'ok', 'error', 'cancelled', 'interrupted']);
export type TraceSpanStatus = z.infer<typeof TraceSpanStatusSchema>;

const TraceAttributesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

/** Identifiers only; names, prompts, credentials, and file paths are not diagnostic metadata. */
export const TraceContextSchema = z.strictObject({
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  turnId: z.string().optional(),
  messageId: z.string().optional(),
  requestId: z.string().optional(),
});
export type TraceContext = z.infer<typeof TraceContextSchema>;

/** JSONL snapshots use the highest revision for each (processId, traceId, spanId). */
export const TraceSpanRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  capture: z.literal('metadata'),
  processId: z.string(),
  traceId: TraceIdSchema,
  spanId: z.string().regex(/^[0-9a-f]{16}$/),
  parentSpanId: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .nullable(),
  name: z.string(),
  context: TraceContextSchema,
  attributes: TraceAttributesSchema,
  status: TraceSpanStatusSchema,
  startedAt: z.number().finite(),
  endedAt: z.number().finite().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
});
export type TraceSpanRecord = z.infer<typeof TraceSpanRecordSchema>;
