/**
 * https://openrouter.ai/docs/docs/best-practices/reasoning-tokens#example-preserving-reasoning-blocks-with-openrouter-and-claude
 *
 * Ported from desktop's `src/main/ai/runtime/aiSdk/params/features/openrouterReasoning.ts`.
 */

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { definePlugin } from '@cherrystudio/ai-core';
import type { LanguageModelMiddleware } from 'ai';

const REDACTED_BLOCK = '[REDACTED]';

function createOpenrouterReasoningMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();
      const modifiedContent = content.map((part) => {
        if (part.type === 'reasoning' && part.text.includes(REDACTED_BLOCK)) {
          return { ...part, text: part.text.replace(REDACTED_BLOCK, '') };
        }
        return part;
      });
      return { content: modifiedContent, ...rest };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      return {
        stream: stream.pipeThrough(
          new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
            transform(chunk, controller) {
              if (chunk.type === 'reasoning-delta' && chunk.delta.includes(REDACTED_BLOCK)) {
                controller.enqueue({ ...chunk, delta: chunk.delta.replace(REDACTED_BLOCK, '') });
              } else {
                controller.enqueue(chunk);
              }
            },
          }),
        ),
        ...rest,
      };
    },
  };
}

/** Strip OpenRouter reasoning-redacted blocks. */
export function createOpenrouterReasoningPlugin() {
  return definePlugin({
    name: 'openrouter-reasoning',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(createOpenrouterReasoningMiddleware());
    },
  });
}
