import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import type { XaiResponsesProviderOptions } from '@ai-sdk/xai';

import type { Assistant } from '@/shared/data/types/assistant';
import type { Model } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import {
  findTokenLimit,
  GEMINI_FLASH_MODEL_REGEX,
  getLowerBaseModelName,
  getModelSupportedReasoningEffortOptions,
  isClaude46SeriesModel,
  isClaude47SeriesModel,
  isDeepSeekHybridInferenceModel,
  isDeepSeekV4PlusModel,
  isDoubaoSeed18Model,
  isDoubaoSeedAfter251015,
  isDoubaoThinkingAutoModel,
  isGemini3ThinkingTokenModel,
  isGrok4FastReasoningModel,
  isHostedGemma4ThinkingModel,
  isOpenAIDeepResearchModel,
  isOpenAIModel,
  isOpenAIReasoningModel,
  isQwen35to39Model,
  isQwenAlwaysThinkModel,
  isQwenReasoningModel,
  isReasoningModel,
  isSupportedReasoningEffortGrokModel,
  isSupportedReasoningEffortModel,
  isSupportedReasoningEffortOpenAIModel,
  isSupportedThinkingTokenClaudeModel,
  isSupportedThinkingTokenDoubaoModel,
  isSupportedThinkingTokenGeminiModel,
  isSupportedThinkingTokenHunyuanModel,
  isSupportedThinkingTokenKimiModel,
  isSupportedThinkingTokenMiMoModel,
  isSupportedThinkingTokenModel,
  isSupportedThinkingTokenQwenModel,
  isSupportedThinkingTokenZhipuModel,
  isSupportNoneReasoningEffortModel,
} from '@/shared/utils/model';
import {
  EFFORT_RATIO,
  isSystemProviderId,
  type ReasoningEffortOption,
  SystemProviderIds,
} from './providerIds';
import {
  computeBudgetTokens,
  FALLBACK_TOKEN_LIMIT,
  getThinkingBudget as sharedGetThinkingBudget,
} from './reasoningBudget';

const DEFAULT_MAX_TOKENS = 4096;

type ReasoningEffortOptionalParams = {
  thinking?: { type: 'disabled' | 'enabled' | 'auto'; budget_tokens?: number };
  reasoning?: { max_tokens?: number; exclude?: boolean; effort?: string; enabled?: boolean };
  reasoningEffort?: string;
  reasoning_effort?: string;
  enable_thinking?: boolean;
  thinking_budget?: number;
  incremental_output?: boolean;
  enable_reasoning?: boolean;
  chat_template_kwargs?: {
    thinking?: boolean;
    enable_thinking?: boolean;
    thinking_budget?: number;
  };
  extra_body?: {
    google?: {
      thinking_config: {
        thinking_budget: number;
        include_thoughts?: boolean;
      };
    };
    thinking?: {
      type: 'enabled' | 'disabled';
    };
    thinking_budget?: number;
    reasoning_effort?: string;
  };
  disable_reasoning?: boolean;
};

function normalizedReasoningEffort(assistant: Assistant): ReasoningEffortOption | undefined {
  const effort = assistant.settings?.reasoning_effort;
  return effort === 'max' ? 'xhigh' : (effort as ReasoningEffortOption | undefined);
}

function isSupportEnableThinkingProvider(provider: Provider): boolean {
  return !['ollama', 'lmstudio', 'nvidia', 'gpustack'].includes(provider.id);
}

function toInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function getReasoningEffort(
  assistant: Assistant,
  model: Model,
  provider: Provider,
): ReasoningEffortOptionalParams {
  const rawModelId = parseUniqueModelId(model.id).modelId;
  const modelId = getLowerBaseModelName(rawModelId);
  if (provider.id === 'groq') {
    return {};
  }

  if (!isReasoningModel(model)) {
    return {};
  }

  if (isOpenAIDeepResearchModel(model)) {
    return {
      reasoning_effort: 'medium',
    };
  }

  const reasoningEffort = normalizedReasoningEffort(assistant);
  if (!reasoningEffort || reasoningEffort === 'default') {
    return {};
  }

  if (reasoningEffort === 'none') {
    if (model.providerId === SystemProviderIds.openrouter) {
      if (isSupportNoneReasoningEffortModel(model)) {
        return { reasoning: { effort: 'none' } };
      }
      return { reasoning: { enabled: false, exclude: true } };
    }

    if (model.providerId === SystemProviderIds.nvidia) {
      if (isSupportedThinkingTokenQwenModel(model)) {
        return { chat_template_kwargs: { enable_thinking: false } };
      }
      if (isDeepSeekHybridInferenceModel(model) || isSupportedThinkingTokenKimiModel(model)) {
        return { chat_template_kwargs: { thinking: false } };
      }
      if (isSupportedThinkingTokenZhipuModel(model)) {
        return { chat_template_kwargs: { enable_thinking: false } };
      }
    }

    if (
      (isSupportEnableThinkingProvider(provider) &&
        (isSupportedThinkingTokenQwenModel(model) ||
          isSupportedThinkingTokenHunyuanModel(model))) ||
      (provider.id === SystemProviderIds.dashscope &&
        (isDeepSeekHybridInferenceModel(model) ||
          isSupportedThinkingTokenZhipuModel(model) ||
          isSupportedThinkingTokenKimiModel(model))) ||
      (provider.id === SystemProviderIds.silicon &&
        (isDeepSeekHybridInferenceModel(model) || isSupportedThinkingTokenZhipuModel(model)))
    ) {
      return { enable_thinking: false };
    }

    if (provider.id === SystemProviderIds.together) {
      return { reasoning: { enabled: false } };
    }

    if (isSupportedThinkingTokenGeminiModel(model)) {
      if (GEMINI_FLASH_MODEL_REGEX.test(model.id)) {
        return {
          extra_body: {
            google: {
              thinking_config: {
                thinking_budget: 0,
              },
            },
          },
        };
      }
      return {};
    }

    if (
      isSupportedThinkingTokenDoubaoModel(model) ||
      isSupportedThinkingTokenZhipuModel(model) ||
      isSupportedThinkingTokenKimiModel(model)
    ) {
      if (provider.id === SystemProviderIds.cerebras) {
        return { disable_reasoning: true };
      }
      return { thinking: { type: 'disabled' } };
    }

    if (isDeepSeekV4PlusModel(model)) {
      return { thinking: { type: 'disabled' } };
    }

    if (isDeepSeekHybridInferenceModel(model)) {
      return {};
    }

    if (isSupportNoneReasoningEffortModel(model)) {
      return { reasoningEffort: 'none' };
    }

    if (isQwen35to39Model(model)) {
      return { chat_template_kwargs: { enable_thinking: false } };
    }

    if (modelId.includes('mistral-small-2603')) {
      return { reasoningEffort: 'none' };
    }

    return {};
  }

  if (provider.id === SystemProviderIds.poe) {
    if (isOpenAIReasoningModel(model)) {
      return {
        extra_body: { reasoning_effort: reasoningEffort === 'auto' ? 'medium' : reasoningEffort },
      };
    }

    if (isSupportedThinkingTokenClaudeModel(model)) {
      const effortRatio = EFFORT_RATIO[reasoningEffort];
      const tokenLimit = findTokenLimit(rawModelId);
      const maxTokens = assistant.settings?.maxTokens;
      if (!tokenLimit) return {};
      let budgetTokens = Math.floor(
        (tokenLimit.max - tokenLimit.min) * effortRatio + tokenLimit.min,
      );
      budgetTokens = Math.floor(
        Math.max(1024, Math.min(budgetTokens, (maxTokens || DEFAULT_MAX_TOKENS) * effortRatio)),
      );
      return { extra_body: { thinking_budget: budgetTokens } };
    }

    if (isSupportedThinkingTokenGeminiModel(model)) {
      const effortRatio = EFFORT_RATIO[reasoningEffort];
      const tokenLimit = findTokenLimit(rawModelId);
      const budgetTokens =
        tokenLimit && reasoningEffort !== 'auto'
          ? Math.floor((tokenLimit.max - tokenLimit.min) * effortRatio + tokenLimit.min)
          : undefined;
      return { extra_body: { thinking_budget: budgetTokens ?? -1 } };
    }

    return {};
  }

  if (model.providerId === SystemProviderIds.openrouter) {
    if (isGrok4FastReasoningModel(model)) {
      return { reasoning: { enabled: true } };
    }

    if (isSupportedReasoningEffortModel(model) || isSupportedThinkingTokenModel(model)) {
      return { reasoning: { effort: reasoningEffort === 'auto' ? 'medium' : reasoningEffort } };
    }
  }

  const effortRatio = EFFORT_RATIO[reasoningEffort];
  const tokenLimit = findTokenLimit(modelId);
  const budgetTokens = tokenLimit
    ? Math.floor((tokenLimit.max - tokenLimit.min) * effortRatio + tokenLimit.min)
    : undefined;

  if (model.providerId === SystemProviderIds.nvidia) {
    if (isSupportedThinkingTokenQwenModel(model)) {
      const enableThinkingConfig = isQwenAlwaysThinkModel(model) ? {} : { enable_thinking: true };
      return { chat_template_kwargs: { ...enableThinkingConfig, thinking_budget: budgetTokens } };
    }
    if (isDeepSeekHybridInferenceModel(model) || isSupportedThinkingTokenKimiModel(model)) {
      return { chat_template_kwargs: { thinking: true } };
    }
    if (isSupportedThinkingTokenZhipuModel(model)) {
      return { chat_template_kwargs: { enable_thinking: true } };
    }
  }

  if (model.providerId === SystemProviderIds.silicon) {
    if (
      isDeepSeekHybridInferenceModel(model) ||
      isSupportedThinkingTokenZhipuModel(model) ||
      isSupportedThinkingTokenQwenModel(model) ||
      isSupportedThinkingTokenHunyuanModel(model)
    ) {
      return {
        enable_thinking: true,
        thinking_budget: budgetTokens ? toInteger(Math.max(budgetTokens, 32768)) : undefined,
      };
    }
    return {};
  }

  if (isDeepSeekV4PlusModel(model)) {
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: reasoningEffort === 'xhigh' ? 'max' : 'high',
    };
  }

  if (isDeepSeekHybridInferenceModel(model)) {
    if (isSystemProviderId(provider.id)) {
      switch (provider.id) {
        case SystemProviderIds.dashscope:
          return { enable_thinking: true, incremental_output: true };
        case SystemProviderIds['new-api']:
        case SystemProviderIds.cherryin:
          return { extra_body: { thinking: { type: 'enabled' } } };
        case SystemProviderIds.hunyuan:
        case SystemProviderIds['tencent-cloud-ti']:
        case SystemProviderIds.doubao:
        case SystemProviderIds.deepseek:
        case SystemProviderIds.aihubmix:
        case SystemProviderIds.sophnet:
        case SystemProviderIds.ppio:
        case SystemProviderIds.dmxapi:
          return { thinking: { type: 'enabled' } };
        case SystemProviderIds.openrouter:
        case SystemProviderIds.together:
          return { reasoning: { enabled: true } };
        default:
          break;
      }
    }
    return { thinking: { type: 'enabled' } };
  }

  if (provider.id === SystemProviderIds.dashscope) {
    if (
      isQwenReasoningModel(model) ||
      isSupportedThinkingTokenZhipuModel(model) ||
      isSupportedThinkingTokenKimiModel(model)
    ) {
      return { enable_thinking: true, thinking_budget: budgetTokens };
    }
  }

  if (provider.id === SystemProviderIds.together) {
    const adjusted =
      reasoningEffort === 'minimal'
        ? 'low'
        : reasoningEffort === 'xhigh'
          ? 'high'
          : reasoningEffort === 'auto'
            ? 'medium'
            : reasoningEffort;
    return {
      reasoningEffort: adjusted,
      reasoning: { enabled: true },
    };
  }

  if (isQwenReasoningModel(model)) {
    const enableThinkingConfig = isQwenAlwaysThinkModel(model) ? {} : { enable_thinking: true };
    if (isSupportEnableThinkingProvider(provider)) {
      return { ...enableThinkingConfig, thinking_budget: budgetTokens };
    }
    return { chat_template_kwargs: { ...enableThinkingConfig, thinking_budget: budgetTokens } };
  }

  if (isSupportedThinkingTokenHunyuanModel(model) && isSupportEnableThinkingProvider(provider)) {
    return { enable_thinking: true };
  }

  if (isSupportedReasoningEffortModel(model)) {
    const supportedOptions = getModelSupportedReasoningEffortOptions(model)?.filter(
      (option) => option !== 'default',
    );
    if (supportedOptions?.includes(reasoningEffort)) {
      return { reasoningEffort };
    }
    return { reasoningEffort: supportedOptions?.[0] };
  }

  if (modelId.includes('mistral-small-2603')) {
    return { reasoningEffort: 'high' };
  }

  if (isSupportedThinkingTokenGeminiModel(model)) {
    if (isGemini3ThinkingTokenModel(model)) {
      return { reasoningEffort };
    }
    if (reasoningEffort === 'auto') {
      return {
        extra_body: {
          google: {
            thinking_config: {
              thinking_budget: -1,
              include_thoughts: true,
            },
          },
        },
      };
    }
    return {
      extra_body: {
        google: {
          thinking_config: {
            thinking_budget: budgetTokens ?? -1,
            include_thoughts: true,
          },
        },
      },
    };
  }

  if (isSupportedThinkingTokenClaudeModel(model)) {
    const maxTokens = assistant.settings?.maxTokens;
    return {
      thinking: {
        type: 'enabled',
        budget_tokens: budgetTokens
          ? Math.floor(
              Math.max(
                1024,
                Math.min(budgetTokens, (maxTokens || DEFAULT_MAX_TOKENS) * effortRatio),
              ),
            )
          : undefined,
      },
    };
  }

  if (isSupportedThinkingTokenDoubaoModel(model)) {
    if (isDoubaoSeedAfter251015(model) || isDoubaoSeed18Model(model)) {
      return { reasoningEffort };
    }
    if (reasoningEffort === 'high') {
      return { thinking: { type: 'enabled' } };
    }
    if (reasoningEffort === 'auto' && isDoubaoThinkingAutoModel(model)) {
      return { thinking: { type: 'auto' } };
    }
    return {};
  }

  if (isSupportedThinkingTokenZhipuModel(model)) {
    if (provider.id === SystemProviderIds.cerebras) {
      return {};
    }
    return { thinking: { type: 'enabled' } };
  }

  if (isSupportedThinkingTokenMiMoModel(model) || isSupportedThinkingTokenKimiModel(model)) {
    return { thinking: { type: 'enabled' } };
  }

  return {};
}

