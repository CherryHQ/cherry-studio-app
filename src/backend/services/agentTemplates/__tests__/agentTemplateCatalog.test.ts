import { parseAgentTemplateCatalog } from '../agentTemplateCatalog';

const revision = 'a'.repeat(40);
const legacy = [
  {
    id: 'original',
    name: 'Original',
    description: 'Description',
    emoji: '✍️',
    group: ['Writing'],
    prompt: 'Keep\r\nthese lines.\n',
  },
];
const newer = {
  schemaVersion: 1,
  items: [
    {
      id: 'new',
      name: { en: 'Editor', zh: '编辑' },
      description: { en: 'Edit text', zh: '编辑文字' },
      avatar: '📝',
      category: 'Writing',
      instructions: 'Original English instructions.\r\n',
    },
  ],
};

it.each(['en', 'zh'] as const)(
  'preserves source IDs and exact instructions in the %s catalog',
  (language) => {
    const catalog = parseAgentTemplateCatalog(legacy, newer, language, revision);
    expect(catalog.templates.map((item) => item.id)).toEqual(['original', 'new']);
    expect(catalog.templates[0]?.prompt).toBe(legacy[0]!.prompt);
    expect(catalog.templates[1]).toMatchObject({
      name: newer.items[0]!.name[language],
      description: newer.items[0]!.description[language],
      prompt: newer.items[0]!.instructions,
      emoji: '📝',
      categories: ['writing'],
    });
  },
);

it.each([
  [
    ['Programming', 'Education'],
    ['programming', 'learning'],
  ],
  [
    ['编程', '教育'],
    ['programming', 'learning'],
  ],
  [['A future upstream group'], []],
])('maps source groups %j without hiding unfamiliar templates', (group, categories) => {
  const catalog = parseAgentTemplateCatalog([{ ...legacy[0], group }], newer, 'en', revision);
  expect(catalog.templates[0]?.categories).toEqual(categories);
});

it('rejects duplicate identities across the two source files', () => {
  expect(() =>
    parseAgentTemplateCatalog([{ ...legacy[0], id: 'new' }], newer, 'en', revision),
  ).toThrow('Duplicate template IDs');
});

it.each([
  { invalid: [], reason: 'empty catalogs' },
  {
    invalid: [{ ...legacy[0], emoji: 'https://example.com/avatar.png' }],
    reason: 'non-emoji avatars',
  },
  { invalid: [{ ...legacy[0], prompt: '' }], reason: 'empty instructions' },
  { invalid: [{ ...legacy[0], prompt: 'x'.repeat(200_001) }], reason: 'oversized instructions' },
])('rejects $reason before it can replace a snapshot', ({ invalid }) => {
  expect(() => parseAgentTemplateCatalog(invalid, newer, 'en', revision)).toThrow();
});

it('rejects incompatible marketplace schemas', () => {
  expect(() =>
    parseAgentTemplateCatalog(legacy, { ...newer, schemaVersion: 2 }, 'en', revision),
  ).toThrow();
});
