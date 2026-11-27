import type { CherryMessagePart } from '@/shared/data/types/message';
import { speakableText } from '@/shared/utils/speechText';

import {
  citationIds,
  conversationCitationSources,
  resolveMessageCitations,
  stripMessageCitations,
  type CitationSource,
} from '../messageCitations';

describe('resolveMessageCitations', () => {
  test('makes native provider citations clickable while retaining plain-text numbering', () => {
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

  test.each([
    ['https://example.com/a)b', 'https%3A%2F%2Fexample.com%2Fa%29b'],
    ['https://example.com/a(b', 'https%3A%2F%2Fexample.com%2Fa%28b'],
    ['https://example.com/a(b)', 'https%3A%2F%2Fexample.com%2Fa%28b%29'],
    [
      'https://example.com/search?q=a(b)#section)c',
      'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Da%28b%29%23section%29c',
    ],
    ['https://example.com/a%28b%29', 'https%3A%2F%2Fexample.com%2Fa%2528b%2529'],
  ])('keeps URL parentheses inside the citation link: %s', (url, target) => {
    const parts = [
      { type: 'source-url', sourceId: 'result-1', url },
      { type: 'text', text: 'Answer [cite:result-1].' },
    ] satisfies CherryMessagePart[];

    expect(resolveMessageCitations(parts).textByPartIndex.get(1)).toEqual({
      markdown: `Answer [❶](cite:${target}).`,
      plainText: 'Answer [1].',
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

describe('stripMessageCitations', () => {
  const sources = [{ id: 'known', title: 'Confirmed source' }];
  const partsWithText = (text: string): CherryMessagePart[] => [
    { type: 'source-url', sourceId: 'citation-0', url: 'https://example.com' },
    { type: 'text', text },
  ];
  const strip = (text: string) =>
    stripMessageCitations(partsWithText(text), sources).get(1) ?? text;

  test.each([
    ['[Details](https://example.com)', ''],
    ['[Details][defined]', '\n\n[defined]: https://example.com'],
  ])('resolves and strips confirmed named markers adjacent to %s', (link, definition) => {
    const text = `See [cite:known]${link}.${definition}`;
    const stripped = strip(text);
    expect(stripped).toBe(`See ${link}.${definition}`);
    expect(speakableText(stripped)).toBe('See Details.');
    expect(resolveMessageCitations(partsWithText(text), sources).textByPartIndex.get(1)).toEqual({
      markdown: `See ❶${link}.${definition}`,
      plainText: `See [1]${link}.${definition}`,
    });

    // Baseline treats numeric [1][Details] identically to unresolved [1][ref] in display and speech.
    const numeric = `See [1]${link}.${definition}`;
    expect(strip(numeric)).toBe(numeric);
    expect(resolveMessageCitations(partsWithText(numeric), sources).textByPartIndex.get(1)).toEqual(
      {
        markdown: numeric,
        plainText: numeric,
      },
    );
  });

  test('preserves confirmed citations glued to prose parentheses, unfinished brackets, and table pipes', () => {
    const tableSources: CitationSource[] = [
      { id: 'a', title: 'Source A', url: 'https://a.example' },
      { id: 'b', title: 'Source B', url: 'https://b.example' },
    ];
    const run = (text: string) => ({
      resolved: resolveMessageCitations([{ type: 'text', text }], tableSources).textByPartIndex.get(
        0,
      ),
      stripped: stripMessageCitations([{ type: 'text', text }], tableSources).get(0),
    });

    const parenthesized = run('结果[cite:a](2024)。补充[cite:b]。');
    expect(parenthesized.resolved).toEqual({
      markdown:
        '结果[❶](cite:https%3A%2F%2Fa.example)(2024)。补充[❷](cite:https%3A%2F%2Fb.example)。',
      plainText: '结果[1](2024)。补充[2]。',
    });
    expect(parenthesized.stripped).toBe('结果(2024)。补充。');

    const adjacentBracket = run('结果[cite:a][待核实]');
    expect(adjacentBracket.resolved).toEqual({
      markdown: '结果[❶](cite:https%3A%2F%2Fa.example)[待核实]',
      plainText: '结果[1][待核实]',
    });
    expect(adjacentBracket.stripped).toBe('结果[待核实]');

    const tableRow = run('| [ | [cite:a] ](https://example.test) |\n| --- | --- |');
    expect(tableRow.resolved).toEqual({
      markdown: '| [ | [❶](cite:https%3A%2F%2Fa.example) ](https://example.test) |\n| --- | --- |',
      plainText: '| [ | [1] ](https://example.test) |\n| --- | --- |',
    });
    expect(tableRow.stripped).toBe('| [ |](https://example.test) |\n| --- | --- |');
  });

  test('uses confirmed native, provider and tool sources while retaining unknown IDs', () => {
    const text = [
      'Start [1][cite:known].',
      'Pair [cite:known, missing, cite:also-missing], then [5].',
      'Provider citecitation-0known and unknown citeknownmissing.',
      'Tool [cite:tool-source].',
    ].join('\n');
    const stripped = stripMessageCitations(
      [
        { type: 'source-url', sourceId: 'citation-0', url: 'https://example.com' },
        {
          type: 'tool-kb_search',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'lookup' },
          output: [{ id: 'tool-source', title: 'Tool result' }],
        },
        { type: 'text', text },
      ],
      sources,
    );
    expect(stripped.get(2)).toBe(
      'Start.\nPair [cite:missing, also-missing], then [5].\n' +
        'Provider and unknown citeknownmissing.\nTool.',
    );
  });

  test('preserves escapes, code and Markdown links, including citations inside link labels and targets', () => {
    const protectedLines = [
      String.raw`Literal \[1\] and \[cite:known\] and [cite:missing].`,
      '`[1]  [cite:known]` and [1](https://link.example) and [1][ref].',
      '[Label [nested [1]] and `[1]`](https://example.com/a_(b(c))/[cite:known]).',
      '[1][2] and [2].',
      '',
      '[2]: https://example.com/reference',
      '',
      '> ```',
      '> [1] [cite:known]',
      '> ```',
      '',
      '    [1] [cite:known]',
    ];
    const prefix = protectedLines.join('\n');
    expect(strip(prefix + '\n\nCited [1] and [cite:known].')).toBe(prefix + '\n\nCited and.');
  });

  test('handles CRLF multiline links without shifting later citation edits', () => {
    const input = '[Label [1]](\r\nhttps://example.test) and [cite:known]\r\nwith [1].';
    expect(strip(input)).toBe('[Label [1]](\r\nhttps://example.test) and\r\nwith.');
  });

  test.each(['[1]: some note', '[1](not a url)', '[1](https://example.com'])(
    'preserves invalid or incomplete Markdown link syntax in %s',
    (literal) => {
      expect(strip(`${literal}\n\nCited [1].`)).toBe(`${literal}\n\nCited.`);
      expect(
        resolveMessageCitations(partsWithText(literal), sources).textByPartIndex.get(1)?.markdown,
      ).toBe(literal);
    },
  );

  test('strips only targeted text parts using sources from the full message', () => {
    const parts: CherryMessagePart[] = [
      { type: 'text', text: 'Process [1] [cite:known].' },
      { type: 'source-url', sourceId: 'citation-0', url: 'https://example.com' },
      { type: 'text', text: 'Answer [1] [cite:known].' },
    ];

    expect(stripMessageCitations(parts, sources, new Set([2]))).toEqual(new Map([[2, 'Answer.']]));
  });

  test('repairs horizontal whitespace at contiguous deletion points only', () => {
    const input = [
      '说明 [cite:known] 。',
      'word [cite:known], next',
      'word\t[cite:known]   next  unchanged',
      'word[cite:known][1]next',
      'word [cite:known] : next',
      '文本　[cite:known]　，继续',
      ' [cite:known] start',
      'end [cite:known]  ',
      ' [cite:known] [1]  ',
      '| left  | right |',
    ];
    expect(strip(input.join('\n'))).toBe(
      '说明。\nword, next\nword next  unchanged\nword next\nword: next\n文本，继续\nstart\nend\n\n| left  | right |',
    );
  });
});

describe('conversation citation scope', () => {
  test('uses earlier confirmed tool IDs without leaking future or native source IDs', () => {
    const source = { id: 'lookup-1', title: 'Earlier', url: 'https://example.com' };
    const registry = conversationCitationSources([
      { id: 'early', parts: [{ type: 'text', text: '[cite:future-1]' }], sources: [source] },
      {
        id: 'native',
        parts: [{ type: 'source-url', sourceId: 'native-1', url: 'https://native.example' }],
        sources: [],
      },
      {
        id: 'answer',
        parts: [{ type: 'text', text: '[cite:lookup-1] [cite:native-1]' }],
        sources: [{ ...source, id: 'future-1' }],
      },
    ]);
    expect(registry.get('early')).toEqual([source]);
    expect(registry.get('answer')?.map((item) => item.id)).toEqual(['future-1', 'lookup-1']);
  });

  test('resolves known provider and multi-ID marks, preserving code and unknown marks', () => {
    const parts: CherryMessagePart[] = [
      { type: 'source-url', sourceId: 'turn0search0', url: 'https://example.com' },
      {
        type: 'text',
        text: '[1] citeturn0search0 [cite:turn0search0, missing] `[1]` citeunknown',
      },
    ];
    expect(resolveMessageCitations(parts).textByPartIndex.get(1)?.plainText).toBe(
      '[1] [1] [1][cite:missing] `[1]` citeunknown',
    );
    expect(citationIds(parts)).toEqual(['turn0search0', 'missing', 'unknown']);
  });

  test('maps 0-based provider citation IDs and consecutive numeric markers accurately', () => {
    const parts: CherryMessagePart[] = [
      { type: 'source-url', sourceId: 'citation-2', url: 'https://third.example' },
      { type: 'source-url', sourceId: 'citation-0', url: 'https://first.example' },
      { type: 'source-url', sourceId: 'citation-1', url: 'https://second.example' },
      {
        type: 'text',
        text: 'Claim [1][2] and [3], skip [4], [1](https://link.example), [1][ref].',
      },
    ];
    const resolved = resolveMessageCitations(parts);
    expect(resolved.textByPartIndex.get(3)).toEqual({
      markdown:
        'Claim [❶](cite:https%3A%2F%2Ffirst.example)[❷](cite:https%3A%2F%2Fsecond.example) and [❸](cite:https%3A%2F%2Fthird.example), skip [4], [1](https://link.example), [1][ref].',
      plainText: 'Claim [1][2] and [3], skip [4], [1](https://link.example), [1][ref].',
    });

    const sparse: CherryMessagePart[] = [
      { type: 'source-url', sourceId: 'citation-0', url: 'https://first.example' },
      { type: 'source-url', sourceId: 'citation-2', url: 'https://third.example' },
      { type: 'text', text: 'Only [2] literal and [3] cited.' },
    ];
    const sparseResolved = resolveMessageCitations(sparse);
    expect(sparseResolved.textByPartIndex.get(2)).toEqual({
      markdown: 'Only [2] literal and [❶](cite:https%3A%2F%2Fthird.example) cited.',
      plainText: 'Only [2] literal and [1] cited.',
    });
  });
});
