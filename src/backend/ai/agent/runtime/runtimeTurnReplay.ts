import { z } from 'zod';

import { RuntimeJsonValueSchema } from './runtimeSchemas';
import type { RuntimeTurnReplay } from './types';

// A replay is an optimization. Reject the whole turn rather than truncate signed blocks or tools.
export const MAX_RUNTIME_TURN_REPLAY_BYTES = 4 * 1024 * 1024;

const RuntimeTurnReplaySchema = z.strictObject({
  version: z.literal(1),
  payload: RuntimeJsonValueSchema,
});

export function parseRuntimeTurnReplay(value: unknown): RuntimeTurnReplay | undefined {
  if (value == null) return undefined;
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_RUNTIME_TURN_REPLAY_BYTES
    ) {
      return undefined;
    }
    const parsed = RuntimeTurnReplaySchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
