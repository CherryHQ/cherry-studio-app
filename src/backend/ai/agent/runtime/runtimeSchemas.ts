import { z } from 'zod';

import type { RuntimeContextCheckpoint, RuntimeJsonValue, RuntimeOptions } from './types';

/** Application choices restored for durable provider requests; credentials are deliberately absent. */
export const RuntimeOptionsSchema: z.ZodType<RuntimeOptions> = z.strictObject({
  reasoningEffort: z
    .enum(['default', 'none', 'auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    .optional(),
  maxOutputTokens: z.number().finite().optional(),
  temperature: z.number().finite().optional(),
});

export const RuntimeJsonValueSchema: z.ZodType<RuntimeJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(RuntimeJsonValueSchema),
    z.record(z.string(), RuntimeJsonValueSchema),
  ]),
);

export const RuntimeContextCheckpointSchema: z.ZodType<RuntimeContextCheckpoint> = z
  .object({
    version: z.literal(1),
    anchorTurnId: z.string().min(1),
    payload: RuntimeJsonValueSchema,
  })
  .strict();
