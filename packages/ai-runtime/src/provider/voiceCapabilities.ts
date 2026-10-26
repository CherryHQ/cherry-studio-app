export type VoiceOperation = 'speech' | 'transcription';
export type VoiceAdapterFamily = 'openai' | 'openai-compatible' | 'aihubmix';

export type SpeechCapabilities = {
  operation: 'speech';
  /** Absent for custom models whose provider has not declared a default. */
  defaultVoice?: string;
  voices: readonly string[];
  acceptsCustomVoice: boolean;
  maxInputCharacters: number;
  /** The one-shot ai-core speech port currently negotiates WAV. */
  outputMediaType: 'audio/wav';
};

export type VoiceCapabilities = SpeechCapabilities | { operation: 'transcription' };

const OPENAI_TTS_VOICES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'] as const;
const OPENAI_MINI_TTS_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const;
const GEMINI_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const;

function speech(voices: readonly string[], defaultVoice?: string): SpeechCapabilities {
  return {
    operation: 'speech',
    voices,
    defaultVoice,
    acceptsCustomVoice: voices.length === 0,
    maxInputCharacters: 4096,
    outputMediaType: 'audio/wav',
  };
}

/** Known model facts are shared by discovery, settings, admission and request execution. */
export function getOpenAIVoiceCapabilities(modelId: string): VoiceCapabilities | undefined {
  const id = modelId.replace(/^openai\//, '');
  if (/^tts-1(?:-hd)?(?:-\d{4})?$/.test(id)) return speech(OPENAI_TTS_VOICES, 'alloy');
  if (/^gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
    return speech(OPENAI_MINI_TTS_VOICES, 'alloy');
  if (/^(?:whisper-1|gpt-4o(?:-mini)?-transcribe(?:-\d{4}-\d{2}-\d{2})?)$/.test(id))
    return { operation: 'transcription' };
  return undefined;
}

export function getAihubmixVoiceCapabilities(modelId: string): VoiceCapabilities | undefined {
  const openai = getOpenAIVoiceCapabilities(modelId);
  if (openai) return openai;
  // https://docs.aihubmix.com/cn/api/TTS — native Gemini IDs are case-sensitive. Do not rely
  // on the gateway's OpenAI voice aliases; some routes reject them instead of mapping them.
  if (/^gemini-2\.5-(?:flash|pro)-preview-tts$/.test(modelId)) return speech(GEMINI_VOICES, 'Kore');
  if (/^(?:whisper-large-v3(?:-turbo)?|distil-whisper-large-v3-en)$/.test(modelId))
    return { operation: 'transcription' };
  return undefined;
}

/** Unknown compatible models retain custom voice support without an invented voice catalog. */
export function resolveVoiceCapabilities(
  family: string | undefined,
  modelId: string,
  operation: VoiceOperation,
): VoiceCapabilities | undefined {
  const known =
    family === 'aihubmix'
      ? getAihubmixVoiceCapabilities(modelId)
      : family === 'openai' || family === 'openai-compatible'
        ? getOpenAIVoiceCapabilities(modelId)
        : undefined;
  if (known) return known.operation === operation ? known : undefined;
  if (family === 'openai' || family === 'openai-compatible')
    return operation === 'speech' ? speech([]) : { operation };
  return undefined;
}

/** Empty means automatic. An explicit, unsupported identity must never be silently replaced. */
export function resolveSpeechVoice(
  capabilities: SpeechCapabilities,
  selected?: string,
): string | undefined {
  const voice = selected?.trim() || capabilities.defaultVoice;
  if (!voice) return undefined;
  return capabilities.acceptsCustomVoice || capabilities.voices.includes(voice) ? voice : undefined;
}
