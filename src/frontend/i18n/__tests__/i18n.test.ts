import i18n, { initI18n, resolveLanguage } from '../i18n';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'ko-KR' }, { languageTag: 'zh-Hant-HK' }],
}));

describe('app translation runtime', () => {
  test('initializes plural translations when the runtime has no native PluralRules', async () => {
    const original = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');
    Object.defineProperty(Intl, 'PluralRules', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      await jest.isolateModulesAsync(async () => {
        const runtime = jest.requireActual<typeof import('../i18n')>('../i18n');
        await runtime.initI18n('ru-RU');
        expect(runtime.default.t('chat.sources.count', { count: 2 })).toBe('2 источника');
        await runtime.initI18n('zh-CN');
        expect(runtime.default.t('chat.sources.count', { count: 1 })).toBe('1 个来源');
      });
    } finally {
      if (original) Object.defineProperty(Intl, 'PluralRules', original);
      else Reflect.deleteProperty(Intl, 'PluralRules');
    }
  });

  test('system resolution preserves the script in the first supported device language', () => {
    expect(resolveLanguage(null)).toBe('zh-TW');
    expect(resolveLanguage('de-DE')).toBe('de-DE');
  });

  test('concurrent initialization and changes finish in request order', async () => {
    await Promise.all([initI18n('en-US'), initI18n('zh-CN'), initI18n('tr-TR')]);
    expect(i18n.resolvedLanguage).toBe('tr-TR');
    expect(i18n.t('common.cancel')).not.toBe('Cancel');
  });

  test('counted translations use the active language’s plural forms', async () => {
    await initI18n('ru-RU');
    expect(i18n.t('chat.sources.count', { count: 1 })).toBe('1 источник');
    expect(i18n.t('chat.sources.count', { count: 2 })).toBe('2 источника');
    expect(i18n.t('chat.sources.count', { count: 5 })).toBe('5 источников');
    expect(i18n.t('chat.sources.count', { count: 1.5 })).toBe('1.5 источника');

    await initI18n('zh-CN');
    expect(i18n.t('chat.sources.count', { count: 1 })).toContain('1');
    expect(i18n.t('chat.sources.count', { count: 1 })).not.toContain('source');
  });

  test('a failed change does not prevent later language changes', async () => {
    await initI18n('en-US');
    const changeLanguage = jest.spyOn(i18n, 'changeLanguage');
    changeLanguage.mockRejectedValueOnce(new Error('language change failed'));
    await expect(initI18n('ja-JP')).rejects.toThrow('language change failed');
    changeLanguage.mockRestore();

    await initI18n('zh-CN');
    expect(i18n.resolvedLanguage).toBe('zh-CN');
    expect(i18n.t('common.cancel')).toBe('取消');
  });
});
