/**
 * Extracts inline `<tag>…</tag>` reasoning blocks from the openai-style
 * `text` channel into `reasoning-delta` chunks, for OpenAI-compatible /
 * self-hosted backends that emit reasoning as tagged text rather than
 * structured reasoning parts.
 *
 * Ported from desktop's
 * `src/main/ai/runtime/aiSdk/params/features/reasoningExtraction.ts`.
 */

import { definePlugin } from '@cherrystudio/ai-core';
import { extractReasoningMiddleware } from 'ai';

/**
 * Must run BEFORE simulateStreaming so that after `wrapLanguageModel`
 * reverses the middleware chain, extractReasoning wraps simulateStreaming
 * and resolves unclosed tags produced by the simulated stream.
 */
export function createReasoningExtractionPlugin(options: { tagName?: string } = {}) {
  return definePlugin({
    name: 'reasoning-extraction',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(
        extractReasoningMiddleware({ tagName: options.tagName || 'thinking' }),
      );
    },
  });
}
