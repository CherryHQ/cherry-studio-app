import { definePlugin } from '@cherrystudio/ai-core';
import type { LanguageModelMiddleware } from 'ai';

const SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

function createSkipGeminiThoughtSignatureMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => ({
      ...params,
      prompt: params.prompt?.map((message) => {
        if (message.role !== 'assistant') return message;

        return {
          ...message,
          content: message.content.map((part) =>
            part.type === 'tool-call'
              ? {
                  ...part,
                  providerOptions: {
                    ...part.providerOptions,
                    openaiCompatible: {
                      ...part.providerOptions?.openaiCompatible,
                      extra_content: {
                        google: { thought_signature: SKIP_THOUGHT_SIGNATURE },
                      },
                    },
                  },
                }
              : part,
          ),
        };
      }),
    }),
  };
}

/** Gemini 3 OpenAI-compatible tool calls require a thought signature on replay. */
export function createSkipGeminiThoughtSignaturePlugin() {
  return definePlugin({
    name: 'skip-gemini-thought-signature',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(createSkipGeminiThoughtSignatureMiddleware());
    },
  });
}
