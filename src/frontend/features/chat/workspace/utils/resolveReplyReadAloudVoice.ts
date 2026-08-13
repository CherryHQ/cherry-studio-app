import { type Voice, VoiceQuality } from 'expo-speech';

function normalizeLanguage(language: string) {
  return language.trim().replaceAll('_', '-').toLowerCase();
}

export function resolveReplyReadAloudVoice(
  requestedLanguage: string,
  voices: readonly Voice[],
): Voice | undefined {
  const normalizedRequestedLanguage = normalizeLanguage(requestedLanguage);
  const requestedBaseLanguage = normalizedRequestedLanguage.split('-')[0];

  return voices
    .filter((voice) => normalizeLanguage(voice.language).split('-')[0] === requestedBaseLanguage)
    .sort((left, right) => {
      const leftLanguage = normalizeLanguage(left.language);
      const rightLanguage = normalizeLanguage(right.language);
      const exactDifference =
        Number(rightLanguage === normalizedRequestedLanguage) -
        Number(leftLanguage === normalizedRequestedLanguage);
      if (exactDifference !== 0) {
        return exactDifference;
      }

      const qualityDifference =
        Number(right.quality === VoiceQuality.Enhanced) -
        Number(left.quality === VoiceQuality.Enhanced);
      if (qualityDifference !== 0) {
        return qualityDifference;
      }

      if (left.identifier < right.identifier) {
        return -1;
      }
      if (left.identifier > right.identifier) {
        return 1;
      }
      return 0;
    })[0];
}
