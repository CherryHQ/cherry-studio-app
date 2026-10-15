import { validatePluginGuide, type PluginGuideDefinition } from '../pluginGuide';

const TOOLS = { read: 'read', write: 'write' };
const GUIDE: PluginGuideDefinition = {
  revision: 1,
  sections: [
    { requiredTools: [], alwaysInclude: true, content: 'Common context.' },
    { requiredTools: ['read', 'write'], content: 'Read before writing.' },
  ],
};

test.each<PluginGuideDefinition>([
  { ...GUIDE, revision: 0 },
  { ...GUIDE, revision: 1.5 },
  { ...GUIDE, sections: [] },
  { ...GUIDE, sections: [GUIDE.sections[1]!] },
  { ...GUIDE, sections: [{ requiredTools: [], alwaysInclude: true, content: '   ' }] },
  {
    ...GUIDE,
    sections: [{ requiredTools: ['missing'], alwaysInclude: true, content: 'Wrong tool.' }],
  },
  {
    ...GUIDE,
    sections: [{ requiredTools: ['read', 'read'], alwaysInclude: true, content: 'Repeated tool.' }],
  },
  { ...GUIDE, sections: Array.from({ length: 33 }, () => GUIDE.sections[0]) },
])('rejects invalid guide definitions (%#)', (guide) => {
  expect(() => validatePluginGuide(guide, TOOLS)).toThrow();
});

test('accepts 32 independently gated sections within the content budget', () => {
  expect(() =>
    validatePluginGuide(
      {
        ...GUIDE,
        sections: [GUIDE.sections[0]!, ...Array.from({ length: 31 }, () => GUIDE.sections[1]!)],
      },
      TOOLS,
    ),
  ).not.toThrow();
});

test('limits the combined UTF-8 content, including section separators', () => {
  const guide = {
    revision: 1,
    sections: [
      { requiredTools: [], alwaysInclude: true, content: '你'.repeat(200) },
      { requiredTools: ['read'], content: '你'.repeat(2_530) },
    ],
  };
  // 8,190 content bytes plus the two-byte separator fit exactly.
  expect(() => validatePluginGuide(guide, TOOLS)).not.toThrow();
  guide.sections[1].content += 'x';
  expect(() => validatePluginGuide(guide, TOOLS)).toThrow('size limit');
});

test('bounds the always-included overview separately from complete workflow instructions', () => {
  const overview = { requiredTools: [], alwaysInclude: true, content: 'x'.repeat(2_048) };
  expect(() =>
    validatePluginGuide({ ...GUIDE, sections: [overview, GUIDE.sections[1]!] }, TOOLS),
  ).not.toThrow();
  overview.content += 'x';
  expect(() => validatePluginGuide({ ...GUIDE, sections: [overview] }, TOOLS)).toThrow('overview');
});
