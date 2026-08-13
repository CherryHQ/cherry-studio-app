import { resolveAssistantReadAloudLanguage } from '../resolveAssistantReadAloudLanguage';

describe('resolveAssistantReadAloudLanguage', () => {
  test.each([
    ['こんにちは', 'en-GB'],
    ['', 'fr-FR'],
  ])('returns the explicit language unchanged for %p', (text, explicitLanguage) => {
    expect(resolveAssistantReadAloudLanguage(text, explicitLanguage)).toBe(explicitLanguage);
  });

  test.each([
    ['한국어 test 中文', 'ko-KR'],
    ['日本語テスト abc', 'ja-JP'],
  ])('prefers a unique Hangul or kana signal for %p', (text, expectedLanguage) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBe(expectedLanguage);
  });

  test('returns no hint when both Hangul and kana are present', () => {
    expect(resolveAssistantReadAloudLanguage('한글かな')).toBeUndefined();
  });

  test('classifies short Han text but not short Latin text', () => {
    expect(resolveAssistantReadAloudLanguage('中文')).toBe('zh-CN');
    expect(resolveAssistantReadAloudLanguage('abc')).toBeUndefined();
  });

  test.each([
    ['中文内ab', 'zh-CN'],
    ['abcdef中文内容', 'en-US'],
  ])('includes the exact 60%% boundary for %p', (text, expectedLanguage) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBe(expectedLanguage);
  });

  test.each(['中文内abc', 'abcd中文内'])(
    'returns no hint just below a 60%% boundary for %p',
    (text) => {
      expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
    },
  );

  test('ignores punctuation, digits, whitespace, and emoji', () => {
    expect(resolveAssistantReadAloudLanguage('中1🎉!文\n?内 a-b')).toBe('zh-CN');
    expect(resolveAssistantReadAloudLanguage('a1🎉!b2 c3-d4_e5.f6 中文内容')).toBe('en-US');
  });

  test.each(['مرحبا', 'Привет', '🎉 123 !?'])('returns no hint for unsupported text %p', (text) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
  });

  test('documents the pure-Han Japanese limitation', () => {
    expect(resolveAssistantReadAloudLanguage('東京大学')).toBe('zh-CN');
  });
});
