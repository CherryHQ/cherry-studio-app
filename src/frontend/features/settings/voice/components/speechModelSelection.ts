import type { SpeechModelOptions } from '@/shared/contracts/voice';

/**
 * A model change preserves a voice the new model supports: one in its catalog, or any ID when it
 * takes custom voices. Otherwise it returns to automatic (empty).
 */
export function voiceAfterModelChange(voice: string, options: SpeechModelOptions): string {
  return options.acceptsCustomVoice || options.voices.some((option) => option.id === voice)
    ? voice
    : '';
}
