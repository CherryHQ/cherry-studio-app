import { z } from 'zod';

import type { RuntimeContextCheckpoint, RuntimeJsonValue } from './types';

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
