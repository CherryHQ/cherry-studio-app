import { type Model, MODEL_CAPABILITY } from '@cherrystudio/universal/data/types/model';

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
  const id = modelId.replace(/^openai\//, '');
  // https://developers.openai.com/api/reference/typescript/resources/audio
  if (/^(?:tts-1(?:-hd)?(?:-\d{4})?|gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?)$/.test(id)) {
    return speechMetadata();
  }
  if (/^(?:whisper-1|gpt-4o(?:-mini)?-transcribe(?:-\d{4}-\d{2}-\d{2})?)$/.test(id)) {
    return transcriptionMetadata();
  }
  return undefined;
}

/** Models served by AiHubMix's binary speech / JSON transcription audio APIs. */
export function getAihubmixVoiceModelMetadata(modelId: string): Partial<Model> | undefined {
  const openai = getOpenAIVoiceModelMetadata(modelId);
  if (openai) return openai;
  // https://docs.aihubmix.com/cn/api/TTS — includes OpenAI-to-Gemini voice mapping.
  if (/^gemini-2\.5-(?:flash|pro)-preview-tts$/.test(modelId)) return speechMetadata();
  // https://docs.aihubmix.com/cn/api/STT
  if (/^(?:whisper-large-v3(?:-turbo)?|distil-whisper-large-v3-en)$/.test(modelId)) {
    return transcriptionMetadata();
  }
  return undefined;
}
