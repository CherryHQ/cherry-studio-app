import type { Message } from '@earendil-works/pi-ai';

import { replaceRequestInstructions } from '../piToolInstructions';

test('withdraws old Host sections using native metadata while preserving user text, tools and other sections', () => {
  const messages: Message[] = [
    {
      role: 'system',
      content: 'Base rules',
      timestamp: 1,
      sections: {
        'cherry-tool-instructions': 'Old private identity and shared entry',
        other: 'Keep this',
      },
      toolsRemoved: [{ name: 'old_tool' }],
    },
    { role: 'user', content: 'Old private identity and shared entry', timestamp: 2 },
    {
      role: 'system',
      content: '',
      timestamp: 3,
      sections: { 'cherry-tool-instructions': 'Loaded context' },
    },
  ];
  const retained = [
    { key: 'agent-memory', text: 'Old identity' },
    { key: 'cherry-memory', text: 'Old shared entry' },
    { key: 'skill', text: 'Loaded skill' },
  ];
  const result = replaceRequestInstructions(messages, retained, [
    { key: 'agent-memory', text: 'Current identity' },
    { key: 'cherry-memory', text: 'Shared access withdrawn' },
  ]);
  expect(result[0]).toMatchObject({
    content: 'Base rules',
    sections: { other: 'Keep this' },
    toolsRemoved: [{ name: 'old_tool' }],
  });
  expect(result[1]).toBe(messages[1]);
  expect(result.at(-1)).toMatchObject({
    role: 'system',
    sections: {
      'cherry-tool-instructions': 'Current identity\n\nShared access withdrawn\n\nLoaded skill',
    },
  });
  expect(messages[0]).toMatchObject({
    sections: { 'cherry-tool-instructions': 'Old private identity and shared entry' },
  });
});

test('supplies current instructions after compaction without guessing a text match', () => {
  const messages: Message[] = [
    { role: 'user', content: 'Summary contains agent-memory as ordinary text', timestamp: 1 },
  ];
  const result = replaceRequestInstructions(
    messages,
    [],
    [{ key: 'agent-memory', text: 'Live memory' }],
  );
  expect(result[0]).toBe(messages[0]);
  expect(result[1]).toMatchObject({
    role: 'system',
    sections: { 'cherry-tool-instructions': 'Live memory' },
  });
  expect(() =>
    replaceRequestInstructions(messages, [], [{ key: 'agent-memory', text: '' }]),
  ).toThrow();
});
