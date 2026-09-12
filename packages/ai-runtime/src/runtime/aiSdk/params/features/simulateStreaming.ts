/**
 * Wrap non-streaming `generate()` as a single-chunk stream, using AI SDK's
 * built-in `simulateStreamingMiddleware`.
 *
 * Ported from desktop's `src/main/ai/runtime/aiSdk/params/features/simulateStreaming.ts`.
 */

import { definePlugin } from '@cherrystudio/ai-core';
import { simulateStreamingMiddleware } from 'ai';

export function createSimulateStreamingPlugin() {
  return definePlugin({
    name: 'simulate-streaming',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(simulateStreamingMiddleware());
    },
  });
}
