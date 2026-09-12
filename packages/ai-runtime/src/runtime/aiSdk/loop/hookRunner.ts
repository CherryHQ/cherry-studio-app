import type { ToolSet } from 'ai';

import type { AgentLoopHooks, ToolExecutionHooks, ToolExecutionStartEvent } from './types';

export type { ToolExecutionEndEvent, ToolExecutionHooks, ToolExecutionStartEvent } from './types';

export async function safeCall<F extends (...args: never[]) => unknown>(
  name: string,
  callback: F | undefined,
  ...args: Parameters<F>
): Promise<Awaited<ReturnType<F>> | undefined> {
  if (!callback) return undefined;
  try {
    return (await callback(...args)) as Awaited<ReturnType<F>>;
  } catch {
    return undefined;
  }
}

export function wrapForwardedHook<F extends (...args: never[]) => unknown>(
  name: string,
  callback: F | undefined,
): F | undefined {
  if (!callback) return undefined;
  return ((...args: Parameters<F>) => safeCall(name, callback, ...args)) as F;
}

/**
 * Brackets each tool's `execute` with start/end hooks. `durationMs` excludes
 * hook latency, matching the desktop runtime and AI SDK v7 event semantics.
 */
export function wrapToolsWithExecutionHooks(
  tools: ToolSet | undefined,
  hooks: AgentLoopHooks | ToolExecutionHooks | undefined,
): ToolSet | undefined {
  if (!tools || !hooks) return tools;
  if (!hooks.onToolExecutionStart && !hooks.onToolExecutionEnd) return tools;

  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const originalExecute = tool.execute;
    if (typeof originalExecute !== 'function') {
      wrapped[name] = tool;
      continue;
    }
    wrapped[name] = {
      ...tool,
      execute: async (input: unknown, options) => {
        const startEvent: ToolExecutionStartEvent = {
          callId: options.toolCallId,
          toolName: name,
          input,
          messages: options.messages,
        };
        await safeCall('onToolExecutionStart', hooks.onToolExecutionStart, startEvent);

        const startTime = performance.now();
        try {
          const output = await originalExecute(input, options);
          const durationMs = performance.now() - startTime;
          await safeCall('onToolExecutionEnd', hooks.onToolExecutionEnd, {
            ...startEvent,
            durationMs,
            toolOutput: { type: 'tool-result', output },
          });
          return output;
        } catch (error) {
          const durationMs = performance.now() - startTime;
          await safeCall('onToolExecutionEnd', hooks.onToolExecutionEnd, {
            ...startEvent,
            durationMs,
            toolOutput: { type: 'tool-error', error },
          });
          throw error;
        }
      },
    } as ToolSet[string];
  }
  return wrapped;
}
