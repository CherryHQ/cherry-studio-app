import { type Model, MODEL_CAPABILITY } from '@cherrystudio/universal/data/types/model';

import {
  getAihubmixVoiceCapabilities,
  getOpenAIVoiceCapabilities,
  type VoiceCapabilities,
} from './voiceCapabilities';

function speechMetadata(): Partial<Model> {
  return {
    capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
    inputModalities: ['text'],
    outputModalities: ['audio'],
  };
}

function transcriptionMetadata(): Partial<Model> {
  return {
    capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT],
    inputModalities: ['audio'],
    outputModalities: ['text'],
  };
}

/** /models often omits modalities for the dedicated OpenAI audio APIs. */
export function getOpenAIVoiceModelMetadata(modelId: string): Partial<Model> | undefined {
  return metadata(getOpenAIVoiceCapabilities(modelId));
}

/** Models served by AiHubMix's binary speech / JSON transcription audio APIs. */
export function getAihubmixVoiceModelMetadata(modelId: string): Partial<Model> | undefined {
  return metadata(getAihubmixVoiceCapabilities(modelId));
}

function metadata(capabilities: VoiceCapabilities | undefined): Partial<Model> | undefined {
  if (!capabilities) return undefined;
  return capabilities.operation === 'speech' ? speechMetadata() : transcriptionMetadata();
}
