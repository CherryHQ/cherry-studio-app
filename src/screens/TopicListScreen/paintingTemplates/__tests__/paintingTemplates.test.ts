import { paintingTemplates, toPaintingTemplateDraft } from '../paintingTemplates';

describe('painting templates', () => {
  test('provides the bundled templates pending prompt and author metadata', () => {
    expect(paintingTemplates).toHaveLength(6);
    expect(paintingTemplates.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'tokyo-map-diorama', title: 'Tokyo Map Diorama' },
      { id: 'meta-quest-3-exploded-view', title: 'Meta Quest 3 Exploded View' },
      { id: 'crocs-editorial-poster', title: 'Crocs Editorial Poster' },
      { id: 'algorithm-fog-city-poster', title: 'Algorithm: Fog City' },
      { id: 'china-landmark-diorama', title: 'China Landmark Diorama' },
      { id: 'cyber-rabbit-character', title: 'Cyber Rabbit Character' },
    ]);
    expect(paintingTemplates.every((template) => template.prompt === '')).toBe(true);
    expect(paintingTemplates.every((template) => template.author === undefined)).toBe(true);
  });

  test('creates a prompt-only painting draft', () => {
    const template = paintingTemplates[0];

    expect(toPaintingTemplateDraft(template)).toEqual({
      attachments: [],
      draft: template.prompt,
    });
  });
});
