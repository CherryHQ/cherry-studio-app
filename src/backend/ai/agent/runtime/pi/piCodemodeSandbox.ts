import { fnv1a32 } from '@cherrystudio/universal/utils/fnv1a';
import { CodemodeSandboxBase, PRELUDE_SOURCE } from '@earendil-works/pi-codemode/native';

import type { RuntimeScriptSandbox } from '../durableTypes';

/**
 * Native equivalent of pi-codemode's VM driver. The upstream prelude owns every
 * script API; this closure only translates its bridge messages and acknowledges
 * drained promise jobs. None of its callbacks are installed on the global object.
 */
export const PI_CODEMODE_VM_SOURCE = `(function (emit, clock, input, engine) {
  "use strict";
  const data = JSON.parse(input);
  const stringify = JSON.stringify;
  const evaluate = eval;
  let finished = false;
  let issued = 0;
  let current = 0;
  let nextSeq = 1;
  let now = data.deterministic.startedAt;
  let needsAck = true;
  const early = new Map();
  delete globalThis.WeakRef;
  delete globalThis.FinalizationRegistry;
  function post(message) { emit(stringify(message)); }
  // QuickJS stacks hold frames only; upstream reports a script error by its stack, so lead with the head.
  function describe(error) {
    if (!error || typeof error !== "object") return stringify({ message: String(error) });
    const head = error.message ? error.name + ": " + error.message : String(error.name);
    const stack = typeof error.stack === "string" ? error.stack.trimEnd() : "";
    return stringify({ name: error.name, message: error.message,
      stack: !stack || stack.startsWith(head) ? stack || head : head + "\\n" + stack });
  }
  function bridge(kind, a, b, c) {
    if (finished) return;
    if (kind === "call" || kind === "global") {
      issued++;
      post({ type: "call", id: a, target: kind === "call" ? "tool" : "global", name: b, args: c });
    } else if (kind === "output") {
      post({ type: "output", item: a === "image"
        ? { type: "image", data: b, mimeType: c }
        : { type: "text", text: b, ...(a === "console" ? { console: true } : {}) } });
    } else if (kind === "done") {
      finished = true;
      const during = { seq: current, issued };
      post(a ? { type: "done", ok: true, value: b, writes: c, during }
        : { type: "done", ok: false, error: b, during });
    }
  }
  const api = (${PRELUDE_SOURCE})(bridge, stringify(data.tools), stringify(data.globals), stringify(data.store));
  function apply(message) {
    if (typeof message.now === "number" && Number.isFinite(message.now)) now = Math.max(now, message.now);
    clock(now);
    current = nextSeq++;
    needsAck = true;
    api.settle(message.id, message.ok, message.payload, message.properties);
  }
  post({ type: "started", fingerprint: engine + ", driver " + data.fingerprint });
  try {
    api.run(evaluate("(async (tools, console) => {" + data.code + "\\n})"));
  } catch (error) {
    finished = true;
    post({ type: "done", ok: false, error: describe(error), during: { seq: current, issued } });
  }
  return {
    deliver(json) {
      if (finished) return;
      const message = JSON.parse(json);
      const seq = message.seq;
      if (message.type !== "result" || !Number.isInteger(seq) || seq < nextSeq || early.has(seq))
        throw new Error("Invalid Code Mode result sequence");
      if (seq === nextSeq) apply(message);
      else early.set(seq, message);
    },
    drained() {
      if (finished) return "done";
      api.stalled();
      if (finished) return "done";
      if (needsAck) {
        post({ type: "idle", seq: current, issued });
        needsAck = false;
      }
      const next = early.get(nextSeq);
      if (next !== undefined) {
        early.delete(nextSeq);
        apply(next);
        return "again";
      }
      return "idle";
    }
  };
})`;

const FINGERPRINT = fnv1a32(PI_CODEMODE_VM_SOURCE).toString(16);
const MEMORY_BYTES = 64 * 1024 * 1024;

export function createPiCodemodeSandbox(
  sandbox: RuntimeScriptSandbox | undefined,
): CodemodeSandboxBase | undefined {
  const startBridge = sandbox?.startBridge;
  if (!startBridge) return undefined;
  return new CodemodeSandboxBase({ memoryLimitBytes: MEMORY_BYTES }, (data, events) => {
    if (!data.deterministic)
      throw new Error('The native Code Mode bridge requires a replayable run.');
    const controller = new AbortController();
    let channel: Awaited<ReturnType<RuntimeScriptSandbox['startBridge']>> | undefined;
    const fail = (error: unknown) => {
      if (!controller.signal.aborted)
        events.failure({
          kind: String(error).includes('stopped: budget') ? 'timeout' : 'sandbox',
          message: error instanceof Error ? error.message : String(error),
        });
    };
    const starting = startBridge({
      setup: PI_CODEMODE_VM_SOURCE,
      data: JSON.stringify({ ...data, fingerprint: `${FINGERPRINT} ${sandbox!.fingerprint}` }),
      clock: data.deterministic,
      memoryBytes: MEMORY_BYTES,
      signal: controller.signal,
      onMessage(message) {
        try {
          events.message(JSON.parse(message));
        } catch (error) {
          fail(error);
        }
      },
    })
      .then((opened) => {
        channel = opened;
        void opened.result.then((error) => {
          if (error) fail(error);
        }, fail);
      })
      .catch(fail);
    return {
      post(message) {
        // A reply answers a VM call, and the VM cannot call before its channel opened.
        if (!channel) throw new Error('The Code Mode bridge received a reply before it started.');
        channel.post(JSON.stringify(message));
      },
      async stop() {
        // Aborting cancels the native run; its result settles only after native cleanup.
        controller.abort();
        await starting;
        await channel?.result.catch(() => undefined);
      },
    };
  });
}
