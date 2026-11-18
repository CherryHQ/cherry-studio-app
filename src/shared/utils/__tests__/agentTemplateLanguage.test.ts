import { agentTemplateLanguage } from '../agentTemplateLanguage';

it.each(['zh-CN', 'zh-TW', 'zh-Hant-HK', 'zh-Hans-SG'])(
  'uses upstream Chinese content for %s',
  (language) => {
    expect(agentTemplateLanguage(language)).toBe('zh');
  },
);

it.each(['en-US', 'de-DE', 'ja-JP', 'fr-CA', 'pt-BR', 'unknown'])(
  'uses upstream English content for %s',
  (language) => {
    expect(agentTemplateLanguage(language)).toBe('en');
  },
);
