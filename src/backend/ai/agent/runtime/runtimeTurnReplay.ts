import { z } from 'zod';

import type { RuntimeJsonValue, RuntimeTurnReplay } from './types';

// Payloads are JSON by construction: producers round-trip through JSON and the Host parses stored
// text. Only the envelope is checked; a recursive schema would repeat that work on every turn.
const RuntimeTurnReplaySchema = z.strictObject({
  version: z.literal(1),
  payload: z.custom<RuntimeJsonValue>((value) => value !== undefined),
});

export function parseRuntimeTurnReplay(value: unknown): RuntimeTurnReplay | undefined {
  const parsed = RuntimeTurnReplaySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
