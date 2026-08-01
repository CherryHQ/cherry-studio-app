import { MODALITY, MODEL_CAPABILITY, VENDOR_PATTERNS } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';

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
export const isMiMoModel = vendorCheck(VENDOR_PATTERNS.mimo);
export const isMistralModel = vendorCheck(VENDOR_PATTERNS.mistral);

export const isDoubaoModel = (model: Model): boolean =>
  VENDOR_PATTERNS.doubao.test(getLowerBaseModelName(getRawModelId(model), '/')) ||
  model.providerId === 'doubao';

export const isHunyuanModel = (model: Model): boolean =>
  VENDOR_PATTERNS.hunyuan.test(getLowerBaseModelName(getRawModelId(model), '/')) ||
  model.providerId === 'hunyuan';

export const isKimiModel = (model: Model): boolean =>
  VENDOR_PATTERNS.kimi.test(getLowerBaseModelName(getRawModelId(model), '/')) ||
  model.providerId === 'moonshot';

export const isZhipuModel = (model: Model): boolean =>
  VENDOR_PATTERNS.zhipu.test(getLowerBaseModelName(getRawModelId(model))) ||
  model.providerId === 'zhipu';

export const isOpenAILLMModel = (model: Model): boolean =>
  isOpenAIModel(model) && !getLowerBaseModelName(getRawModelId(model)).includes('gpt-4o-image');

export const isOpenAIReasoningModel = (model: Model): boolean =>
  isOpenAIModel(model) && isReasoningModel(model);

export const isOpenAIWebSearchChatCompletionOnlyModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('gpt-4o-search-preview') || id.includes('gpt-4o-mini-search-preview');
};

export const isOpenAIChatCompletionOnlyModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return (
    isOpenAIWebSearchChatCompletionOnlyModel(model) ||
    id.includes('o1-mini') ||
    id.includes('o1-preview')
  );
};

export const isOpenAIDeepResearchModel = (model: Model): boolean => {
  if (model.providerId !== 'openai' && model.providerId !== 'openai-chat') return false;
  return /deep[-_]?research/.test(getLowerBaseModelName(getRawModelId(model), '/'));
};

export const isSupportedReasoningEffortOpenAIModel = (model: Model): boolean =>
  isOpenAIModel(model) && isSupportedReasoningEffortModel(model);

export const isGPT5FamilyModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5');

export const isGPT5SeriesModel = (model: Model): boolean =>
  /gpt-5(?!\.\d)/.test(getLowerBaseModelName(getRawModelId(model)));

export const isGPT51SeriesModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5.1');

export const isGPT52SeriesModel = (model: Model): boolean =>
  getLowerBaseModelName(getRawModelId(model)).includes('gpt-5.2');

export const isSupportVerbosityModel = isGPT5FamilyModel;

export const isSupportNoneReasoningEffortModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  const isCodex = id.includes('codex');
  const isOldCodex = isCodex && (isGPT51SeriesModel(model) || isGPT52SeriesModel(model));
  return (
    isGPT5FamilyModel(model) &&
    !isGPT5SeriesModel(model) &&
    !id.includes('chat') &&
    !id.includes('pro') &&
    !isOldCodex
  );
};

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

export const isHostedGemma4ThinkingModel = (model: Model): boolean => {
  if (model.providerId !== 'gemini') return false;
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return id.startsWith('gemma-4-');
};

export const isGemini3Model = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('gemini-3') || id === 'gemini-flash-latest' || id === 'gemini-pro-latest';
};

export const isGemini3ThinkingTokenModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return isGemini3Model(model) && !id.includes('image');
};

export const isSupportedThinkingTokenGeminiModel = (model: Model): boolean =>
  (isGeminiModel(model) || isHostedGemma4ThinkingModel(model)) &&
  isSupportedThinkingTokenModel(model);

export const isSupportedReasoningEffortGrokModel = (model: Model): boolean => {
  if (isGrokModel(model) && isSupportedReasoningEffortModel(model)) return true;
  if (model.providerId === 'openrouter') {
    return getLowerBaseModelName(getRawModelId(model)).includes('grok-4-fast');
  }
  return false;
};

export const isGrok4FastReasoningModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return id.includes('grok-4-fast') && !id.includes('non-reasoning');
};

