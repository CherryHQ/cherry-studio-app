import { definePlugin } from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import {
  isQwen35to39Model,
  isSupportedThinkingTokenQwenModel,
} from '@cherrystudio/universal/utils/model';
import type { LanguageModelMiddleware } from 'ai';

import type { ResolvedReasoningInvocation } from '../../../../utils/reasoningSerializers';

const QWEN_PROMPT_THINKING_PROVIDER_IDS = new Set(['ollama', 'lmstudio', 'nvidia', 'gpustack']);

function createQwenThinkingMiddleware(enableThinking: boolean): LanguageModelMiddleware {
  const suffix = enableThinking ? ' /think' : ' /no_think';

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => ({
      ...params,
      prompt: params.prompt?.map((message) => {
        if (message.role !== 'user' || !Array.isArray(message.content)) return message;

        return {
          ...message,
          content: message.content.map((part) =>
            part.type === 'text' &&
            !part.text.endsWith('/think') &&
            !part.text.endsWith('/no_think')
              ? { ...part, text: part.text + suffix }
              : part,
          ),
        };
      }),
    }),
  };
}

function isOllamaProvider(provider: Provider): boolean {
  return (
    provider.id === 'ollama' ||
    provider.presetProviderId === 'ollama' ||
    provider.defaultChatEndpoint === ENDPOINT_TYPE.OLLAMA_CHAT
  );
}

export function shouldApplyQwenThinking(input: {
  hasReasoningSelectionSource: boolean;
  model: Model;
  provider: Provider;
  reasoning: ResolvedReasoningInvocation;
}): boolean {
  return (
    input.hasReasoningSelectionSource &&
    !isOllamaProvider(input.provider) &&
    isSupportedThinkingTokenQwenModel(input.model) &&
    !isQwen35to39Model(input.model) &&
    QWEN_PROMPT_THINKING_PROVIDER_IDS.has(input.provider.id) &&
    input.reasoning.kind !== 'omit'
  );
}

export function createQwenThinkingPlugin(enableThinking: boolean) {
  return definePlugin({
    name: 'qwen-thinking',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(createQwenThinkingMiddleware(enableThinking));
    },
  });
}
