import { type Voice, VoiceQuality } from 'expo-speech';

import { resolveReplyReadAloudVoice } from '../resolveReplyReadAloudVoice';

function voice(
  identifier: string,
  language: string,
  quality: VoiceQuality = VoiceQuality.Default,
): Voice {
  return {
    identifier,
    language,
    name: identifier,
    quality,
  };
}

describe('resolveReplyReadAloudVoice', () => {
  it('normalizes case, whitespace, and every underscore in requested and candidate locales', () => {
    const matchingVoice = voice('matching', 'ZH_hans_CN');

    expect(resolveReplyReadAloudVoice(' zh_HANS_cn ', [matchingVoice])).toBe(matchingVoice);
  });

  it('prefers an exact locale over another locale with the same base language', () => {
    const otherLocale = voice('enhanced-other-locale', 'zh-TW', VoiceQuality.Enhanced);
    const exactLocale = voice('default-exact-locale', 'zh-CN');

    expect(resolveReplyReadAloudVoice('zh-CN', [otherLocale, exactLocale])).toBe(exactLocale);
  });

  it('prefers Enhanced quality within the exact-locale tier', () => {
    const defaultVoice = voice('default', 'ja-JP');
    const enhancedVoice = voice('enhanced', 'ja-JP', VoiceQuality.Enhanced);

    expect(resolveReplyReadAloudVoice('ja-JP', [defaultVoice, enhancedVoice])).toBe(enhancedVoice);
  });

  it('prefers Enhanced quality within the same-base fallback tier', () => {
    const defaultVoice = voice('default', 'ko-KR');
    const enhancedVoice = voice('enhanced', 'ko-KP', VoiceQuality.Enhanced);

    expect(resolveReplyReadAloudVoice('ko', [defaultVoice, enhancedVoice])).toBe(enhancedVoice);
  });

  it('uses direct identifier ordering deterministically independent of input order', () => {
    const laterVoice = voice('voice-b', 'fr-FR', VoiceQuality.Enhanced);
    const earlierVoice = voice('voice-A', 'fr-FR', VoiceQuality.Enhanced);

    expect(resolveReplyReadAloudVoice('fr-FR', [laterVoice, earlierVoice])).toBe(earlierVoice);
    expect(resolveReplyReadAloudVoice('fr-FR', [earlierVoice, laterVoice])).toBe(earlierVoice);
  });

  it('falls back to another locale with the same base language', () => {
    const baseFallback = voice('portuguese-voice', 'pt-PT');

    expect(resolveReplyReadAloudVoice('pt-BR', [baseFallback])).toBe(baseFallback);
  });

  it('returns undefined instead of falling back to English or a different base language', () => {
    expect(
      resolveReplyReadAloudVoice('de-DE', [
        voice('english-default', 'en-US', VoiceQuality.Enhanced),
        voice('french-first', 'fr-FR', VoiceQuality.Enhanced),
      ]),
    ).toBeUndefined();
  });

  it('returns undefined for an empty voice list', () => {
    expect(resolveReplyReadAloudVoice('en-US', [])).toBeUndefined();
  });

  it('does not mutate the input voice list', () => {
    const voices = [voice('voice-b', 'en-US'), voice('voice-a', 'en-US', VoiceQuality.Enhanced)];
    const originalOrder = [...voices];

    resolveReplyReadAloudVoice('en-US', voices);

    expect(voices).toEqual(originalOrder);
  });
});
