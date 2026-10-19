import type { CherryMessagePart } from '@/shared/data/types/message';

import { resolveMessageCitations } from '../citations';

describe('resolveMessageCitations', () => {
  test('makes native provider citations clickable while keeping copied text readable', () => {
    const parts: CherryMessagePart[] = [
      { type: 'text', text: 'Answer [cite:native-1]' },
      {
        type: 'source-url',
        sourceId: 'native-1',
        url: 'https://example.com/a',
        providerMetadata: { cherry: { nativeWeb: true } },
      },
    ];
    expect(resolveMessageCitations(parts).textByPartIndex.get(0)).toEqual({
      markdown: 'Answer [❶](cite:https%3A%2F%2Fexample.com%2Fa)',
      plainText: 'Answer [1]',
    });
  });
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
      markdown: 'See [❶](cite:https%3A%2F%2Fcherry-ai.com).',
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
      markdown:
        'Second [❶](cite:https%3A%2F%2Fb.example), first [❷](cite:https%3A%2F%2Fa.example).',
      plainText: 'Second [1], first [2].',
    });
    expect(citations.sourceNumberById).toEqual(
      new Map([
        ['aaaa1111-1', 2],
        ['aaaa1111-2', 1],
      ]),
    );
  });

  test('renders consecutive search citations as separate links without literal carets', () => {
    const parts = [
      {
        output: [
          { id: 'result-1', title: 'A', url: 'https://a.example' },
          { id: 'result-2', title: 'B', url: 'https://b.example' },
        ],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      { text: 'Answer [cite:result-1][cite:result-2].', type: 'text' },
    ] as CherryMessagePart[];

    expect(resolveMessageCitations(parts).textByPartIndex.get(1)).toEqual({
      markdown: 'Answer [❶](cite:https%3A%2F%2Fa.example)[❷](cite:https%3A%2F%2Fb.example).',
      plainText: 'Answer [1][2].',
    });
  });

  test('keeps citations without URLs readable without inventing links or caret delimiters', () => {
    const parts = [
      {
        output: [
          { id: 'result-1', title: 'A', content: 'First excerpt' },
          { id: 'result-2', title: 'B', content: 'Second excerpt' },
        ],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-kb_search',
      },
      { text: 'Answer [cite:result-1][cite:result-2].', type: 'text' },
    ] as CherryMessagePart[];

    expect(resolveMessageCitations(parts).textByPartIndex.get(1)).toEqual({
      markdown: 'Answer ❶❷.',
      plainText: 'Answer [1][2].',
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

    expect(resolveMessageCitations(parts).textByPartIndex.get(1)?.markdown).toBe(
      '`[cite:aaaa1111-1]` [cite:missing] [❶](cite:https%3A%2F%2Fa.example)',
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
