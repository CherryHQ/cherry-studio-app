import {
  ENDPOINT_TYPE,
  type EndpointType,
  type Model,
} from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { resolveVoiceCapabilities, type VoiceOperation } from './voiceCapabilities';
import { getAihubmixVoiceModelMetadata } from './voiceModelMetadata';

/** Account route used by OpenAI-compatible speech and transcription operations. */
export function resolveVoiceEndpoint(
  provider: Provider,
  model?: Pick<Model, 'modelId' | 'apiModelId'>,
  operation?: VoiceOperation,
): EndpointType | undefined {
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
    if (
      model &&
      operation &&
      !resolveVoiceCapabilities(config?.adapterFamily, model.apiModelId ?? model.modelId, operation)
    )
      return false;
    if (
      config?.adapterFamily === 'aihubmix' &&
      model &&
      !getAihubmixVoiceModelMetadata(model.apiModelId ?? model.modelId)
    )
      return false;
    return (
      Boolean(config?.baseUrl?.trim()) &&
      (config?.adapterFamily === 'openai' ||
        config?.adapterFamily === 'openai-compatible' ||
        config?.adapterFamily === 'aihubmix')
    );
  });
}
