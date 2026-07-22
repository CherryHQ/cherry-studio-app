import enUS from '@/i18n/locales/en-us.json';
import zhCN from '@/i18n/locales/zh-cn.json';

import { paintingTemplates, toPaintingTemplateDraft } from '../paintingTemplates';

describe('painting templates', () => {
  test('provides the bundled templates with localized prompt metadata', () => {
    expect(paintingTemplates).toHaveLength(5);
    expect(paintingTemplates.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'china-landmark-diorama', title: 'China Landmark Diorama' },
      { id: 'meta-quest-3-exploded-view', title: 'Meta Quest 3 Exploded View' },
      { id: 'crocs-editorial-poster', title: 'Crocs Editorial Poster' },
      { id: 'algorithm-fog-city-poster', title: 'Algorithm: Fog City' },
      { id: 'cyber-rabbit-character', title: 'Cyber Rabbit Character' },
    ]);
    expect(paintingTemplates.map(({ author, promptKey }) => ({ author, promptKey }))).toEqual([
      { author: '@0x00_Krypt', promptKey: 'painting.templates.prompt.landmark' },
      { author: '@wory37303852', promptKey: 'painting.templates.prompt.quest' },
      { author: '@rovvmut_', promptKey: 'painting.templates.prompt.crocs' },
      { author: '@iamaiistudio', promptKey: 'painting.templates.prompt.algorithm' },
      { author: '@aimikoda', promptKey: 'painting.templates.prompt.cyberRabbit' },
    ]);
  });

  test('creates a painting draft using the localized prompt', () => {
    const template = paintingTemplates[0];
    const translate = jest.fn((key: string) => `translated:${key}`);

    expect(toPaintingTemplateDraft(template, translate)).toEqual({
      attachments: [],
      draft: `translated:${template.promptKey}`,
    });
    expect(translate).toHaveBeenCalledWith(template.promptKey);
  });

  test('provides every prompt in both locales without argument JSON syntax', () => {
    const locales: Record<string, string>[] = [enUS, zhCN];

    for (const template of paintingTemplates) {
      for (const locale of locales) {
        expect(locale[template.promptKey]).toBeTruthy();
      }
      expect(zhCN[template.promptKey as keyof typeof zhCN]).toBe(
        enUS[template.promptKey as keyof typeof enUS],
      );
    }

    expect(enUS['painting.templates.prompt.quest']).not.toContain('{argument');
    expect(enUS['painting.templates.prompt.cyberRabbit']).not.toContain('{argument');
  });
});
