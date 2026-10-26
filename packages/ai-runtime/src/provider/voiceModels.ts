import { createOpenAI, type OpenAIProviderSettings } from '@ai-sdk/openai';
import type { SpeechModelV3, TranscriptionModelV3 } from '@ai-sdk/provider';

import { createAihubmix } from './custom/aihubmix/aihubmixProvider';
import type { VoiceAdapterFamily } from './voiceCapabilities';

type VoiceModelConfig = {
  adapterFamily: VoiceAdapterFamily;
  modelId: string;
  settings: OpenAIProviderSettings;
};

export function resolveVoiceModel(config: VoiceModelConfig, operation: 'speech'): SpeechModelV3;
export function resolveVoiceModel(
  config: VoiceModelConfig,
  operation: 'transcription',
  mediaType?: string,
): TranscriptionModelV3;
export function resolveVoiceModel(
  config: VoiceModelConfig,
  operation: 'speech' | 'transcription',
  mediaType?: string,
): SpeechModelV3 | TranscriptionModelV3 {
  if (config.adapterFamily === 'aihubmix') {
    // The caller has already selected the audio base URL. Chat endpoint maps must not reroute it.
    const provider = createAihubmix({ ...config.settings, endpointBaseURLs: undefined });
    return operation === 'speech'
      ? provider.speechModel(config.modelId)
      : transcriptionWithMediaType(provider.transcriptionModel(config.modelId), mediaType);
  }
  // Generic compatible chat SDKs have no audio model. Share the OpenAI audio codec while
  // keeping model-specific capabilities separate from protocol compatibility.
  const provider = createOpenAI(config.settings);
  return operation === 'speech'
    ? provider.speech(config.modelId)
    : transcriptionWithMediaType(provider.transcription(config.modelId), mediaType);
}

/** The SDK sniffs M4A as WAV; the capture/file owner knows the actual container. */
function transcriptionWithMediaType(
  model: TranscriptionModelV3,
  mediaType?: string,
): TranscriptionModelV3 {
  if (!mediaType) return model;
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    doGenerate: (options) => model.doGenerate({ ...options, mediaType }),
  };
}
