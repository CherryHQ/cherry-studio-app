import catalog from '@/assets/paintings/templates/catalog.json';
import english from '@/assets/paintings/templates/locales/en-us.json';
import chinese from '@/assets/paintings/templates/locales/zh-cn.json';

import {
  getPaintingTemplates,
  type PaintingTemplate,
  shufflePaintingTemplates,
  toPaintingTemplateDraft,
} from '../paintingTemplates';

describe('painting templates', () => {
  test.each([
    ['en-US', english],
    ['zh-CN', chinese],
  ] as const)(
    'keeps every %s template and its default prompt available',
    async (language, translations) => {
      const templates = await getPaintingTemplates(language);
      expect(templates).toHaveLength(25);
      expect(new Set(catalog).size).toBe(catalog.length);
      expect(templates.map((template) => template.id)).toEqual(catalog);
      expect(Object.keys(translations).sort()).toEqual([...catalog].sort());

      for (const template of templates) {
        const original = translations[template.id as keyof typeof translations];
        expect(template.title).toBe(original.label);
        expect(template.prompt).toBe(original.prompt);
        expect(template.preview).toBeDefined();
        const handoff = toPaintingTemplateDraft(template);
        expect(handoff.draft?.length).toBeGreaterThan(0);
        expect(handoff.draft).not.toContain('${');
        expect(handoff.attachments).toEqual([]);
      }
    },
  );

  test('uses Chinese content for Simplified Chinese and English for other locales', async () => {
    const localized = (await getPaintingTemplates('zh-CN')).find(
      (template) => template.id === 'birthday-poster',
    );
    expect(localized?.title).toBe('生日海报');
    expect(localized?.prompt).toContain('儿童姓名');
    expect(await getPaintingTemplates('zh-TW')).toEqual(await getPaintingTemplates('en-US'));
  });

  test('prefills an editable draft without changing the template for the next use', async () => {
    const template = (await getPaintingTemplates('zh-CN')).find(
      (entry) => entry.id === 'birthday-poster',
    )!;
    const handoff = toPaintingTemplateDraft(template);
    expect(handoff.draft).toContain('儿童姓名：MUNONYE。庆祝年龄：2。');
    handoff.draft = 'A different birthday poster';
    expect(toPaintingTemplateDraft(template).draft).toContain('儿童姓名：MUNONYE。庆祝年龄：2。');
    expect(template.prompt).toContain('${MUNONYE}');
  });

  test('materializes repeated defaults and replacement characters literally', async () => {
    const template: PaintingTemplate = {
      ...(await getPaintingTemplates('en-US'))[0],
      prompt: '${Alex} meets ${Alex}. ${$&}',
    };
    expect(toPaintingTemplateDraft(template).draft).toBe('Alex meets Alex. $&');
  });

  test('randomizes a copy without dropping templates or changing the catalog', async () => {
    const templates = await getPaintingTemplates('en-US');
    const originalOrder = templates.map((template) => template.id);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const shuffled = shufflePaintingTemplates(templates);
      expect(shuffled.map((template) => template.id)).not.toEqual(originalOrder);
      expect(new Set(shuffled)).toEqual(new Set(templates));
      expect(templates.map((template) => template.id)).toEqual(originalOrder);
    } finally {
      random.mockRestore();
    }
  });
});
