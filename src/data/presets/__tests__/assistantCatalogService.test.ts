import {
  type AssistantCatalogPreset,
  buildAssistantCatalogTabs,
  filterAssistantCatalogPresets,
  getPresetKey,
  loadAssistantCatalogPresets,
  normalizePresets,
  toCreateAssistantDtoFromCatalogPreset,
} from '../assistantCatalogService';

// Sample presets matching the JSON structure
const samplePresets: AssistantCatalogPreset[] = [
  {
    id: 'preset-1',
    name: 'Product Manager',
    description: 'Provides practical insights as a tech-savvy product manager.',
    emoji: '👨‍💼',
    group: ['Career', 'Business', 'Tools'],
    prompt: 'You are now an experienced product manager.',
  },
  {
    id: 'preset-2',
    name: 'Strategy PM',
    description: 'Offers in-depth answers based on market insights.',
    emoji: '🎯',
    group: ['Career'],
    prompt: 'You are now a strategic product manager.',
  },
  {
    id: 'preset-3',
    name: 'Writing Assistant',
    emoji: '✍️',
    group: ['Writing', 'Tools'],
    prompt: 'You are a professional writing assistant.',
  },
  {
    id: 'preset-4',
    name: 'Code Helper',
    emoji: '💻',
    group: ['Programming', 'Tools'],
    prompt: 'You are a coding expert.',
  },
  {
    id: 'preset-5',
    name: 'Creative Designer',
    description: 'Helps with design thinking.',
    emoji: '🎨',
    group: ['Creative', 'Design'],
    prompt: 'You are a creative designer.',
  },
  {
    id: 'preset-6',
    name: 'Entertainment Guru',
    emoji: '🎮',
    group: ['Entertainment'],
    prompt: 'You are an entertainment expert.',
  },
  {
    id: 'preset-7',
    name: 'Hobbyist',
    emoji: '🛠️',
    group: ['Hobbies'],
    prompt: 'You are a hobby expert.',
  },
];

describe('buildAssistantCatalogTabs', () => {
  it('builds an "__all__" tab as the first entry with total count', () => {
    const tabs = buildAssistantCatalogTabs(samplePresets, 'All');
    expect(tabs[0]).toEqual({ id: '__all__', label: 'All', count: samplePresets.length });
  });

  it('counts presets per group correctly', () => {
    const tabs = buildAssistantCatalogTabs(samplePresets, 'All');
    const careerTab = tabs.find((t) => t.id === 'Career');
    expect(careerTab).toBeDefined();
    expect(careerTab?.count).toBe(2); // preset-1 + preset-2
  });

  it('sorts groups by the GROUP_RANK_ALIASES order (Career before Business)', () => {
    const tabs = buildAssistantCatalogTabs(samplePresets, 'All');
    // Skip __all__
    const categoryTabs = tabs.slice(1);
    const careerIdx = categoryTabs.findIndex((t) => t.id === 'Career');
    const businessIdx = categoryTabs.findIndex((t) => t.id === 'Business');
    expect(careerIdx).toBeLessThan(businessIdx);
  });

  it('places unranked groups after ranked ones', () => {
    const tabs = buildAssistantCatalogTabs(samplePresets, 'All');
    const categoryTabs = tabs.slice(1);
    // 'Hobbies' is an unranked group (not in GROUP_RANK_ALIASES) and should
    // appear after every ranked group.
    const hobbiesIdx = categoryTabs.findIndex((t) => t.id === 'Hobbies');
    const rankedTabs = categoryTabs.filter((t) => t.id !== 'Hobbies');
    expect(hobbiesIdx).toBeGreaterThanOrEqual(0);
    for (const ranked of rankedTabs) {
      const rankedIdx = categoryTabs.findIndex((t) => t.id === ranked.id);
      expect(rankedIdx).toBeLessThan(hobbiesIdx);
    }
  });

  it('returns only the "__all__" tab when presets have no groups', () => {
    const ungrouped = samplePresets.map((p) => ({ ...p, group: [] }));
    const tabs = buildAssistantCatalogTabs(ungrouped, 'All');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('__all__');
  });
});

describe('filterAssistantCatalogPresets', () => {
  it('returns all presets when activeTab is "__all__" and no search', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', '');
    expect(result).toEqual(samplePresets);
  });

  it('filters by group tab', () => {
    const result = filterAssistantCatalogPresets(samplePresets, 'Career', '');
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.group?.includes('Career'))).toBe(true);
  });

  it('filters by search keyword matching name', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', 'product');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-1');
  });

  it('filters by search keyword matching description', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', 'market');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-2');
  });

  it('filters by search keyword matching prompt', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', 'coding');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-4');
  });

  it('combines group tab and search filter', () => {
    const result = filterAssistantCatalogPresets(samplePresets, 'Tools', 'product');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-1');
  });

  it('is case-insensitive for search', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', 'PRODUCT');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Product Manager');
  });

  it('returns empty array when no presets match', () => {
    const result = filterAssistantCatalogPresets(samplePresets, '__all__', 'zzznonexistent');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when tab has no matches', () => {
    const result = filterAssistantCatalogPresets(samplePresets, 'Language', '');
    expect(result).toHaveLength(0);
  });
});

