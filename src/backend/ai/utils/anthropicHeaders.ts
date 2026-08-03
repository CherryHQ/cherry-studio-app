/**
 * Anthropic beta-header resolution.
 *
 * Returns the `anthropic-beta` flag names a request should include based on
 * `(assistant, model, provider)`. Direct Anthropic requests use the HTTP
 * header; Vertex and Bedrock are identified here so transport-specific
 * handling is not leaked onto those requests.
 */

import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { resolveProviderType } from '@cherrystudio/universal/data/types/provider';
import {
  isClaude4SeriesModel,
  isClaude45ReasoningModel,
} from '@cherrystudio/universal/utils/model';

const INTERLEAVED_THINKING_HEADER = 'interleaved-thinking-2025-05-14';
const WEBSEARCH_HEADER = 'web-search-2025-03-05';

export function addAnthropicHeaders(
  assistant: Assistant,
  model: Model,
  provider?: Provider,
): string[] {
  const headers: string[] = [];
  const providerType = provider ? resolveProviderType(provider) : undefined;

  // Vertex and Bedrock handle interleaved thinking through their own transports.
  if (
    isClaude45ReasoningModel(model) &&
    providerType !== 'vertexai' &&
    providerType !== 'aws-bedrock'
  ) {
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
