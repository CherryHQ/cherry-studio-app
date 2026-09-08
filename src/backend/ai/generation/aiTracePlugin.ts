import { type AiPlugin, definePlugin } from '@cherrystudio/ai-core';
import type { ToolExecutionHooks } from '@cherrystudio/ai-runtime/runtime';
import type { LanguageModelMiddleware } from 'ai';

import { traceErrorAttributes, type TraceSpan } from '../observability';

/** Each middleware invocation is one provider attempt, including SDK retries and repair calls. */
export function createAiTracePlugin(parent: TraceSpan): AiPlugin {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const span = parent.startSpan('ai.sdk.generate', {
        'gen_ai.request.model': model.modelId,
        'gen_ai.provider.id': model.provider,
      });
      try {
        const result = await doGenerate();
        span?.end(result.finishReason.unified === 'error' ? 'error' : 'ok', {
          'gen_ai.response.finish_reason': result.finishReason.unified,
          'gen_ai.usage.input_tokens': result.usage.inputTokens.total,
          'gen_ai.usage.output_tokens': result.usage.outputTokens.total,
          'gen_ai.usage.reasoning_tokens': result.usage.outputTokens.reasoning,
          'gen_ai.usage.cache_read_tokens': result.usage.inputTokens.cacheRead,
          'gen_ai.usage.cache_write_tokens': result.usage.inputTokens.cacheWrite,
        });
        return result;
      } catch (error) {
        span?.end(params.abortSignal?.aborted ? 'cancelled' : 'error', traceErrorAttributes(error));
        throw error;
      }
    },
  };
  return definePlugin({
    name: 'ai-trace-capture',
    configureContext(context) {
      context.middlewares = [...(context.middlewares ?? []), middleware];
    },
  });
}

export function createAiTraceToolHooks(parent: TraceSpan): ToolExecutionHooks {
  const spans = new Map<string, TraceSpan>();
  return {
    onToolExecutionStart({ callId, toolName }) {
      const span = parent.startSpan('ai.sdk.execute_tool', {
        'tool.call.id': callId,
        'tool.name': toolName,
      });
      if (span) spans.set(callId, span);
    },
    onToolExecutionEnd({ callId, toolOutput }) {
      const span = spans.get(callId);
      spans.delete(callId);
      span?.end(
        toolOutput.type === 'tool-error' ? 'error' : 'ok',
        toolOutput.type === 'tool-error' ? traceErrorAttributes(toolOutput.error) : undefined,
      );
    },
  };
}
