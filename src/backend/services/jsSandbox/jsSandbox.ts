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

/** Shared across service instances and turns; each run can allocate 64 MiB. */
export const JS_SANDBOX_MAX_CONCURRENT_RUNS = 2;
const pendingRuns: (() => void)[] = [];
let runningCount = 0;

function acquireRunSlot(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const start = () => {
      signal.removeEventListener('abort', abort);
      runningCount++;
      resolve();
    };
    const abort = () => {
      const index = pendingRuns.indexOf(start);
      if (index >= 0) pendingRuns.splice(index, 1);
      reject(signal.reason);
    };
    if (runningCount < JS_SANDBOX_MAX_CONCURRENT_RUNS) start();
    else {
      pendingRuns.push(start);
      signal.addEventListener('abort', abort, { once: true });
    }
  });
}

function releaseRunSlot(): void {
  runningCount--;
  pendingRuns.shift()?.();
}

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
      await acquireRunSlot(signal);
      let onAbort: (() => void) | undefined;
      let hasStarted = false;
      try {
        signal.throwIfAborted();
        const runId = createRunId();
        // Settle on abort without waiting; the native side holds a cancel that
        // lands before its thread registers the run.
        const aborted = new Promise<never>((_, reject) => {
          onAbort = () => {
            native.cancel(runId);
            reject(signal.reason);
          };
          signal.addEventListener('abort', onAbort, { once: true });
        });
        // Cancellation releases the caller immediately, but the slot remains
        // occupied until native cleanup finishes, so cancelled threads count too.
        const running = native.run(runId, code, limits).finally(releaseRunSlot);
        hasStarted = true;
        return parseOutcome(await Promise.race([running, aborted]));
      } finally {
        if (!hasStarted) releaseRunSlot();
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
