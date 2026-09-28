import { z } from 'zod';

import type { RuntimeJsonValue, RuntimeTurnReplay } from './types';

// A replay is an optimization. Reject the whole turn rather than truncate signed blocks or tools.
export const MAX_RUNTIME_TURN_REPLAY_BYTES = 4 * 1024 * 1024;

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

export type SerializedRuntimeTurnReplay = {
  replay: RuntimeTurnReplay;
  serialized: string;
  bytes: number;
};

/** The storage form of an artifact. Unserializable or oversized values are rejected whole. */
export function serializeRuntimeTurnReplay(
  value: unknown,
): SerializedRuntimeTurnReplay | undefined {
  const replay = parseRuntimeTurnReplay(value);
  if (!replay) return undefined;
  let serialized: string;
  try {
    serialized = JSON.stringify(replay);
  } catch {
    return undefined;
  }
  const bytes = utf8ByteLength(serialized);
  return bytes > MAX_RUNTIME_TURN_REPLAY_BYTES ? undefined : { replay, serialized, bytes };
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
