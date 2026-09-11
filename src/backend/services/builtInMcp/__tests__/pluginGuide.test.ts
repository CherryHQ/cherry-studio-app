import { validatePluginGuide, type PluginGuideDefinition } from '../pluginGuide';

const TOOLS = { read: 'read', write: 'write' };
const GUIDE: PluginGuideDefinition = {
  revision: 1,
  sections: [
    { requiredTools: [], content: 'Common context.' },
    { requiredTools: ['read', 'write'], content: 'Read before writing.' },
  ],
};

test.each<PluginGuideDefinition>([
  { ...GUIDE, revision: 0 },
  { ...GUIDE, revision: 1.5 },
  { ...GUIDE, sections: [] },
  { ...GUIDE, sections: [{ requiredTools: [], content: '   ' }] },
  { ...GUIDE, sections: [{ requiredTools: ['missing'], content: 'Wrong tool.' }] },
  { ...GUIDE, sections: [{ requiredTools: ['read', 'read'], content: 'Repeated tool.' }] },
  { ...GUIDE, sections: Array.from({ length: 33 }, () => GUIDE.sections[0]) },
])('rejects invalid guide definitions (%#)', (guide) => {
  expect(() => validatePluginGuide(guide, TOOLS)).toThrow();
});

test('accepts 32 independently gated sections within the content budget', () => {
  expect(() =>
    validatePluginGuide(
      { ...GUIDE, sections: Array.from({ length: 32 }, () => GUIDE.sections[1]) },
      TOOLS,
    ),
  ).not.toThrow();
});

test('limits the combined UTF-8 content, including section separators', () => {
  const guide = {
    revision: 1,
    sections: [
      { requiredTools: [], content: '你'.repeat(1_365) },
      { requiredTools: ['read'], content: '你'.repeat(1_365) },
    ],
  };
  // 8,190 content bytes plus the two-byte separator fit exactly.
  expect(() => validatePluginGuide(guide, TOOLS)).not.toThrow();
  guide.sections[1].content += 'x';
  expect(() => validatePluginGuide(guide, TOOLS)).toThrow('size limit');
});
