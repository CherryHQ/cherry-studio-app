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
  /** Absent when the installed native module predates the interactive bridge. */
  startBridge?(input: JsSandboxBridgeInput): Promise<JsSandboxBridge>;
};

export type JsSandboxBridgeInput = {
  setup: string;
  data: string;
  clock: { startedAt: number; seed: number };
  /** The bridge's caller owns its deadline and output limits; the engine only caps memory. */
  memoryBytes: number;
  /** Aborting cancels the run; `result` settles after native cleanup. */
  signal: AbortSignal;
  onMessage(message: string): void;
};

export type JsSandboxBridge = {
  post(message: string): void;
  /** Empty on normal termination, otherwise a native error description. */
  result: Promise<string>;
};

/** Per pool, shared across service instances and turns; each run can allocate 64 MiB. */
export const JS_SANDBOX_MAX_CONCURRENT_RUNS = 2;

function createRunSlots() {
  const pending: (() => void)[] = [];
  let running = 0;
  return {
    acquire(signal: AbortSignal): Promise<void> {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const start = () => {
          signal.removeEventListener('abort', abort);
          running++;
          resolve();
        };
        const abort = () => {
          const index = pending.indexOf(start);
          if (index >= 0) pending.splice(index, 1);
          reject(signal.reason);
        };
        if (running < JS_SANDBOX_MAX_CONCURRENT_RUNS) start();
        else {
          pending.push(start);
          signal.addEventListener('abort', abort, { once: true });
        }
      });
    },
    release(): void {
      running--;
      pending.shift()?.();
    },
  };
}

const computeSlots = createRunSlots();
// A bridge run holds its slot while its script waits on tools and approvals, and those tools may
// themselves need a bounded computation. Separate pools keep one from starving the other.
const bridgeSlots = createRunSlots();

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
            await bridgeSlots.acquire(input.signal);
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
              const result = native.runBridge!(runId, input.setup, input.data, input.clock, {
                timeoutMs: 0,
                memoryBytes: input.memoryBytes,
                maxResultBytes: 0,
                maxLogBytes: 0,
              }).finally(() => {
                finished = true;
                subscription?.remove();
                input.signal.removeEventListener('abort', abort);
                bridgeSlots.release();
              });
              started = true;
              return {
                post: (message) => {
                  if (!finished) native.deliver!(runId, message);
                },
                result,
              };
            } finally {
              if (!started) {
                subscription?.remove();
                input.signal.removeEventListener('abort', abort);
                bridgeSlots.release();
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
        await computeSlots.acquire(signal);
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
          computeSlots.release();
          onSettled?.();
        });
        hasStarted = true;
        return parseOutcome(await Promise.race([running, aborted]));
      } finally {
        if (!hasStarted) {
          if (hasSlot) computeSlots.release();
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
