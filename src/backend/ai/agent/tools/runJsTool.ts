/**
 * `run_js`: the model runs JavaScript for exact computation.
 *
 * Isolated by construction (docs/references/agent/agent-tools-and-resources.md):
 * each call gets a fresh native QuickJS runtime whose global object holds only
 * standard built-ins, so the code reaches nothing of the app, the network, or
 * the device. It has no side effects, which is why it needs no approval.
 */

import * as z from 'zod';

import type { JsSandbox, JsSandboxLimits, JsSandboxOutcome } from '@/backend/services/jsSandbox';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const RUN_JS_TOOL_NAME = 'run_js';

/** Far above what a computation needs; a larger body is a malfunction. */
export const RUN_JS_MAX_CODE_LENGTH = 100_000;

export const RUN_JS_LIMITS: JsSandboxLimits = {
  timeoutMs: 10_000,
  memoryBytes: 64 * 1024 * 1024,
  maxResultBytes: 32 * 1024,
  maxLogBytes: 8 * 1024,
};

export const runJsInputSchema = z.strictObject({
  code: z
    .string()
    .min(1)
    .max(RUN_JS_MAX_CODE_LENGTH)
    .describe(
      'The body of an async function. `return` the result; top-level `await` works. Include every input value in the code.',
    ),
});

export function createRunJsTool(sandbox: JsSandbox): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: RUN_JS_TOOL_NAME },
    providerName: RUN_JS_TOOL_NAME,
    displayName: 'Run JavaScript',
    description:
      'Run JavaScript in an isolated sandbox for exact computation: arithmetic, statistics, date and time math, counting, sorting, parsing, and transforming data. `return` a JSON-serializable value (Map and Set become object and array, BigInt becomes a string); `console.log` output is returned as `logs`. Standard ECMAScript plus atob/btoa. There is no Intl, so locale arguments to toLocaleString and similar methods are ignored; format numbers and dates yourself. There is no network, file, timer, module, device, or app access, and nothing persists between calls. Each call is limited to 10 seconds and 64 MB of memory.',
    inputSchema: toRuntimeInputSchema(runJsInputSchema),
    // The catalog overrides this from the resolved binding policy; the value
    // here is only the floor this tool declares for itself.
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = runJsInputSchema.safeParse(input);
      if (!parsed.success) {
        return toolValue({
          status: 'error',
          message: `Invalid input: ${z.prettifyError(parsed.error)}`,
        });
      }
      return toolValue(toModelValue(await sandbox.run(parsed.data.code, RUN_JS_LIMITS, signal)));
    },
  };
}

/**
 * The model's view of an outcome: failures stay values it can correct,
 * because a thrown error reaches it only as an opaque failure.
 */
export function toModelValue(outcome: JsSandboxOutcome): { [key: string]: RuntimeJsonValue } {
  const logs = outcome.logs
    ? { logs: outcome.logs, ...(outcome.logsTruncated ? { logsTruncated: true } : {}) }
    : {};
  if (outcome.status === 'error') {
    return { status: 'error', kind: outcome.kind, message: outcome.message, ...logs };
  }
  if (outcome.result === undefined) {
    return { status: 'ok', ...logs };
  }
  if (outcome.resultTruncated) {
    // A cut JSON text cannot be parsed; hand over its head as text.
    return { status: 'ok', result: outcome.result, resultTruncated: true, ...logs };
  }
  return { status: 'ok', result: parseResult(outcome.result), ...logs };
}

/** Code that replaces `JSON.stringify` can return non-JSON text; keep it as text. */
function parseResult(text: string): RuntimeJsonValue {
  try {
    return JSON.parse(text) as RuntimeJsonValue;
  } catch {
    return text;
  }
}

function toolValue(value: RuntimeJsonValue): RuntimeToolResult {
  return { value, artifacts: [] };
}
