/**
 * Normalizes the flat usage shape some Vercel AI Gateway responses return
 * back into the nested `LanguageModelV3Usage` shape the AI SDK expects.
 *
 * Ported from desktop's `src/main/ai/runtime/aiSdk/params/features/gatewayUsageNormalize.ts`.
 */

import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import { definePlugin } from '@cherrystudio/ai-core';
import type { LanguageModelMiddleware } from 'ai';

interface FlatGatewayUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

function isFlatUsage(usage: unknown): usage is FlatGatewayUsage {
  if (!usage || typeof usage !== 'object') return false;
  const u = usage as Record<string, unknown>;
  // V3-nested usage has `inputTokens` as an object; flat has it as a number.
  // Also handle the case where the field is absent (still treat as
  // flat-shaped upstream — V3 nested would carry the empty object).
  return typeof u.inputTokens !== 'object' || u.inputTokens === null;
}

function normalizeUsage(flat: FlatGatewayUsage): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: flat.inputTokens,
      noCache: undefined,
      cacheRead: flat.cachedInputTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: flat.outputTokens,
      text: undefined,
      reasoning: flat.reasoningTokens,
    },
  };
}

const gatewayUsageNormalizeMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();
    const normalized = stream.pipeThrough(
      new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === 'finish' && isFlatUsage(chunk.usage)) {
            controller.enqueue({ ...chunk, usage: normalizeUsage(chunk.usage) });
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return { stream: normalized, ...rest };
  },
};

export function createGatewayUsageNormalizePlugin() {
  return definePlugin({
    name: 'gateway-usage-normalize',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(gatewayUsageNormalizeMiddleware);
    },
  });
}
