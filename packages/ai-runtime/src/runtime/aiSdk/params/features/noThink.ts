import { definePlugin } from '@cherrystudio/ai-core';
import type { LanguageModelMiddleware } from 'ai';

function createNoThinkMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => ({
      ...params,
      prompt: params.prompt?.map((message) => {
        if (message.role !== 'user' || !Array.isArray(message.content)) return message;

        const lastContent = message.content.at(-1);
        if (
          lastContent?.type !== 'text' ||
          typeof lastContent.text !== 'string' ||
          lastContent.text.endsWith('/no_think')
        ) {
          return message;
        }

        return {
          ...message,
          content: [
            ...message.content.slice(0, -1),
            { ...lastContent, text: `${lastContent.text} /no_think` },
          ],
        };
      }),
    }),
  };
}

/** OVMS requires the prompt suffix when MCP tools participate in the request. */
export function createNoThinkPlugin() {
  return definePlugin({
    name: 'no-think',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(createNoThinkMiddleware());
    },
  });
}
