import catalog from '../../../../../../../assets/paintings/templates/catalog.json';
import english from '../../../../../../../assets/paintings/templates/locales/en-us.json';
import englishFields from '../../../../../../../assets/paintings/templates/locales/fields-en-us.json';
import chineseFields from '../../../../../../../assets/paintings/templates/locales/fields-zh-cn.json';
import chinese from '../../../../../../../assets/paintings/templates/locales/zh-cn.json';
import {
  createPaintingTemplatePrompt,
  getPaintingTemplates,
  type PaintingTemplate,
  shufflePaintingTemplates,
} from '../paintingTemplates';

describe('painting templates', () => {
  test.each([
    ['en-US', english, englishFields],
    ['zh-CN', chinese, chineseFields],
  ] as const)(
    'keeps every %s template and its one-use inputs available',
    (language, translations, labels) => {
      const templates = getPaintingTemplates(language);
      expect(templates).toHaveLength(25);
      expect(new Set(catalog).size).toBe(catalog.length);
      expect(templates.map((template) => template.id)).toEqual(catalog);
      expect(Object.keys(translations).sort()).toEqual([...catalog].sort());
      expect(Object.keys(labels).sort()).toEqual([...catalog].sort());

      for (const template of templates) {
        expect(template.title).toBe(translations[template.id].label);
        expect(template.prompt).toBe(translations[template.id].prompt);
        expect(template.preview).toBeDefined();
        expect(template.fields.length).toBeGreaterThan(0);
        expect(template.fields).toHaveLength(labels[template.id].length);
        expect(new Set(template.fields.map((field) => field.label)).size).toBe(
          template.fields.length,
        );
        expect(template.fields.every((field) => field.label.trim() && field.value.trim())).toBe(
          true,
        );
      }
    },
  );

  test('uses Chinese content for Simplified Chinese and English for other locales', () => {
    const localized = getPaintingTemplates('zh-CN').find(
      (template) => template.id === 'birthday-poster',
    );
    expect(localized?.title).toBe('生日海报');
    expect(localized?.fields[0].label).toBe('儿童姓名');
    expect(getPaintingTemplates('zh-TW')).toEqual(getPaintingTemplates('en-US'));
  });

  test('creates a concrete prompt without changing the template for the next creation', () => {
    const template = getPaintingTemplates('zh-CN').find((entry) => entry.id === 'birthday-poster')!;
    const values = template.fields.map((field) => field.value);
    values[0] = '  小樱  ';
    values[1] = '5';

    const prompt = createPaintingTemplatePrompt(template, values);
    expect(prompt).toContain('儿童姓名：小樱。庆祝年龄：5。');
    expect(prompt).not.toContain('${');
    expect(template.prompt).toContain('${MUNONYE}');
    expect(template.fields[0].value).toBe('MUNONYE');
    expect(createPaintingTemplatePrompt(template, [])).toContain(
      '儿童姓名：MUNONYE。庆祝年龄：2。',
    );
  });

  test('keeps repeated example values independent and treats entered text literally', () => {
    const template: PaintingTemplate = {
      ...getPaintingTemplates('en-US')[0],
      prompt: '${Alex} meets ${Alex}.',
    };
    expect(createPaintingTemplatePrompt(template, ['${Sam} $&', 'Jo'])).toBe('${Sam} $& meets Jo.');
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
});
