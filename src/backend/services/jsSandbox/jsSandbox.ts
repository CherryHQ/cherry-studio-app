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
  /** Fires after native cleanup, including when the caller already received cancellation. */
  onSettled?: () => void;
};

export type JsSandbox = {
  /** Script failures resolve as outcomes; only cancellation rejects. */
  run(input: JsSandboxRun): Promise<JsSandboxOutcome>;
  /** Absent on development clients built before the interactive native bridge. */
  startBridge?(input: JsSandboxBridgeInput): Promise<JsSandboxBridge>;
};

export type JsSandboxBridgeInput = {
  setup: string;
  data: string;
  clock: { startedAt: number; seed: number };
  limits: JsSandboxLimits;
  signal: AbortSignal;
  onMessage(message: string): void;
};

export type JsSandboxBridge = {
  post(message: string): void;
  /** Empty on normal termination, otherwise a native error description. */
  result: Promise<string>;
  stop(): Promise<void>;
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
    ...(native.runBridge && native.deliver && native.addListener
      ? {
          async startBridge(input: JsSandboxBridgeInput): Promise<JsSandboxBridge> {
            await acquireRunSlot(input.signal);
            let started = false;
            let subscription: { remove(): void } | undefined;
            const runId = createRunId();
            const abort = () => native.cancel(runId);
            try {
              input.signal.throwIfAborted();
              subscription = native.addListener!('onMessage', (event) => {
                if (event.runId === runId) input.onMessage(event.message);
              });
              input.signal.addEventListener('abort', abort, { once: true });
              let finished = false;
              const result = native.runBridge!(
                runId,
                input.setup,
                input.data,
                input.clock,
                input.limits,
              ).finally(() => {
                finished = true;
                subscription?.remove();
                input.signal.removeEventListener('abort', abort);
                releaseRunSlot();
              });
              started = true;
              return {
                post: (message) => {
                  if (!finished) native.deliver!(runId, message);
                },
                result,
                stop: async () => {
                  if (!finished) abort();
                  await result;
                },
              };
            } finally {
              if (!started) {
                subscription?.remove();
                input.signal.removeEventListener('abort', abort);
                releaseRunSlot();
              }
            }
          },
        }
      : {}),
    async run({ code, limits, signal, onSettled }) {
      let onAbort: (() => void) | undefined;
      let hasStarted = false;
      let hasSlot = false;
      try {
        await acquireRunSlot(signal);
        hasSlot = true;
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
        const running = native.run(runId, code, limits).finally(() => {
          releaseRunSlot();
          onSettled?.();
        });
        hasStarted = true;
        return parseOutcome(await Promise.race([running, aborted]));
      } finally {
        if (!hasStarted) {
          if (hasSlot) releaseRunSlot();
          onSettled?.();
        }
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