export const isQwenReasoningModel = (model: Model): boolean =>
  isQwenModel(model) && isReasoningModel(model);

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

export const isQwenAlwaysThinkModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model), '/');
  return (
    (id.startsWith('qwen3') && id.includes('thinking')) ||
    (id.includes('qwen3-vl') && id.includes('thinking'))
  );
};

export const isQwen35to39Model = (model: Model): boolean =>
  /^qwen3\.[5-9]/.test(getLowerBaseModelName(getRawModelId(model), '/'));

export const DOUBAO_THINKING_AUTO_MODEL_REGEX =
  /doubao-(1-5-thinking-pro-m|seed-1[.-]6)(?!-(?:flash|thinking)(?:-|$))(?:-lite)?(?!-251015)(?:-\d+)?$/i;

export const isDoubaoThinkingAutoModel = (model: Model): boolean =>
  DOUBAO_THINKING_AUTO_MODEL_REGEX.test(getLowerBaseModelName(getRawModelId(model)));

export const isDoubaoSeedAfter251015 = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return /doubao-seed-1-6-(?:lite-)?251015|doubao-seed-2[.-]0/i.test(id);
};

export const isDoubaoSeed18Model = (model: Model): boolean =>
  /doubao-seed-1[.-]8(?:-[\w-]+)?/i.test(getLowerBaseModelName(getRawModelId(model)));

export const isSupportedThinkingTokenDoubaoModel = (model: Model): boolean =>
  isDoubaoModel(model) && isSupportedThinkingTokenModel(model);

export const isSupportedThinkingTokenHunyuanModel = (model: Model): boolean =>
  isHunyuanModel(model) && isSupportedThinkingTokenModel(model);

export const isSupportedThinkingTokenZhipuModel = (model: Model): boolean =>
  isZhipuModel(model) && isSupportedThinkingTokenModel(model);

export const isSupportedThinkingTokenMiMoModel = (model: Model): boolean =>
  isMiMoModel(model) && isSupportedThinkingTokenModel(model);

export const isSupportedThinkingTokenKimiModel = (model: Model): boolean =>
  isKimiModel(model) && isSupportedThinkingTokenModel(model);

const isDeepSeekV4PlusId = (id: string): boolean =>
  /deepseek-v(?:[4-9]\d*|[1-9]\d{1,})(?:\.\d+)?(?:-[\w]+)*(?=$|[:/])/i.test(id);

export const isDeepSeekV4PlusModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  const name = getLowerBaseModelName(model.name ?? '');
  return isDeepSeekV4PlusId(id) || isDeepSeekV4PlusId(name);
};

export const isDeepSeekHybridInferenceModel = (model: Model): boolean => {
  const id = getLowerBaseModelName(getRawModelId(model));
  return (
    /(\w+-)?deepseek-v3(?:\.\d|-\d)(?:(\.|-)(?!speciale$)\w+)?$/.test(id) ||
    id.includes('deepseek-chat-v3.1') ||
    id.includes('deepseek-chat') ||
    isDeepSeekV4PlusModel(model)
  );
};

export const isOpenAIWebSearchModel = (model: Model): boolean =>
  isOpenAIModel(model) && isWebSearchModel(model);

export const isOpenRouterBuiltInWebSearchModel = (model: Model): boolean =>
  model.providerId === 'openrouter' &&
  (isOpenAIWebSearchModel(model) || model.modelId.toLowerCase().includes('sonar'));

/**
 * Models whose provider-native web search stays on regardless of the assistant
 * toggle or a configured external search provider (mirrors desktop). Single
 * source of truth: the "force native" gate and the capability resolution must
 * agree, or a model can end up with neither native nor external search.
 */
export const isForcedNativeWebSearchModel = (model: Model): boolean =>
  isOpenRouterBuiltInWebSearchModel(model) || model.id.toLowerCase().includes('sonar');

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

