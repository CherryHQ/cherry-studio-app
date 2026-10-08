/**
 * Runs model-written JavaScript in the native sandbox (`modules/js-sandbox`).
 *
 * Every run gets a fresh QuickJS runtime on its own native thread, so a script
 * can neither block the JS thread nor reach the app: its global object holds
 * only standard built-ins and a captured `console`.
 */

import * as Crypto from 'expo-crypto';
import * as z from 'zod';

import {
  getJsSandbox,
  type JsSandboxLimits,
  type JsSandboxNativeModule,
} from '../../../../modules/js-sandbox';

export type { JsSandboxLimits };

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

export type JsSandboxOutcome = z.infer<typeof outcomeSchema>;

export type JsSandboxRun = {
  code: string;
  limits: JsSandboxLimits;
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
    async run({ code, limits, signal }) {
      signal.throwIfAborted();
      const runId = createRunId();
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
        return parseOutcome(await Promise.race([native.run(runId, code, limits), aborted]));
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
      return parsed.data;
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
