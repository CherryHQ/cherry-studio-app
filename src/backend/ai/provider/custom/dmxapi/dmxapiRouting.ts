import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';

export type DmxapiChatFamily = 'openai-compat' | 'openai' | 'anthropic' | 'gemini';

const CHAT_FAMILY_TABLE: Array<{
  family: Exclude<DmxapiChatFamily, 'openai-compat'>;
  match: (modelId: string) => boolean;
}> = [
  { family: 'anthropic', match: (id) => /claude/i.test(id) },
  {
    family: 'gemini',
    match: (id) => /^gemini-/i.test(id) && !/(image|imagen|tts|audio|embedding)/i.test(id),
  },
  {
    family: 'openai',
    match: (id) => /^(gpt-|o\d)/i.test(id) && !/(image|dall-e)/i.test(id),
  },
];

export function resolveDmxapiChatFamily(modelId: string): DmxapiChatFamily {
  return CHAT_FAMILY_TABLE.find((entry) => entry.match(modelId))?.family ?? 'openai-compat';
}

const FAMILY_ENDPOINT: Record<DmxapiChatFamily, EndpointType> = {
  anthropic: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  gemini: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  openai: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  'openai-compat': ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
};

const FAMILY_PROVIDER_OPTIONS_KEY: Record<DmxapiChatFamily, string> = {
  anthropic: 'anthropic',
  gemini: 'google',
  openai: 'openai',
  'openai-compat': 'dmxapi',
};

export interface DmxapiChatRoute {
  endpointType: EndpointType;
  providerOptionsKey: string;
}

export function resolveDmxapiChatRoute(modelId: string): DmxapiChatRoute {
  const family = resolveDmxapiChatFamily(modelId);
  return {
    endpointType: FAMILY_ENDPOINT[family],
    providerOptionsKey: FAMILY_PROVIDER_OPTIONS_KEY[family],
  };
}
