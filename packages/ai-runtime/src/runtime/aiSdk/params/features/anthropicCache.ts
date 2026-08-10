/**
 * Anthropic Prompt Caching Middleware
 *
 * Adds `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }` markers
 * on qualifying system / tool / trailing-message breakpoints so Anthropic-compatible
 * providers re-use stable prompt prefixes.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control
 */

import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import { definePlugin } from '@cherrystudio/ai-core';
import { resolveAnthropicCacheSettings } from '@cherrystudio/universal/ai/anthropicCache';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { LanguageModelMiddleware } from 'ai';
import { estimateTokenCount } from 'tokenx';

import { VOLATILE_PROMPT_VARIABLES } from '../../../../utils/promptVariables';

const MAX_CACHE_BREAKPOINTS = 4;
const cacheProviderOptions = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
} as const;

function hasVolatilePromptVariables(assistant: Assistant | undefined): boolean {
  const prompt = assistant?.prompt;
  return Boolean(prompt && VOLATILE_PROMPT_VARIABLES.some((variable) => prompt.includes(variable)));
}

function estimateContentTokens(content: LanguageModelV3Message['content']): number {
  if (typeof content === 'string') return estimateTokenCount(content);
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (part.type === 'text') return total + estimateTokenCount(part.text);

      const serializedPayload = JSON.stringify({
        input: 'input' in part ? part.input : undefined,
        output: 'output' in part ? part.output : undefined,
      });
      return serializedPayload === '{}' ? total : total + estimateTokenCount(serializedPayload);
    }, 0);
  }
  return 0;
}

function estimateToolTokens(tool: LanguageModelV3FunctionTool): number {
  return estimateTokenCount(
    JSON.stringify({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }),
  );
}

function isFunctionTool(
  tool: NonNullable<LanguageModelV3CallOptions['tools']>[number],
): tool is LanguageModelV3FunctionTool {
  return tool.type === 'function';
}

function withCacheProviderOptions<TValue extends { providerOptions?: unknown }>(
  value: TValue,
): TValue {
  return {
    ...value,
    providerOptions: {
      ...(value.providerOptions && typeof value.providerOptions === 'object'
        ? value.providerOptions
        : {}),
      anthropic: {
        ...(value.providerOptions as { anthropic?: object } | undefined)?.anthropic,
        cacheControl: cacheProviderOptions.anthropic.cacheControl,
      },
    },
  };
}

interface CacheBreakpointBudget {
  remaining: number;
  use(): boolean;
}

function createCacheBreakpointBudget(): CacheBreakpointBudget {
  return {
    remaining: MAX_CACHE_BREAKPOINTS,
    use() {
      if (this.remaining <= 0) return false;
      this.remaining--;
      return true;
    },
  };
}

function sortToolsForCache(
  tools: LanguageModelV3CallOptions['tools'],
): LanguageModelV3CallOptions['tools'] {
  if (!tools?.length) return tools;
  return [...tools].sort((left, right) => {
    const leftName = isFunctionTool(left) ? left.name : left.id;
    const rightName = isFunctionTool(right) ? right.name : right.id;
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  });
}

function estimateToolsPrefix(sortedTools: LanguageModelV3CallOptions['tools']): {
  markerIndex: number;
  totalTokens: number;
} {
  let markerIndex = -1;
  let totalTokens = 0;
  for (let index = 0; index < (sortedTools?.length ?? 0); index++) {
    const tool = sortedTools?.[index];
    if (!tool || !isFunctionTool(tool)) continue;
    totalTokens += estimateToolTokens(tool);
    markerIndex = index;
  }
  return { markerIndex, totalTokens };
}

function applyToolCacheMarker(
  sortedTools: LanguageModelV3CallOptions['tools'],
  markerIndex: number,
  toolPrefixTokens: number,
  tokenThreshold: number,
  budget: CacheBreakpointBudget,
): LanguageModelV3CallOptions['tools'] {
  if (
    !sortedTools?.length ||
    markerIndex === -1 ||
    toolPrefixTokens < tokenThreshold ||
    !budget.use()
  ) {
    return sortedTools;
  }

  const markedTools = [...sortedTools];
  markedTools[markerIndex] = withCacheProviderOptions(
    markedTools[markerIndex] as LanguageModelV3FunctionTool,
  );
  return markedTools;
}

export async function transformAnthropicCacheParams(
  params: LanguageModelV3CallOptions,
  provider: Provider,
  assistant: Assistant | undefined,
): Promise<LanguageModelV3CallOptions> {
  const settings = resolveAnthropicCacheSettings(provider);
  if (!settings.enabled) return params;
  if (!Array.isArray(params.prompt) || params.prompt.length === 0) return params;

  const messages = [...params.prompt];
  const budget = createCacheBreakpointBudget();
  const volatileSystemPrompt = hasVolatilePromptVariables(assistant);
  const sortedTools = sortToolsForCache(params.tools);
  const toolPrefix = estimateToolsPrefix(sortedTools);

  if (settings.cacheSystemMessage && !volatileSystemPrompt) {
    let systemPrefixTokens = toolPrefix.totalTokens;
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      systemPrefixTokens += estimateContentTokens(message.content);
      if (
        message.role === 'system' &&
        systemPrefixTokens >= settings.tokenThreshold &&
        budget.use()
      ) {
        messages[index] = withCacheProviderOptions(message);
        break;
      }
    }
  }

  const tools = applyToolCacheMarker(
    sortedTools,
    toolPrefix.markerIndex,
    toolPrefix.totalTokens,
    settings.tokenThreshold,
    budget,
  );

  if (settings.cacheLastNMessages > 0 && !volatileSystemPrompt) {
    const cumulativeTokens: number[] = [];
    let tokenSum = toolPrefix.totalTokens;
    for (const message of messages) {
      tokenSum += estimateContentTokens(message.content);
      cumulativeTokens.push(tokenSum);
    }

    let cachedCount = 0;
    for (
      let index = messages.length - 1;
      index >= 0 && cachedCount < settings.cacheLastNMessages;
      index--
    ) {
      const message = messages[index];
      if (
        message.role === 'system' ||
        cumulativeTokens[index] < settings.tokenThreshold ||
        message.content.length === 0
      ) {
        continue;
      }
      if (!budget.use()) break;

      if (typeof message.content === 'string') {
        messages[index] = withCacheProviderOptions(message);
      } else {
        const content = [...message.content];
        const lastIndex = content.length - 1;
        content[lastIndex] = withCacheProviderOptions(content[lastIndex]);
        messages[index] = { ...message, content } as LanguageModelV3Message;
      }
      cachedCount++;
    }
  }

  return { ...params, prompt: messages, tools };
}

function anthropicCacheMiddleware(
  provider: Provider,
  assistant: Assistant | undefined,
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) =>
      transformAnthropicCacheParams(params, provider, assistant),
  };
}

export function createAnthropicCachePlugin(provider: Provider, assistant: Assistant | undefined) {
  return definePlugin({
    name: 'anthropic-cache',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(anthropicCacheMiddleware(provider, assistant));
    },
  });
}
