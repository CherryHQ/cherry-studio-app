import { MODALITY, MODEL_CAPABILITY, VENDOR_PATTERNS } from '@cherrystudio/provider-registry';
import type { Model } from '@shared/data/types/model';
import { parseUniqueModelId } from '@shared/data/types/model';

export const isReasoningModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.REASONING) || model.reasoning != null;

export const isVisionModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION) ||
  model.inputModalities?.includes(MODALITY.IMAGE) === true;

export const isVideoModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.VIDEO_RECOGNITION) ||
  model.inputModalities?.includes(MODALITY.VIDEO) === true;

export const isAudioModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.AUDIO_RECOGNITION) ||
  model.inputModalities?.includes(MODALITY.AUDIO) === true;

export const isWebSearchModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.WEB_SEARCH);

export const isFunctionCallingModel = (model: Model): boolean =>
  model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL);

export const isSupportedThinkingTokenModel = (model: Model): boolean =>
  model.reasoning?.thinkingTokenLimits != null;

export const isSupportedReasoningEffortModel = (model: Model): boolean =>
  (model.reasoning?.selectableEfforts?.length ?? 0) > 0;

export const getModelSupportedReasoningEffortOptions = (
  model: Model | undefined | null,
): string[] | undefined => model?.reasoning?.selectableEfforts;

export const getBaseModelName = (id: string, delimiter = '/'): string => {
  const parts = id.split(delimiter);
  return parts[parts.length - 1];
};

export const getLowerBaseModelName = (id: string, delimiter = '/'): string => {
  const normalizedId = id.toLowerCase().startsWith('accounts/fireworks/models/')
    ? id.replace(/(\d)p(?=\d)/g, '$1.')
    : id;

  let baseModelName = getBaseModelName(normalizedId, delimiter).toLowerCase();
  if (baseModelName.endsWith(':free')) baseModelName = baseModelName.replace(':free', '');
  if (baseModelName.endsWith('(free)')) baseModelName = baseModelName.replace('(free)', '');
  if (baseModelName.endsWith(':cloud')) baseModelName = baseModelName.replace(':cloud', '');
  return baseModelName;
};

/**
 * Derive the model-list group from an API model ID.
 *
 * Provider-prefixed IDs use the provider segment (`openai/gpt-4o` → `openai`);
 * flat IDs use their family prefix (`deepseek-v4-pro` → `deepseek`).
 */
export function deriveModelGroupName(modelId: string): string | undefined {
  const normalizedId = modelId.trim();
  const pathParts = normalizedId.split('/');
  if (pathParts.length > 1) {
    return pathParts[0]?.trim() || undefined;
  }

  const familyName = normalizedId.split('-')[0]?.trim();
  return familyName && familyName !== normalizedId ? familyName : undefined;
}

function getRawModelId(model: Model): string {
  return model.modelId ?? parseUniqueModelId(model.id).modelId;
}

const vendorCheck =
  (pattern: RegExp) =>
  (model: Model): boolean =>
    pattern.test(getLowerBaseModelName(getRawModelId(model), '/'));

export const isAnthropicModel = vendorCheck(VENDOR_PATTERNS.anthropic);
export const isGeminiModel = vendorCheck(VENDOR_PATTERNS.gemini);
export const isGrokModel = vendorCheck(VENDOR_PATTERNS.grok);
export const isOpenAIModel = vendorCheck(VENDOR_PATTERNS.openai);
export const isQwenModel = vendorCheck(VENDOR_PATTERNS.qwen);

export const isDeepSeekModel = (model?: Model): boolean => {
  if (!model) return false;
  if (VENDOR_PATTERNS.deepseek.test(getLowerBaseModelName(getRawModelId(model), '/'))) return true;
  if (model.providerId === 'deepseek') return true;
  return model.name ? VENDOR_PATTERNS.deepseek.test(model.name.toLowerCase()) : false;
};

export const isOpenAILLMModel = (model: Model): boolean =>
  isOpenAIModel(model) && !getLowerBaseModelName(getRawModelId(model)).includes('gpt-4o-image');

export const isOpenAIWebSearchChatCompletionOnlyModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('gpt-4o-search-preview') || id.includes('gpt-4o-mini-search-preview');
};

export const isOpenAIDeepResearchModel = (model: Model): boolean => {
  if (model.providerId !== 'openai' && model.providerId !== 'openai-chat') return false;
  return /deep[-_]?research/.test(getLowerBaseModelName(getRawModelId(model), '/'));
};

