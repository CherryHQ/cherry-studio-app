import * as z from 'zod';

export const TraceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, 'traceId must be 32 lowercase hex chars');
export type TraceId = z.infer<typeof TraceIdSchema>;