export function getOpenAIReasoningParams(
  assistant: Assistant,
  model: Model,
  openAISettings?: { summaryText?: unknown },
): Pick<OpenAIResponsesProviderOptions, 'reasoningEffort' | 'reasoningSummary'> {
  if (!isReasoningModel(model)) return {};

  let reasoningEffort = normalizedReasoningEffort(assistant);
  if (!reasoningEffort || reasoningEffort === 'default') return {};
  if (isOpenAIDeepResearchModel(model) || reasoningEffort === 'auto') {
    reasoningEffort = 'medium';
  }

  if (!isOpenAIModel(model)) {
    return { reasoningEffort };
  }

  if (isSupportedReasoningEffortOpenAIModel(model)) {
    return {
      reasoningEffort,
      reasoningSummary: model.id.includes('o1-pro') ? undefined : openAISettings?.summaryText,
    } as Pick<OpenAIResponsesProviderOptions, 'reasoningEffort' | 'reasoningSummary'>;
  }

  return {};
}

export function getThinkingBudget(
  maxTokens: number | undefined,
  reasoningEffort: string | undefined,
  modelId: string,
): number | undefined {
  return sharedGetThinkingBudget(
    maxTokens,
    reasoningEffort === 'max' ? 'xhigh' : reasoningEffort,
    modelId,
    EFFORT_RATIO,
  );
}

