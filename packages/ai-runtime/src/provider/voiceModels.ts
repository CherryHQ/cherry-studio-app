import { createOpenAI, type OpenAIProviderSettings } from '@ai-sdk/openai';
import type { SpeechModelV3, TranscriptionModelV3 } from '@ai-sdk/provider';
import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

/** These one-shot operations use OpenAI's audio protocol, independent of chat model selection. */
export function resolveVoiceEndpoint(provider: Provider): EndpointType | undefined {
  if (provider.authType !== 'api-key') return undefined;
  const endpoints = [
    provider.defaultChatEndpoint,
    ENDPOINT_TYPE.OPENAI_RESPONSES,
    ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ];
  return endpoints.find((type) => {
    if (type !== ENDPOINT_TYPE.OPENAI_RESPONSES && type !== ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS)
      return false;
    const config = provider.endpointConfigs?.[type];
    return (
      Boolean(config?.baseUrl) &&
      (config?.adapterFamily === 'openai' || config?.adapterFamily === 'openai-compatible')
    );
  });
}

type VoiceModelConfig = { modelId: string; settings: OpenAIProviderSettings };

export function resolveVoiceModel(config: VoiceModelConfig, operation: 'speech'): SpeechModelV3;
export function resolveVoiceModel(
  config: VoiceModelConfig,
  operation: 'transcription',
): TranscriptionModelV3;
export function resolveVoiceModel(
  config: VoiceModelConfig,
  operation: 'speech' | 'transcription',
): SpeechModelV3 | TranscriptionModelV3 {
  // The generic chat-compatible SDK has no audio models. OpenAI's audio adapter uses the
  // already-resolved account URL, headers, credential, and platform transport for both operations.
  const provider = createOpenAI(config.settings);
  return operation === 'speech'
    ? provider.speech(config.modelId)
    : provider.transcription(config.modelId);
}
