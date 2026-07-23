import { paintingTemplates, toPaintingTemplateDraft } from '../paintingTemplates';

describe('painting templates', () => {
  test('provides the bundled templates with prompt and author metadata', () => {
    expect(paintingTemplates).toHaveLength(5);
    expect(paintingTemplates.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'china-landmark-diorama', title: 'China Landmark Diorama' },
      { id: 'meta-quest-3-exploded-view', title: 'Meta Quest 3 Exploded View' },
      { id: 'crocs-editorial-poster', title: 'Crocs Editorial Poster' },
      { id: 'algorithm-fog-city-poster', title: 'Algorithm: Fog City' },
      { id: 'cyber-rabbit-character', title: 'Cyber Rabbit Character' },
    ]);
    expect(paintingTemplates.map(({ author }) => author)).toEqual([
      '@0x00_Krypt',
      '@wory37303852',
      '@rovvmut_',
      '@iamaiistudio',
      '@aimikoda',
    ]);
    expect(paintingTemplates.every((template) => template.prompt.length > 0)).toBe(true);
  });

  test('creates a painting draft using the template prompt', () => {
    const template = paintingTemplates[0];

    expect(toPaintingTemplateDraft(template)).toEqual({
      attachments: [],
      draft: template.prompt,
    });
  });

  test('stores rewritten prompts without argument JSON syntax', () => {
    expect(paintingTemplates[1].prompt).not.toContain('{argument');
    expect(paintingTemplates[4].prompt).not.toContain('{argument');
  });
});