function getFallbackBudgetTokens(reasoningEffort: string | undefined): number {
  const effort = reasoningEffort === 'max' ? 'xhigh' : reasoningEffort;
  const effortRatio =
    EFFORT_RATIO[(effort as ReasoningEffortOption | undefined) ?? 'high'] ?? EFFORT_RATIO.high;
  return computeBudgetTokens(FALLBACK_TOKEN_LIMIT, effortRatio);
}

export function getAnthropicReasoningParams(
  assistant: Assistant,
  model: Model,
): {
  thinking?: AnthropicProviderOptions['thinking'];
  effort?: AnthropicProviderOptions['effort'];
  sendReasoning?: AnthropicProviderOptions['sendReasoning'];
} {
  if (!isReasoningModel(model)) return {};

  const reasoningEffort = normalizedReasoningEffort(assistant);
  if (!reasoningEffort || reasoningEffort === 'default') return {};
  if (reasoningEffort === 'none') {
    return { thinking: { type: 'disabled' } };
  }

  if (isSupportedThinkingTokenClaudeModel(model)) {
    if (isClaude47SeriesModel(model)) {
      const effortMap = {
        auto: undefined,
        minimal: 'low',
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'xhigh',
      } as const;
      const effort =
        effortMap[reasoningEffort as Exclude<ReasoningEffortOption, 'none' | 'default'>];
      const thinking = { type: 'adaptive', display: 'summarized' } as const;
      return effort ? { thinking, effort } : { thinking };
    }

    if (isClaude46SeriesModel(model)) {
      const effortMap = {
        auto: undefined,
        minimal: 'low',
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'max',
      } as const;
      const effort =
        effortMap[reasoningEffort as Exclude<ReasoningEffortOption, 'none' | 'default'>];
      return effort
        ? { thinking: { type: 'adaptive' }, effort }
        : { thinking: { type: 'adaptive' } };
    }

    const budgetTokens = getThinkingBudget(
      assistant.settings?.maxTokens,
      reasoningEffort,
      model.id,
    );
    return {
      thinking: {
        type: 'enabled',
        budgetTokens: budgetTokens ?? getFallbackBudgetTokens(reasoningEffort),
      },
    };
  }

  const budgetTokens = getThinkingBudget(assistant.settings?.maxTokens, reasoningEffort, model.id);
  const params: ReturnType<typeof getAnthropicReasoningParams> = {
    thinking: {
      type: 'enabled',
      budgetTokens: budgetTokens ?? getFallbackBudgetTokens(reasoningEffort),
    },
    sendReasoning: true,
  };

  if (isDeepSeekV4PlusModel(model)) {
    const effortMap = { high: 'high', xhigh: 'max' } as const;
    const effort = effortMap[reasoningEffort as keyof typeof effortMap];
    if (effort) params.effort = effort;
  }

  return params;
}

