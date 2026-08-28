import type { CherryMessagePart } from '@/shared/data/types/message';

import { resolveMessageCitationText } from '../citations';

describe('resolveMessageCitationText', () => {
  test('resolves IDs from projected source URL parts', () => {
    const parts = [
      {
        sourceId: 'aaaa1111-1',
        title: 'Cherry Studio',
        type: 'source-url',
        url: 'https://cherry-ai.com',
      },
      { text: 'See [cite:aaaa1111-1].', type: 'text' },
    ] satisfies CherryMessagePart[];

    expect(resolveMessageCitationText(parts).get(1)).toEqual({
      markdown: 'See [1](https://cherry-ai.com).',
      plainText: 'See [1].',
    });
  });

  test('resolves message-local tool result IDs by first marker appearance', () => {
    const parts = [
      {
        input: { query: 'Cherry Studio' },
        output: [
          { content: 'A', id: 'aaaa1111-1', title: 'A', url: 'https://a.example' },
          { content: 'B', id: 'aaaa1111-2', title: 'B', url: 'https://b.example' },
        ],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      { text: 'Second [cite:aaaa1111-2], first [cite:aaaa1111-1].', type: 'text' },
    ] as CherryMessagePart[];

    expect(resolveMessageCitationText(parts).get(1)).toEqual({
      markdown: 'Second [1](https://b.example), first [2](https://a.example).',
      plainText: 'Second [1], first [2].',
    });
  });

  test('keeps unknown markers and code examples literal', () => {
    const parts = [
      {
        output: [{ id: 'aaaa1111-1', title: 'A', url: 'https://a.example' }],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      {
        text: '`[cite:aaaa1111-1]` [cite:missing] [cite:aaaa1111-1]',
        type: 'text',
      },
    ] as CherryMessagePart[];

    expect(resolveMessageCitationText(parts).get(1)?.markdown).toBe(
      '`[cite:aaaa1111-1]` [cite:missing] [1](https://a.example)',
    );
  });

  test('deduplicates repeated URLs across lookup calls', () => {
    const parts = [
      {
        output: [{ id: 'aaaa1111-1', title: 'A', url: 'https://a.example' }],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      {
        output: [{ id: 'bbbb2222-1', title: 'A again', url: 'https://a.example' }],
        state: 'output-available',
        toolCallId: 'call-2',
        type: 'tool-web_search',
      },
      { text: 'A [cite:aaaa1111-1] B [cite:bbbb2222-1]', type: 'text' },
    ] as CherryMessagePart[];

    expect(resolveMessageCitationText(parts).get(2)?.plainText).toBe('A [1] B [1]');
  });
});
