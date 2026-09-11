import catalog from '../../../../../../../assets/paintings/templates/catalog.json';
import english from '../../../../../../../assets/paintings/templates/locales/en-us.json';
import chinese from '../../../../../../../assets/paintings/templates/locales/zh-cn.json';
import {
  createPaintingTemplatePrompt,
  getPaintingTemplates,
  isPaintingTemplateInputValid,
  type PaintingTemplate,
  shufflePaintingTemplates,
} from '../paintingTemplates';

describe('painting templates', () => {
  test.each([
    ['en-US', english],
    ['zh-CN', chinese],
  ] as const)(
    'keeps every %s template and its default prompt available',
    (language, translations) => {
      const templates = getPaintingTemplates(language);
      expect(templates).toHaveLength(25);
      expect(new Set(catalog).size).toBe(catalog.length);
      expect(templates.map((template) => template.id)).toEqual(catalog);
      expect(Object.keys(translations).sort()).toEqual([...catalog].sort());

      for (const template of templates) {
        expect(template.title).toBe(translations[template.id].label);
        expect(template.prompt).toBe(translations[template.id].prompt);
        expect(template.preview).toBeDefined();
        expect(createPaintingTemplatePrompt(template).length).toBeGreaterThan(0);
        expect(createPaintingTemplatePrompt(template)).not.toContain('${');
      }
    },
  );

  test('uses Chinese content for Simplified Chinese and English for other locales', () => {
    const localized = getPaintingTemplates('zh-CN').find(
      (template) => template.id === 'birthday-poster',
    );
    expect(localized?.title).toBe('生日海报');
    expect(localized?.prompt).toContain('儿童姓名');
    expect(getPaintingTemplates('zh-TW')).toEqual(getPaintingTemplates('en-US'));
  });

  test('creates a concrete prompt without changing the template for the next creation', () => {
    const template = getPaintingTemplates('zh-CN').find((entry) => entry.id === 'birthday-poster')!;
    const prompt = createPaintingTemplatePrompt(template);
    expect(prompt).toContain('儿童姓名：MUNONYE。庆祝年龄：2。');
    expect(prompt).not.toContain('${');
    expect(template.prompt).toContain('${MUNONYE}');
  });

  test('materializes repeated defaults and replacement characters literally', () => {
    const template: PaintingTemplate = {
      ...getPaintingTemplates('en-US')[0],
      prompt: '${Alex} meets ${Alex}. ${$&}',
    };
    expect(createPaintingTemplatePrompt(template)).toBe('Alex meets Alex. $&');
  });

  test('randomizes a copy without dropping templates or changing the catalog', () => {
    const templates = getPaintingTemplates('en-US');
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

  test.each(['en-US', 'zh-CN'])(
    'keeps generation requirements independent of %s copy',
    (language) => {
      const templates = getPaintingTemplates(language);
      expect(
        templates.find((template) => template.id === 'human-fragments-motion')?.aspectRatio,
      ).toBe('9:16');
      expect(templates.find((template) => template.id === 'birthday-poster')?.aspectRatio).toBe(
        '3:4',
      );
      expect(templates.find((template) => template.id === 'tuscan-residence')?.aspectRatio).toBe(
        '4:5',
      );

      const referenceTemplate = templates.find((template) => template.id === 'doodle-shadow')!;
      const prompt = createPaintingTemplatePrompt(referenceTemplate);
      expect(isPaintingTemplateInputValid(referenceTemplate, prompt, 0)).toBe(false);
      expect(isPaintingTemplateInputValid(referenceTemplate, prompt, 1)).toBe(true);

      const textTemplate = templates.find((template) => template.id === 'birthday-poster')!;
      expect(isPaintingTemplateInputValid(textTemplate, 'A completely rewritten prompt.', 0)).toBe(
        true,
      );
      expect(isPaintingTemplateInputValid(textTemplate, '', 0)).toBe(false);
      expect(isPaintingTemplateInputValid(textTemplate, '  \n  ', 1)).toBe(false);
    },
  );
});
