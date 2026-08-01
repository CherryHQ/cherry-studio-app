/**
 * Anthropic beta-header resolution.
 *
 * Returns the `anthropic-beta` flag names a request should include based on
 * `(assistant, model, provider)`. Consumed by `AiService.buildAgentParamsFor`
 * to set the `anthropic-beta` request header for direct Anthropic calls.
 *
 * Ported from desktop's `src/main/ai/utils/anthropicHeaders.ts`, minus its
 * Bedrock-specific `providerOptions.bedrock.anthropicBeta` consumer — mobile
 * has no Bedrock provider, so `resolveProviderType` only needs to distinguish
 * Vertex here.
 */

import type { Assistant } from '@/shared/data/types/assistant';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { resolveProviderType } from '@/shared/data/types/provider';
import { isClaude4SeriesModel, isClaude45ReasoningModel } from '@/shared/utils/model';

const INTERLEAVED_THINKING_HEADER = 'interleaved-thinking-2025-05-14';
const WEBSEARCH_HEADER = 'web-search-2025-03-05';

export function addAnthropicHeaders(
  assistant: Assistant,
  model: Model,
  provider?: Provider,
): string[] {
  const headers: string[] = [];
  const providerType = provider ? resolveProviderType(provider) : undefined;

  // Claude 4.5 reasoning with native function-calling tool use — NOT on Vertex
  // (Vertex handles interleaved thinking differently).
  if (isClaude45ReasoningModel(model) && providerType !== 'vertexai') {
    headers.push(INTERLEAVED_THINKING_HEADER);
  }

  // Claude 4 series on Vertex with web search enabled.
  if (
    isClaude4SeriesModel(model) &&
    providerType === 'vertexai' &&
    assistant.settings.enableWebSearch
  ) {
    headers.push(WEBSEARCH_HEADER);
  }

  return headers;
}
