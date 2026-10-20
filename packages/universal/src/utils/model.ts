import { MODALITY, VENDOR_PATTERNS } from '@cherrystudio/provider-registry';
import type { Model } from '@shared/data/types/model';
import { MODEL_CAPABILITY, parseUniqueModelId } from '@shared/data/types/model';

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

export const isGeminiModel = vendorCheck(VENDOR_PATTERNS.gemini);
export const isGrokModel = vendorCheck(VENDOR_PATTERNS.grok);
export const isOpenAIModel = vendorCheck(VENDOR_PATTERNS.openai);

export const isDeepSeekModel = (model?: Model): boolean => {
  if (!model) return false;
  if (VENDOR_PATTERNS.deepseek.test(getLowerBaseModelName(getRawModelId(model), '/'))) return true;
  if (model.providerId === 'deepseek') return true;
  return model.name ? VENDOR_PATTERNS.deepseek.test(model.name.toLowerCase()) : false;
};

export const isOpenAILLMModel = (model: Model): boolean =>
  isOpenAIModel(model) && !getLowerBaseModelName(getRawModelId(model)).includes('gpt-4o-image');

const isOpenAIWebSearchChatCompletionOnlyModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('gpt-4o-search-preview') || id.includes('gpt-4o-mini-search-preview');
};

export const isClaude47SeriesModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return /(?:anthropic\.)?claude-opus-4[.-]7(?:[@\-:][\w\-:]+)?$/i.test(id);
};

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

export const isOpenAIWebSearchModel = (model: Model): boolean =>
  isOpenAIModel(model) && isWebSearchModel(model);

export const isOpenRouterBuiltInWebSearchModel = (model: Model): boolean => {
  if (model.providerId !== 'openrouter') return false;
  const id = getLowerBaseModelName(getRawModelId(model));
  return isOpenAIWebSearchChatCompletionOnlyModel(model) || id.includes('sonar');
};

export const GEMINI_FLASH_MODEL_REGEX = /gemini.*flash/i;
