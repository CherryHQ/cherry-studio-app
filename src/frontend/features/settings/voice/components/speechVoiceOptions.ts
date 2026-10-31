import type { SpeechVoice } from '@/shared/contracts/voice';

/** Preserve named voices, and distinguish names shared by different native voice IDs. */
export function speechVoiceOptions(voices: readonly SpeechVoice[]) {
  const counts = new Map<string, number>();
  for (const voice of voices) counts.set(voice.name, (counts.get(voice.name) ?? 0) + 1);
  return voices.map((voice) => ({
    value: voice.id,
    label: voice.name,
    description:
      (counts.get(voice.name) ?? 0) > 1
        ? [voice.language, voice.id].filter(Boolean).join(' · ')
        : undefined,
  }));
}
