import { languageOptions } from '../../settingOptions';

describe('languageOptions', () => {
  test('uses each language native name instead of translated labels', () => {
    expect(languageOptions).toEqual([
      { label: '简体中文', value: 'zh-CN' },
      { label: 'English', value: 'en-US' },
    ]);
  });
});
