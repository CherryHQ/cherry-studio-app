import { CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';

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

it('keeps one usable template for duplicate identities without dropping the catalog', () => {
  const catalog = parseAgentTemplateCatalog([{ ...legacy[0], id: 'new' }], newer, 'en', revision);
  expect(catalog.templates).toHaveLength(1);
  expect(catalog.templates[0]?.name).toBe('Editor');
});

it.each(['🎯 ', '📈\r\n', '🩺\r\n\r\n'])(
  'reads real upstream avatar whitespace without rejecting other templates: %j',
  (emoji) => {
    const catalog = parseAgentTemplateCatalog([{ ...legacy[0], emoji }], newer, 'en', revision);
    expect(catalog.templates).toHaveLength(2);
    expect(catalog.templates[0]?.emoji).toBe(emoji.trim());
  },
);

it('uses field defaults and ignores non-object entries without rejecting usable content', () => {
  const catalog = parseAgentTemplateCatalog(
    [null, 7, [], { id: 'missing', name: 12, emoji: 'https://example.com/avatar.png' }, legacy[0]],
    undefined,
    'en',
    revision,
  );
  expect(catalog.templates).toHaveLength(2);
  expect(catalog.templates[0]).toEqual({
    id: 'missing',
    name: 'missing',
    description: '',
    emoji: CHERRY_AGENT_AVATAR,
    group: [],
    prompt: '',
    categories: [],
  });
  expect(catalog.templates[1]?.id).toBe('original');
});

it('uses a stable source identity when an upstream template has no ID', () => {
  const catalog = parseAgentTemplateCatalog([{ name: 'Nameless ID' }], null, 'en', revision);
  expect(catalog.templates[0]).toMatchObject({ id: 'legacy-1', name: 'Nameless ID', prompt: '' });
});

it('falls back to available localized text and reads items across upstream schema versions', () => {
  const catalog = parseAgentTemplateCatalog(
    undefined,
    {
      schemaVersion: 2,
      items: [
        { ...newer.items[0], name: { zh: '编辑' }, description: 'Shared description' },
        { id: 'defaults', name: {}, description: null, avatar: false },
      ],
    },
    'en',
    revision,
  );
  expect(catalog.templates[0]).toMatchObject({ name: '编辑', description: 'Shared description' });
  expect(catalog.templates[1]).toMatchObject({
    id: 'defaults',
    name: 'defaults',
    description: '',
    emoji: CHERRY_AGENT_AVATAR,
    prompt: '',
    group: [],
  });
});

it('retains empty and long instructions instead of rejecting the catalog', () => {
  const prompt = 'x'.repeat(200_001);
  const catalog = parseAgentTemplateCatalog(
    [
      { ...legacy[0], prompt: '' },
      { ...legacy[0], id: 'long', prompt },
    ],
    newer,
    'en',
    revision,
  );
  expect(catalog.templates.map((item) => item.prompt)).toEqual([
    '',
    prompt,
    newer.items[0]!.instructions,
  ]);
});

it.each([null, undefined, 7, {}, 'unavailable'])(
  'uses an empty collection for unavailable remote content: %j',
  (unavailable) => {
    expect(parseAgentTemplateCatalog(unavailable, newer, 'en', revision).templates).toHaveLength(1);
    expect(parseAgentTemplateCatalog(legacy, unavailable, 'en', revision).templates).toHaveLength(
      1,
    );
    expect(parseAgentTemplateCatalog(unavailable, unavailable, 'en', revision).templates).toEqual(
      [],
    );
  },
);
