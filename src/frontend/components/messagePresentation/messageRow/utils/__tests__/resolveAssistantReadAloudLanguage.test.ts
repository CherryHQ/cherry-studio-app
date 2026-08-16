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

  test.each(['東京大学', '这是回答'])('returns no hint for pure Han text %p', (text) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
  });

  test.each(['Bonjour', 'Hola', 'Answer'])('returns no hint for pure Latin text %p', (text) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
  });

  test.each(['这是 Answer', 'مرحبا', 'Привет', '🎉 123 !?'])(
    'returns no hint for unsupported or ambiguous text %p',
    (text) => {
      expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
    },
  );
});
