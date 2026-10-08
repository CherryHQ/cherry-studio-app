/**
 * Runs model-written JavaScript in the native sandbox (`modules/js-sandbox`).
 *
 * Every run gets a fresh QuickJS runtime on its own native thread, so a script
 * can neither block the JS thread nor reach the app: its global object holds
 * only standard built-ins, a captured `console`, and `store`/`load` over the
 * values the caller passes in.
 */

import * as Crypto from 'expo-crypto';
import * as z from 'zod';

import { type JsonValue, JsonValueSchema } from '@/shared/contracts/agent';

import {
  getJsSandbox,
  type JsSandboxLimits,
  type JsSandboxNativeModule,
} from '../../../../modules/js-sandbox';

export type { JsSandboxLimits };

/** Values `load()` sees; the caller owns where they persist. */
export type JsSandboxStore = Readonly<Record<string, JsonValue>>;

/** What a fulfilled script `store()`d: values to set and keys to delete. */
export type JsSandboxStoreWrites = { set: Record<string, JsonValue>; delete: string[] };

/** `[[key, json] | [key]]`, the prelude's report of a fulfilled script's writes. */
const storeWritesSchema = z.array(
  z.union([z.tuple([z.string()]), z.tuple([z.string(), z.string()])]),
);

const outputFields = {
  durationMs: z.number(),
  logs: z.string(),
  logsTruncated: z.boolean(),
};

const outcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** JSON text of the returned value; absent when the code returned nothing. */
    result: z.string().optional(),
    resultTruncated: z.boolean().optional(),
    storeWrites: z.string().optional(),
    ...outputFields,
  }),
  z.object({
    status: z.literal('error'),
    kind: z.enum([
      'cancelled',
      'exception',
      'internal',
      'memory',
      'syntax',
      'timeout',
      'unsettled',
    ]),
    message: z.string(),
    ...outputFields,
  }),
]);

type NativeOutcome = z.infer<typeof outcomeSchema>;

export type JsSandboxOutcome =
  | (Omit<Extract<NativeOutcome, { status: 'ok' }>, 'storeWrites'> & {
      storeWrites: JsSandboxStoreWrites;
    })
  | Extract<NativeOutcome, { status: 'error' }>;

export type JsSandboxRun = {
  code: string;
  limits: JsSandboxLimits;
  store: JsSandboxStore;
  signal: AbortSignal;
};

export type JsSandbox = {
  /** Script failures resolve as outcomes; only cancellation rejects. */
  run(input: JsSandboxRun): Promise<JsSandboxOutcome>;
};

/** Null when this client was built without the native module. */
export function createJsSandbox(
  native: JsSandboxNativeModule | null = getJsSandbox(),
  createRunId: () => string = Crypto.randomUUID,
): JsSandbox | null {
  if (!native) {
    return null;
  }
  return {
    async run({ code, limits, store, signal }) {
      signal.throwIfAborted();
      const runId = createRunId();
      const storeJson = JSON.stringify(
        Object.fromEntries(
          Object.entries(store).map(([key, value]) => [key, JSON.stringify(value)]),
        ),
      );
      let onAbort: (() => void) | undefined;
      // Settle on abort without waiting; the native side holds a cancel that
      // lands before its thread registers the run.
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => {
          native.cancel(runId);
          reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        return parseOutcome(
          await Promise.race([native.run(runId, code, storeJson, limits), aborted]),
        );
      } finally {
        if (onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    },
  };
}

function parseOutcome(text: string): JsSandboxOutcome {
  try {
    const parsed = outcomeSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      if (parsed.data.status === 'error') {
        return parsed.data;
      }
      const { storeWrites, ...outcome } = parsed.data;
      return { ...outcome, storeWrites: parseStoreWrites(storeWrites) };
    }
  } catch {
    // Reported below.
  }
  return {
    status: 'error',
    kind: 'internal',
    message: 'The sandbox returned an unreadable outcome.',
    durationMs: 0,
    logs: '',
    logsTruncated: false,
  };
}

/**
 * A script that patches the built-ins the prelude serializes with can garble
 * its report; its writes are then dropped rather than half-applied.
 */
function parseStoreWrites(text: string | undefined): JsSandboxStoreWrites {
  const writes: JsSandboxStoreWrites = { set: {}, delete: [] };
  if (text === undefined) {
    return writes;
  }
  try {
    const entries = storeWritesSchema.parse(JSON.parse(text));
    for (const entry of entries) {
      if (entry.length === 1) {
        writes.delete.push(entry[0]);
      } else {
        writes.set[entry[0]] = JsonValueSchema.parse(JSON.parse(entry[1]));
      }
    }
    return writes;
  } catch {
    return { set: {}, delete: [] };
  }
}