const THINKING_TOKEN_MAP: Record<string, { min: number; max: number }> = {
  'gemini-2\\.5-flash-lite.*$': { min: 512, max: 24576 },
  'gemini-flash-lite-latest$': { min: 512, max: 24576 },
  'gemini-flash-latest$': { min: 0, max: 24576 },
  'gemini-pro-latest$': { min: 128, max: 32768 },
  'gemini-.*-flash.*$': { min: 0, max: 24576 },
  'gemini-.*-pro.*$': { min: 128, max: 32768 },
  'qwen3-235b-a22b-thinking-2507$': { min: 0, max: 81920 },
  'qwen3-30b-a3b-thinking-2507$': { min: 0, max: 81920 },
  'qwen3-vl-235b-a22b-thinking$': { min: 0, max: 81920 },
  'qwen3-vl-30b-a3b-thinking$': { min: 0, max: 81920 },
  'qwen-plus-2025-07-14$': { min: 0, max: 38912 },
  'qwen-plus-2025-04-28$': { min: 0, max: 38912 },
  'qwen3-1\\.7b$': { min: 0, max: 30720 },
  'qwen3-0\\.6b$': { min: 0, max: 30720 },
  'qwen-plus.*$': { min: 0, max: 81920 },
  'qwen-turbo.*$': { min: 0, max: 38912 },
  'qwen-flash.*$': { min: 0, max: 81920 },
  'qwen3-max(-.*)?$': { min: 0, max: 81920 },
  'qwen-max-latest$': { min: 0, max: 81920 },
  '^qwen3\\.[5-9]': { min: 0, max: 81920 },
  'qwen3-(?!max).*$': { min: 1024, max: 38912 },
  '(?:anthropic\\.)?claude-opus-4[.-]7(?:[@\\-:][\\w\\-:]+)?$': { min: 1024, max: 128000 },
  '(?:anthropic\\.)?claude-opus-4[.-]6(?:[@\\-:][\\w\\-:]+)?$': { min: 1024, max: 128000 },
  '(?:anthropic\\.)?claude-(:?sonnet|haiku)-4[.-]6.*(?:-v\\d+:\\d+)?$': { min: 1024, max: 64000 },
  '(?:anthropic\\.)?claude-(:?haiku|sonnet|opus)-4[.-]5.*(?:-v\\d+:\\d+)?$': {
    min: 1024,
    max: 64000,
  },
  '(?:anthropic\\.)?claude-opus-4[.-]1.*(?:-v\\d+:\\d+)?$': { min: 1024, max: 32000 },
  '(?:anthropic\\.)?claude-sonnet-4(?:[.-]0)?(?:[@-](?:\\d{4,}|[a-z][\\w-]*))?(?:-v\\d+:\\d+)?$': {
    min: 1024,
    max: 64000,
  },
  '(?:anthropic\\.)?claude-opus-4(?:[.-]0)?(?:[@-](?:\\d{4,}|[a-z][\\w-]*))?(?:-v\\d+:\\d+)?$': {
    min: 1024,
    max: 32000,
  },
  '(?:anthropic\\.)?claude-3[.-]7.*sonnet.*(?:-v\\d+:\\d+)?$': { min: 1024, max: 64000 },
  'baichuan-m2$': { min: 0, max: 30000 },
  'baichuan-m3$': { min: 0, max: 30000 },
  'gemma-?4[:-]?e[24]b': { min: 1024, max: 8192 },
  'gemma-?4[:-]?26b': { min: 1024, max: 30720 },
  'gemma-?4[:-]?31b': { min: 1024, max: 30720 },
  'hunyuan-a13b': { min: 0, max: 30720 },
  'glm-?5|glm-4\\.[567]': { min: 0, max: 30720 },
  'mimo-v2\\.5(?:-pro)?(?!-)': { min: 0, max: 30720 },
  'mimo-v2-(?:flash|pro|omni)': { min: 0, max: 30720 },
  'kimi-k(?:2\\.[5-9]\\d*|[3-9]\\d*(?:\\.\\d+)?)': { min: 0, max: 30720 },
  'doubao-(?:1[.-]5-thinking-vision-pro|1[.-]5-thinking-pro-m|seed-1[.-][68](?:-flash)?(?!-thinking(?:-|$))|seed-code(?:-preview)?(?:-\\d+)?|seed-2[.-]0(?:-[\\w-]+)?)(?:-[\\w-]+)*':
    {
      min: 0,
      max: 30720,
    },
};

export const findTokenLimit = (rawModelId: string): { min: number; max: number } | undefined => {
  for (const [pattern, limits] of Object.entries(THINKING_TOKEN_MAP)) {
    if (new RegExp(pattern, 'i').test(rawModelId)) {
      return limits;
    }
  }
  return undefined;
};
