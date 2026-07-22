import { paintingTemplates, toPaintingTemplateDraft } from '../paintingTemplates';

describe('painting templates', () => {
  test('provides one bundled placeholder template', () => {
    expect(paintingTemplates).toHaveLength(1);
    expect(paintingTemplates[0]).toMatchObject({
      id: 'cherry-twilight',
      title: 'Cherry Twilight',
    });
    expect(paintingTemplates[0].author).toBeUndefined();
  });

  test('creates a prompt-only painting draft', () => {
    const template = paintingTemplates[0];

    expect(toPaintingTemplateDraft(template)).toEqual({
      attachments: [],
      draft: template.prompt,
    });
  });
});
