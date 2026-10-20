import catalog from '@/assets/paintings/templates/catalog.json';
import english from '@/assets/paintings/templates/locales/en-us.json';
import chinese from '@/assets/paintings/templates/locales/zh-cn.json';
import presentation from '@/assets/paintings/templates/presentation.json';

import {
  getPaintingTemplates,
  materializePaintingTemplatePrompt,
  PAINTING_TEMPLATE_CATEGORIES,
  type PaintingTemplate,
  parsePaintingTemplateSlots,
} from '../paintingTemplates';

describe('painting templates', () => {
  test.each([
    ['en-US', english],
    ['zh-CN', chinese],
  ] as const)(
    'keeps every %s template, its prompt, and its presentation',
    async (language, translations) => {
      const templates = await getPaintingTemplates(language);
      expect(templates).toHaveLength(25);
      expect(new Set(catalog).size).toBe(catalog.length);
      expect(templates.map((template) => template.id)).toEqual(catalog);
      expect(Object.keys(translations).sort()).toEqual([...catalog].sort());
      expect(Object.keys(presentation).sort()).toEqual([...catalog].sort());

      for (const template of templates) {
        const original = translations[template.id as keyof typeof translations];
        expect(template.title).toBe(original.label);
        expect(template.prompt).toBe(original.prompt);
        expect(template.preview).toBeDefined();
        expect(template.summary.length).toBeGreaterThan(0);
        expect(PAINTING_TEMPLATE_CATEGORIES).toContain(template.category);
        expect(template.slots.length).toBe(original.prompt.match(/\$\{/g)?.length ?? 0);
        const slotIndex = template.photo?.slotIndex;
        if (slotIndex !== undefined) {
          expect(template.slots[slotIndex]).toBeDefined();
        }
        const prompt = materializePaintingTemplatePrompt(template, [], { hasPhoto: false });
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).not.toContain('${');
      }
    },
  );

  test('aligns each photo slot with the same subject in both languages', async () => {
    const [englishTemplates, chineseTemplates] = await Promise.all([
      getPaintingTemplates('en-US'),
      getPaintingTemplates('zh-CN'),
    ]);
    chineseTemplates.forEach((template, index) => {
      expect(template.slots).toHaveLength(englishTemplates[index].slots.length);
    });
    const underwater = chineseTemplates.find((template) => template.id === 'underwater-editorial');
    expect(underwater?.slots[underwater.photo?.slotIndex ?? -1]?.label).toBe('人物');
  });

  test('uses Chinese content for Simplified Chinese and English for other locales', async () => {
    const localized = (await getPaintingTemplates('zh-CN')).find(
      (template) => template.id === 'birthday-poster',
    );
    expect(localized?.title).toBe('生日海报');
    expect(localized?.prompt).toContain('儿童姓名');
    expect(await getPaintingTemplates('zh-TW')).toEqual(await getPaintingTemplates('en-US'));
  });

  test('labels slots from the short phrase that introduces them', () => {
    expect(
      parsePaintingTemplateSlots(
        'Create a 9:16 poster of ${a cat}. Main title: ${SUBMERGED}. 场景：${竹林}',
      ),
    ).toEqual([
      { defaultValue: 'a cat', position: 0 },
      { defaultValue: 'SUBMERGED', label: 'Main title', position: 1 },
      { defaultValue: '竹林', label: '场景', position: 2 },
    ]);
  });

  test('fills edited values, keeps defaults for blanks, and names the photo subject', async () => {
    const template = (await getPaintingTemplates('zh-CN')).find(
      (entry) => entry.id === 'birthday-poster',
    )!;
    const values = template.slots.map(() => '');
    values[0] = '  LIN  ';

    const prompt = materializePaintingTemplatePrompt(template, values, { hasPhoto: true });

    expect(prompt).toContain('儿童姓名：LIN。庆祝年龄：2。');
    expect(prompt).toContain('儿童形象：参考照片中的主体，保持其外貌特征。');
    expect(template.prompt).toContain('${MUNONYE}');
  });

  test('materializes repeated defaults and replacement characters literally', async () => {
    const template: PaintingTemplate = {
      ...(await getPaintingTemplates('en-US'))[0],
      photo: undefined,
      prompt: '${Alex} meets ${Alex}. ${$&}',
    };
    expect(materializePaintingTemplatePrompt(template, [], { hasPhoto: true })).toBe(
      'Alex meets Alex. $&',
    );
  });
});