describe('toCreateAssistantDtoFromCatalogPreset', () => {
  it('maps name and prompt from a preset', () => {
    const preset = samplePresets[0];
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.name).toBe(preset.name);
    expect(dto.prompt).toBe(preset.prompt);
  });

  it('maps description and emoji when present', () => {
    const preset = samplePresets[0];
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.description).toBe(preset.description);
    expect(dto.emoji).toBe(preset.emoji);
  });

  it('omits description from DTO when not set on the preset', () => {
    const preset = samplePresets[5]; // Entertainment Guru has no description
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.description).toBeUndefined();
  });

  it('trims whitespace from string fields', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-trim',
      name: '  Test Name  ',
      prompt: '  Test prompt.  ',
      description: '  Test desc.  ',
      emoji: '  🧪  ',
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.name).toBe('Test Name');
    expect(dto.prompt).toBe('Test prompt.');
    expect(dto.description).toBe('Test desc.');
    expect(dto.emoji).toBe('🧪');
  });

  it('omits modelId when defaultModel has no provider or id', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-nomodel',
      name: 'No Model',
      prompt: 'Hello',
      defaultModel: { name: 'gpt-4' }, // no provider, no id
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.modelId).toBeUndefined();
  });

  it('builds modelId from provider and id when both are present', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-withmodel',
      name: 'With Model',
      prompt: 'Hello',
      defaultModel: { provider: 'openai', id: 'gpt-4o' },
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.modelId).toBe('openai::gpt-4o');
  });

  it('omits prompt from DTO when preset has no prompt', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-noprompt',
      name: 'No Prompt',
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.prompt).toBeUndefined();
  });

  it('omits modelId when defaultModel has only id without provider', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-idonly',
      name: 'Id Only',
      prompt: 'Hello',
      defaultModel: { id: 'gpt-4o' },
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.modelId).toBeUndefined();
  });

  it('omits modelId when defaultModel has only provider without id', () => {
    const preset: AssistantCatalogPreset = {
      id: 'preset-provideronly',
      name: 'Provider Only',
      prompt: 'Hello',
      defaultModel: { provider: 'openai' },
    };
    const dto = toCreateAssistantDtoFromCatalogPreset(preset);
    expect(dto.modelId).toBeUndefined();
  });
  it('returns the preset id', () => {
    expect(getPresetKey({ id: 'abc-123' })).toBe('abc-123');
  });
});

describe('normalizePresets', () => {
  it('returns valid presets from an array', () => {
    const result = normalizePresets([{ id: 'a', name: 'A', prompt: 'hello' }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('filters out null entries', () => {
    const result = normalizePresets([{ id: 'a', name: 'A' }, null, { id: 'b', name: 'B' }]);
    expect(result).toHaveLength(2);
  });

  it('filters out entries missing id', () => {
    const result = normalizePresets([{ name: 'A', prompt: 'hi' }, { id: 'b', name: 'B' }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('filters out entries missing name', () => {
    const result = normalizePresets([{ id: 'a', prompt: 'hi' }, { id: 'b', name: 'B' }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('filters out non-object entries', () => {
    const result = normalizePresets([{ id: 'a', name: 'A' }, 'string', 42]);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizePresets(null)).toEqual([]);
    expect(normalizePresets(undefined)).toEqual([]);
    expect(normalizePresets('string')).toEqual([]);
    expect(normalizePresets(42)).toEqual([]);
    expect(normalizePresets({})).toEqual([]);
  });
});

describe('loadAssistantCatalogPresets', () => {
  it('returns English presets for non-Chinese languages', () => {
    const result = loadAssistantCatalogPresets('en-US');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // verify first entry has required fields
    expect(typeof result[0].id).toBe('string');
    expect(typeof result[0].name).toBe('string');
  });

  it('returns Chinese presets for zh-CN', () => {
    const zhResult = loadAssistantCatalogPresets('zh-CN');
    const enResult = loadAssistantCatalogPresets('en-US');
    // Different data sets — at minimum first entry names differ
    expect(zhResult[0].name).not.toBe(enResult[0].name);
  });

  it('returns Chinese presets for zh-TW', () => {
    const zhResult = loadAssistantCatalogPresets('zh-TW');
    const enResult = loadAssistantCatalogPresets('en-US');
    expect(zhResult[0].name).not.toBe(enResult[0].name);
  });

  it('returns Chinese presets for zh-Hans', () => {
    const zhResult = loadAssistantCatalogPresets('zh-Hans');
    const enResult = loadAssistantCatalogPresets('en-US');
    expect(zhResult[0].name).not.toBe(enResult[0].name);
  });
});
