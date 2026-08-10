/** AiHubMix per-model routing shared by the runtime factory and request endpoint resolver. */
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';

export type AihubmixChatFamily =
  | 'anthropic'
  | 'gemini'
  | 'openai-responses'
  | 'openai-chat'
  | 'compat';

// AiHubMix dispatches on bare API ids. Shared model helpers expect a UniqueModelId and throw for
// bare ids, so these routing predicates deliberately stay string-based at this provider boundary.
const isOpenAiLlm = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  return /\bgpt\b|^o[134]/.test(id) && !id.includes('gpt-4o-image');
};

const isOpenAiChatCompletionOnly = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  return (
    id.includes('gpt-4o-search-preview') ||
    id.includes('gpt-4o-mini-search-preview') ||
    id.includes('o1-mini') ||
    id.includes('o1-preview')
  );
};

export function resolveAihubmixChatFamily(modelId: string): AihubmixChatFamily {
  if (modelId.startsWith('claude')) return 'anthropic';
  if (
    (modelId.startsWith('gemini') || modelId.startsWith('imagen')) &&
    !modelId.endsWith('no-think') &&
    !modelId.endsWith('-search') &&
    !modelId.includes('embedding')
  ) {
    return 'gemini';
  }
  if (isOpenAiLlm(modelId)) {
    return isOpenAiChatCompletionOnly(modelId) ? 'openai-chat' : 'openai-responses';
  }
  return 'compat';
}

const familyEndpoint: Record<AihubmixChatFamily, EndpointType> = {
  anthropic: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  gemini: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  'openai-responses': ENDPOINT_TYPE.OPENAI_RESPONSES,
  'openai-chat': ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  compat: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
};

const familyProviderOptionsKey: Record<AihubmixChatFamily, string> = {
  anthropic: 'anthropic',
  gemini: 'google',
  'openai-responses': 'openai',
  'openai-chat': 'openai',
  compat: 'aihubmix',
};

export interface AihubmixChatRoute {
  endpointType: EndpointType;
  providerOptionsKey: string;
}

export function resolveAihubmixChatRoute(modelId: string): AihubmixChatRoute {
  const family = resolveAihubmixChatFamily(modelId);
  return {
    endpointType: familyEndpoint[family],
    providerOptionsKey: familyProviderOptionsKey[family],
  };
}
