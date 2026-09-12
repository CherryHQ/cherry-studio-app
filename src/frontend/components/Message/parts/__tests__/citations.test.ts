import type { CherryMessagePart } from '@/shared/data/types/message';

import { resolveMessageCitations } from '../citations';

describe('resolveMessageCitations', () => {
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

    const citations = resolveMessageCitations(parts);

    expect(citations.textByPartIndex.get(1)).toEqual({
      markdown: 'See ^❶^.',
      plainText: 'See [1].',
    });
    expect(citations.sourceNumberById.get('aaaa1111-1')).toBe(1);
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

    const citations = resolveMessageCitations(parts);

    expect(citations.textByPartIndex.get(1)).toEqual({
      markdown: 'Second ^❶^, first ^❷^.',
      plainText: 'Second [1], first [2].',
    });
    expect(citations.sourceNumberById).toEqual(
      new Map([
        ['aaaa1111-1', 2],
        ['aaaa1111-2', 1],
      ]),
    );
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

    expect(resolveMessageCitations(parts).textByPartIndex.get(1)?.markdown).toBe(
      '`[cite:aaaa1111-1]` [cite:missing] ^❶^',
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

    const citations = resolveMessageCitations(parts);

    expect(citations.textByPartIndex.get(2)?.plainText).toBe('A [1] B [1]');
    expect(citations.sourceNumberById).toEqual(
      new Map([
        ['aaaa1111-1', 1],
        ['bbbb2222-1', 1],
      ]),
    );
  });
});
