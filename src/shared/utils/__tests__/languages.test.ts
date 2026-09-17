import { resolveAppLanguage } from '../languages';

describe('app language resolution', () => {
  test('an explicit preference wins over device languages', () => {
    expect(resolveAppLanguage('ja-JP', ['zh-CN'])).toBe('ja-JP');
    expect(resolveAppLanguage('tr-TR', ['en-US'])).toBe('tr-TR');
  });

  test('system mode tries the preferred languages in order', () => {
    expect(resolveAppLanguage(null, ['ko-KR', 'fr-CA', 'de-DE'])).toBe('fr-FR');
    expect(resolveAppLanguage(null, ['en-GB', 'zh-TW'])).toBe('en-US');
    expect(resolveAppLanguage(null, ['pt-BR'])).toBe('pt-PT');
    expect(resolveAppLanguage(null, [])).toBe('en-US');
  });

  test.each([
    ['zh', 'zh-CN'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-CN', 'zh-TW'],
    ['zh-Hans-HK', 'zh-CN'],
    ['ZH_tw', 'zh-TW'],
  ])('preserves Chinese script intent for %s', (language, expected) => {
    expect(resolveAppLanguage(null, [language])).toBe(expected);
  });

  test('unknown saved values have a stable fallback without changing the stored value', () => {
    expect(resolveAppLanguage('unsupported', ['ja-JP'])).toBe('en-US');
    expect(resolveAppLanguage('', ['ja-JP'])).toBe('en-US');
    expect(resolveAppLanguage(null, ['unsupported', 'de-DE'])).toBe('de-DE');
  });
});
