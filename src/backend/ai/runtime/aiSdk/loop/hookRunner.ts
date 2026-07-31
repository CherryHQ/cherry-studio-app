import type { ModelMessage, ToolSet } from 'ai';

import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('agentLoop');

export interface ToolExecutionStartEvent {
  callId: string;
  toolName: string;
  input: unknown;
  messages: ModelMessage[];
}

export type ToolExecutionEndEvent = ToolExecutionStartEvent & {
  durationMs: number;
  toolOutput: { type: 'tool-result'; output: unknown } | { type: 'tool-error'; error: unknown };
};

export interface ToolExecutionHooks {
  onToolExecutionStart?: (event: ToolExecutionStartEvent) => Promise<void> | void;
  onToolExecutionEnd?: (event: ToolExecutionEndEvent) => Promise<void> | void;
}

async function safeCall<F extends (...args: never[]) => unknown>(
  name: string,
  callback: F | undefined,
  ...args: Parameters<F>
): Promise<Awaited<ReturnType<F>> | undefined> {
  if (!callback) return undefined;
  try {
    return (await callback(...args)) as Awaited<ReturnType<F>>;
  } catch (error) {
    logger.warn(`hook ${name} threw`, error as Error);
    return undefined;
  }
}

/**
 * Brackets each tool's `execute` with start/end hooks. `durationMs` excludes
 * hook latency, matching the desktop runtime and AI SDK v7 event semantics.
 */
export function wrapToolsWithExecutionHooks(
  tools: ToolSet | undefined,
  hooks: ToolExecutionHooks | undefined,
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
