import type { Assistant } from '@/data/types/assistant';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

type ReasoningEffortOptionalParams = {
  thinking?: { type: 'disabled' | 'enabled' | 'auto'; budget_tokens?: number };
  reasoning?: { max_tokens?: number; exclude?: boolean; effort?: string; enabled?: boolean };
  reasoningEffort?: string;
  // WARN: This field will be overwrite to undefined by aisdk if the provider is openai-compatible. Use reasoningEffort instead.
  reasoning_effort?: string;
  enable_thinking?: boolean;
  thinking_budget?: number;
};

// The function is only for generic provider. May extract some logics to independent provider
export function getReasoningEffort(
  assistant: Assistant,
  model: Model,
  _provider: Provider,
): ReasoningEffortOptionalParams {
  const reasoningEffort = assistant.settings?.reasoning_effort;
  if (!model.reasoning || !reasoningEffort || reasoningEffort === 'default') {
    return {};
  }

  if (reasoningEffort === 'none') {
    return { reasoningEffort: 'none' };
  }

  return { reasoningEffort };
}

export function getOpenAIReasoningParams(assistant: Assistant, model: Model) {
  return getReasoningEffort(assistant, model, { id: 'openai' } as Provider);
}

export function getAnthropicReasoningParams(assistant: Assistant, model: Model) {
  return getReasoningEffort(assistant, model, { id: 'anthropic' } as Provider);
}

export function getGeminiReasoningParams(assistant: Assistant, model: Model) {
  return getReasoningEffort(assistant, model, { id: 'gemini' } as Provider);
}

export function getXAIReasoningParams(assistant: Assistant, model: Model) {
  return getReasoningEffort(assistant, model, { id: 'xai' } as Provider);
}

export function getThinkingBudget(
  maxTokens: number,
  _reasoningEffort: string | undefined,
  _modelId: string,
) {
  return Math.floor(maxTokens * 0.8);
}
