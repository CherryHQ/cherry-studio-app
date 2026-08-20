import { PersistedLangCodeSchema } from '@cherrystudio/universal/data/preference/preferenceTypes';

import { projectAssistantMessageReadAloud } from '../projectAssistantMessageReadAloud';
import { resolveAssistantReadAloudLanguage } from '../resolveAssistantReadAloudLanguage';

describe('resolveAssistantReadAloudLanguage', () => {
  test.each([
    ['こんにちは', 'en-GB'],
    ['', 'fr-FR'],
  ])('returns the explicit language unchanged for %p', (text, explicitLanguage) => {
    expect(resolveAssistantReadAloudLanguage(text, explicitLanguage)).toBe(explicitLanguage);
  });

  test.each([
    ['한국어 테스트', 'ko-KR'],
    ['日本語テスト', 'ja-JP'],
  ])('prefers a unique Hangul or kana signal for %p', (text, expectedLanguage) => {
    expect(resolveAssistantReadAloudLanguage(text)).toBe(expectedLanguage);
  });

  test.each([
    'は',
    '한',
    'The Japanese particle は is pronounced "wa".',
    '这款游戏叫做ドラゴンクエスト,很有名。',
    '한국어 test 中文',
    '日本語テスト abc',
  ])(
    'requires at least two unique-script characters covering half of the letters in %p',
    (text) => {
      expect(resolveAssistantReadAloudLanguage(text)).toBeUndefined();
    },
  );

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

  test('keeps a persisted lowercase translation language through projection and detection', () => {
    const targetLanguage = PersistedLangCodeSchema.parse('ja');
    const projection = projectAssistantMessageReadAloud({
      data: {
        parts: [
          { text: 'Original answer', type: 'text' },
          {
            data: { content: 'こんにちは', targetLanguage },
            type: 'data-translation',
          },
        ],
      },
      id: '00000000-0000-7000-8000-000000000010',
      role: 'assistant',
      status: 'success',
    });

    expect(projection).toEqual({ language: 'ja', text: 'こんにちは' });
    expect(resolveAssistantReadAloudLanguage(projection?.text ?? '', projection?.language)).toBe(
      'ja',
    );
  });
});
