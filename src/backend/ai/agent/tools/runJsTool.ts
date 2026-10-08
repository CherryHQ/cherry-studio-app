/**
 * `run_js`: the model runs JavaScript for exact computation.
 *
 * Isolated by construction (docs/references/agent/agent-tools-and-resources.md):
 * each call gets a fresh native QuickJS runtime whose global object holds only
 * standard built-ins, so the code reaches nothing of the app, the network, or
 * the device. Output over budget is saved as a text file holding the full
 * output; the tool needs no approval.
 *
 * The output budget and the unbounded default deadline follow Pi's codemode
 * tool.
 */

import * as z from 'zod';

import type { JsSandbox, JsSandboxLimits, JsSandboxOutcome } from '@/backend/services/jsSandbox';
import type { FileEntry, FileEntryProvenance } from '@/shared/data/types/file';

import type { RuntimeArtifact, RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const RUN_JS_TOOL_NAME = 'run_js';

/** Far above what a computation needs; a larger body is a malfunction. */
export const RUN_JS_MAX_CODE_LENGTH = 100_000;

/** Token budget for the output when the model does not choose one. */
export const RUN_JS_DEFAULT_MAX_OUTPUT_TOKENS = 10_000;
const CHARS_PER_TOKEN = 4;

/** `setTimeout`'s largest delay, which also bounds Pi's `timeout_ms`. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * The run's budgets apart from its deadline. The two captures together stay
 * under `read_file`'s 1 MiB source limit, so a saved output reads back whole.
 */
export const RUN_JS_LIMITS: Omit<JsSandboxLimits, 'timeoutMs'> = {
  memoryBytes: 64 * 1024 * 1024,
  maxResultBytes: 500 * 1024,
  maxLogBytes: 500 * 1024,
};

export const RUN_JS_OUTPUT_FILENAME = 'run_js-output.txt';

export const runJsInputSchema = z.strictObject({
  code: z
    .string()
    .min(1)
    .max(RUN_JS_MAX_CODE_LENGTH)
    .describe(
      'The body of an async function. `return` the result; top-level `await` works. Include every input value in the code.',
    ),
  timeout_ms: z
    .int()
    .min(1)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(
      'Hard deadline in milliseconds. Unset by default: the script runs until it settles or the turn is stopped.',
    ),
  max_output_tokens: z
    .int()
    .min(0)
    .optional()
    .describe(
      `Token budget for the output. Defaults to ${RUN_JS_DEFAULT_MAX_OUTPUT_TOKENS}; longer output keeps its start and end, and the full text is saved to a file.`,
    ),
});

/** The slice of the managed-file port that saves an output over budget. */
export type RunJsFiles = {
  createTextEntry(
    input: { data: string; mediaType: string; name: string; provenance: FileEntryProvenance },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

export type RunJsToolDependencies = {
  sandbox: JsSandbox;
  files: RunJsFiles;
};

export function createRunJsTool({ sandbox, files }: RunJsToolDependencies): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: RUN_JS_TOOL_NAME },
    providerName: RUN_JS_TOOL_NAME,
    displayName: 'Run JavaScript',
    description:
      'Run JavaScript in an isolated sandbox for exact computation: arithmetic, statistics, date and time math, counting, sorting, parsing, and transforming data. `return` a JSON-serializable value (Map and Set become object and array, BigInt becomes a string); `console.log` output is returned as `logs`. Standard ECMAScript plus atob/btoa. There is no Intl, so locale arguments to toLocaleString and similar methods are ignored; format numbers and dates yourself. There is no network, file, timer, module, device, or app access. Every call starts fresh; include every input value in the code. Memory is limited to 64 MB; there is no time limit unless you set `timeout_ms`. Output over `max_output_tokens` keeps its start and end, and the full text is saved to a file you can page through with `read_file`.',
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
      const { code, timeout_ms, max_output_tokens } = parsed.data;
      const outcome = await sandbox.run({
        code,
        limits: { ...RUN_JS_LIMITS, timeoutMs: timeout_ms ?? 0 },
        signal,
      });
      return toToolResult(
        outcome,
        max_output_tokens ?? RUN_JS_DEFAULT_MAX_OUTPUT_TOKENS,
        files,
        signal,
      );
    },
  };
}

/**
 * Output within budget keeps its structured form. Past it, the output becomes
 * one text that keeps its start and end, and the full text is saved as a
 * managed file the model can page through with `read_file`.
 */
async function toToolResult(
  outcome: JsSandboxOutcome,
  maxOutputTokens: number,
  files: RunJsFiles,
  signal: AbortSignal,
): Promise<RuntimeToolResult> {
  const value = toModelValue(outcome);
  const text = outputText(outcome);
  const budget = maxOutputTokens * CHARS_PER_TOKEN;
  if (text.length <= budget) {
    return toolValue(value);
  }

  const headChars = Math.floor(budget / 2);
  const tailChars = budget - headChars;
  const removed = text.length - headChars - tailChars;
  const tail = tailChars > 0 ? text.slice(-tailChars) : '';
  let output = `Warning: truncated output (original token count: ${Math.ceil(text.length / CHARS_PER_TOKEN)})\nTotal output lines: ${text.split('\n').length}\n\n${text.slice(0, headChars)}…${Math.ceil(removed / CHARS_PER_TOKEN)} tokens truncated…${tail}`;

  const {
    result: _result,
    resultTruncated: _resultTruncated,
    logs: _logs,
    logsTruncated: _logsTruncated,
    ...rest
  } = value;
  const artifacts: RuntimeArtifact[] = [];
  try {
    const entry = await files.createTextEntry(
      {
        data: text,
        mediaType: 'text/plain',
        name: RUN_JS_OUTPUT_FILENAME,
        provenance: 'generated',
      },
      signal,
    );
    artifacts.push({
      ref: { kind: 'managed-file', fileEntryId: entry.id },
      mediaType: entry.mediaType,
      name: entry.filename,
      kind: 'created',
    });
    output += `\n\n[Full output: read_file with file_entry_id ${entry.id}, paging with start_line and limit]`;
    return { value: { ...rest, output, fullOutputFileEntryId: entry.id }, artifacts };
  } catch (error) {
    signal.throwIfAborted();
    output += `\n\n[Could not save the full output: ${error instanceof Error ? error.message : String(error)}]`;
    return toolValue({ ...rest, output });
  }
}

/** Everything the model would read: the returned value's JSON, then the console. */
function outputText(outcome: JsSandboxOutcome): string {
  const sections: string[] = [];
  if (outcome.status === 'ok' && outcome.result !== undefined) {
    sections.push(
      `Returned value:\n${outcome.result}${outcome.resultTruncated ? `\n[The returned value was cut at ${RUN_JS_LIMITS.maxResultBytes / 1024} KiB]` : ''}`,
    );
  }
  if (outcome.logs) {
    sections.push(
      `Console output:\n${outcome.logs}${outcome.logsTruncated ? `[Console output was cut at ${RUN_JS_LIMITS.maxLogBytes / 1024} KiB]` : ''}`,
    );
  }
  return sections.join('\n\n');
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