export const isGPT5FamilyModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5');

export const isGPT5SeriesModel = (model: Model): boolean =>
  /gpt-5(?!\.\d)/.test(getLowerBaseModelName(getRawModelId(model)));

export const isGPT51SeriesModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5.1');

export const isGPT52SeriesModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5.2');

export const isSupportVerbosityModel = isGPT5FamilyModel;

export const isSupportFlexServiceTierModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return (
    (id.includes('o3') && !id.includes('o3-mini')) || id.includes('o4-mini') || id.includes('gpt-5')
  );
};

export const isSupportedThinkingTokenClaudeModel = (model: Model): boolean =>
  isAnthropicModel(model) && isSupportedThinkingTokenModel(model);

export const isClaude4SeriesModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /claude-(sonnet|opus|haiku)-4(?:[.-]\d+)?(?:[@\-:][\w\-:]+)?$/i.test(id);
};

export const isClaude46SeriesModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /(?:anthropic\.)?claude-(?:opus|sonnet)-4[.-]6(?:[@\-:][\w\-:]+)?$/i.test(id);
};

export const isClaude47SeriesModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /(?:anthropic\.)?claude-opus-4[.-]7(?:[@\-:][\w\-:]+)?$/i.test(id);
};

export const isClaude45ReasoningModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /claude-(sonnet|opus|haiku)-4(-|.)5(?:-[\w-]+)?$/i.test(id);
};

export const isClaudeReasoningModel = (model: Model): boolean =>
  isAnthropicModel(model) && isReasoningModel(model);

/** Whether temperature and top_p are mutually exclusive for this model (Claude 4.5 reasoning). */
export const isTemperatureTopPMutuallyExclusiveModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /claude-(sonnet|opus|haiku)-4(-|.)5(?:-[\w-]+)?$/i.test(id);
};

export const isSupportTemperatureModel = (model: Model): boolean =>
  model.parameters?.temperature?.supported !== false;

export const isSupportTopPModel = (model: Model): boolean =>
  model.parameters?.topP?.supported !== false;

export const isMaxTemperatureOneModel = (model: Model): boolean => {
  const max = model.parameters?.temperature?.range?.max;
  if (max !== undefined) return max <= 1;
  const id = getLowerBaseModelName(getRawModelId(model));
  return (
    id.startsWith('claude') || id.includes('glm') || id.includes('kimi') || id.includes('moonshot')
  );
};

export const isGemini3Model = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('gemini-3') || id === 'gemini-flash-latest' || id === 'gemini-pro-latest';
};

export const isSupportedThinkingTokenQwenModel = (model: Model): boolean => {
  if (!isQwenModel(model)) return false;
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  if (
    ['coder', 'asr', 'tts', 'reranker', 'embedding', 'instruct', 'thinking'].some((f) =>
      id.includes(f),
    )
  ) {
    return false;
  }
  return isSupportedThinkingTokenModel(model);
};

export const isQwen35to39Model = (model: Model): boolean =>
  /^qwen3\.[5-9]/.test(getLowerBaseModelName(getRawModelId(model), '/'));

export const isOpenAIWebSearchModel = (model: Model): boolean =>
  isOpenAIModel(model) && isWebSearchModel(model);

export const isOpenRouterBuiltInWebSearchModel = (model: Model): boolean => {
  if (model.providerId !== 'openrouter') return false;
  const id = getLowerBaseModelName(getRawModelId(model));
  return isOpenAIWebSearchChatCompletionOnlyModel(model) || id.includes('sonar');
};

export const getModelSupportedVerbosity = (
  model: Model | undefined | null,
): (string | null | undefined)[] => {
  if (!model || !isSupportVerbosityModel(model)) return [undefined];

  const id = getLowerBaseModelName(getRawModelId(model));
  if (!isGPT5FamilyModel(model)) return [undefined];
  if (id.includes('chat')) return [undefined, null, 'medium'];

  if (id.includes('codex')) {
    if (isGPT5SeriesModel(model) || isGPT51SeriesModel(model) || isGPT52SeriesModel(model)) {
      return [undefined, null, 'medium'];
    }
    return [undefined, null, 'low', 'medium', 'high'];
  }

  if (id.includes('pro')) return [undefined, null, 'low', 'medium', 'high'];
  return [undefined, null, 'low', 'medium', 'high'];
};

export const GEMINI_FLASH_MODEL_REGEX = /gemini.*flash/i;
