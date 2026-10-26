import type { SpeechModelOptions } from '@/shared/contracts/voice';

/** A model change preserves only a voice the new model explicitly supports; empty is automatic. */
export function voiceAfterModelChange(voice: string, options: SpeechModelOptions): string {
  return options.voices.some((option) => option.id === voice) ? voice : '';
}