type GoogleThinkingLevel = NonNullable<
  GoogleGenerativeAIProviderOptions['thinkingConfig']
>['thinkingLevel'];

function mapToGeminiThinkingLevel(reasoningEffort: ReasoningEffortOption): GoogleThinkingLevel {
  switch (reasoningEffort) {
    case 'auto':
    case 'default':
      return undefined;
    case 'none':
    case 'minimal':
      return 'minimal';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
    case 'xhigh':
      return 'high';
  }
}

export function getGeminiReasoningParams(
  assistant: Assistant,
  model: Model,
): Pick<GoogleGenerativeAIProviderOptions, 'thinkingConfig'> {
  if (!isReasoningModel(model) || !isSupportedThinkingTokenGeminiModel(model)) return {};

  const reasoningEffort = normalizedReasoningEffort(assistant);
  if (!reasoningEffort || reasoningEffort === 'default') return {};

  const rawModelId = parseUniqueModelId(model.id).modelId;
  let thinkingLevel: GoogleThinkingLevel | null = null;
  const includeThoughts = reasoningEffort !== 'none';

  if (isHostedGemma4ThinkingModel(model)) {
    const isHighThinking = reasoningEffort === 'high' || reasoningEffort === 'xhigh';
    return {
      thinkingConfig: {
        includeThoughts: isHighThinking,
        thinkingLevel: isHighThinking ? 'high' : 'minimal',
      },
    };
  }

  if (isGemini3ThinkingTokenModel(model)) {
    thinkingLevel = mapToGeminiThinkingLevel(reasoningEffort);
    if (thinkingLevel === 'minimal' && getLowerBaseModelName(rawModelId).includes('pro')) {
      thinkingLevel = 'low';
    }
  }

  if (thinkingLevel !== null) {
    return { thinkingConfig: { includeThoughts, thinkingLevel } };
  }

  if (reasoningEffort === 'auto') {
    return { thinkingConfig: { includeThoughts, thinkingBudget: -1 } };
  }

  if (reasoningEffort === 'none') {
    return {
      thinkingConfig: {
        includeThoughts,
        ...(GEMINI_FLASH_MODEL_REGEX.test(model.id) ? { thinkingBudget: 0 } : {}),
      },
    };
  }

  const { min, max } = findTokenLimit(rawModelId) || { min: 0, max: 0 };
  const budget = Math.floor((max - min) * EFFORT_RATIO[reasoningEffort] + min);

  return {
    thinkingConfig: {
      includeThoughts,
      ...(budget > 0 ? { thinkingBudget: budget } : {}),
    },
  };
}

export function getXAIReasoningParams(
  assistant: Assistant,
  model: Model,
): Pick<XaiResponsesProviderOptions, 'reasoningEffort'> {
  const modelId = getLowerBaseModelName(model.id);
  const isGrok43 = modelId.includes('grok-4.3') && !modelId.includes('non-reasoning');

  if (!isSupportedReasoningEffortGrokModel(model) && !isGrok43) return {};

  const reasoningEffort = normalizedReasoningEffort(assistant);
  if (!reasoningEffort || reasoningEffort === 'default') return {};

  if (isGrok43) {
    switch (reasoningEffort) {
      case 'low':
      case 'medium':
      case 'high':
        return { reasoningEffort };
      case 'none':
        return {};
      default:
        return {};
    }
  }

  switch (reasoningEffort) {
    case 'auto':
    case 'minimal':
    case 'medium':
      return { reasoningEffort: 'low' };
    case 'low':
    case 'high':
      return { reasoningEffort };
    case 'xhigh':
      return { reasoningEffort: 'high' };
    default:
      return {};
  }
}

export function getReasoningTagName(modelId: string | undefined): string {
  if (modelId?.includes('gpt-oss')) return 'reasoning';
  if (modelId?.includes('gemini')) return 'thought';
  if (modelId?.includes('seed-oss-36b')) return 'seed:think';
  return 'think';
}
