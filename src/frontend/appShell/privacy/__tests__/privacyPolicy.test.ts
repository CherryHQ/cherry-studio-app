import { APP_LANGUAGES } from '@/shared/utils/languages';

import { getPrivacyPolicyUrl } from '../privacyPolicy';

it.each([
  ['zh-CN', 'zh-cn'],
  ['zh-TW', 'zh-tw'],
  ['ja-JP', 'ja'],
  ['fr-FR', 'fr'],
  ['ru-RU', 'ru'],
])('points %s at its own translation', (language, locale) => {
  expect(getPrivacyPolicyUrl(language)).toBe(
    `https://cherryai.com.cn/docs/${locale}/about/privacypolicy/`,
  );
});

it.each(['en-US', 'de-DE', 'tr-TR', 'not-a-language'])(
  'falls back to the English page for %s',
  (language) => {
    expect(getPrivacyPolicyUrl(language)).toBe(
      'https://cherryai.com.cn/docs/en/about/privacypolicy/',
    );
  },
);

it('has an address for every supported language', () => {
  for (const { value } of APP_LANGUAGES) expect(getPrivacyPolicyUrl(value)).toMatch(/^https:\/\//);
});
