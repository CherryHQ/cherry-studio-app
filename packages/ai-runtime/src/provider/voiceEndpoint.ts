import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

/** Account route used by OpenAI-compatible speech and transcription operations. */
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
      Boolean(config?.baseUrl?.trim()) &&
      (config?.adapterFamily === 'openai' || config?.adapterFamily === 'openai-compatible')
    );
  });
}
