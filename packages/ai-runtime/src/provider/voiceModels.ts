import { createOpenAI, type OpenAIProviderSettings } from '@ai-sdk/openai';
import type { SpeechModelV3, TranscriptionModelV3 } from '@ai-sdk/provider';

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
