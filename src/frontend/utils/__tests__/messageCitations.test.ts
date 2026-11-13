import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  collectMessageCitationSources,
  normalizeCitationUrl,
  replaceCitationMarkers,
  resolveMessageCitations,
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

describe('shared citation boundary', () => {
  const source = (id: string, url = `https://${id}.example/x`) =>
    ({ type: 'source-url', sourceId: id, url }) as CherryMessagePart;
  const text = (value: string): CherryMessagePart => ({ type: 'text', text: value });
  const tool = (output: unknown, overrides: Record<string, unknown> = {}) =>
    ({
      type: 'dynamic-tool',
      toolName: 'web_search',
      state: 'output-available',
      output,
      ...overrides,
    }) as CherryMessagePart;
  const item = { id: '1', title: 'A', url: 'https://a' };

  test.each(['https://u:p@host/x', 'javascript:alert(1)', 'httpBAD', null, 4])(
    'rejects unsafe or invalid URL %s',
    (url) => {
      expect(normalizeCitationUrl(url)).toBeUndefined();
    },
  );
  test('accepts an absolute HTTP URL', () => {
    expect(normalizeCitationUrl('https://host/x')).toBe('https://host/x');
  });

  test('exposes sources and numbers while preserving fenced markers', () => {
    const result = resolveMessageCitations([source('s1'), text('```\n[cite:s1]\n```\n[cite:s1]')]);
    expect(result.sources).toEqual([
      { id: 's1', title: 'https://s1.example/x', url: 'https://s1.example/x', number: 1 },
    ]);
    expect(result.sourceNumberById.get('s1')).toBe(1);
    expect(result.textByPartIndex.get(1)?.plainText).toBe('```\n[cite:s1]\n```\n[1]');
  });

  test('aliases identical URLs to one object and number', () => {
    const result = resolveMessageCitations([
      source('a'),
      source('b', 'https://a.example/x'),
      text('[cite:a] [cite:b]'),
    ]);
    expect(result.sources).toHaveLength(1);
    expect(result.sourceById.get('a')).toBe(result.sourceById.get('b'));
    expect([...result.sourceNumberById.values()]).toEqual([1, 1]);
  });

  test('last occurrence of an ID wins and removes orphaned sources', () => {
    const result = resolveMessageCitations([
      source('a'),
      source('a', 'https://later.example/x'),
      text('[cite:a]'),
    ]);
    expect(result.sources).toEqual([
      { id: 'a', title: 'https://later.example/x', url: 'https://later.example/x', number: 1 },
    ]);
    expect(result.sourceById.get('a')?.url).toBe('https://later.example/x');
  });

  test('retains aliases when their original ID is overwritten', () => {
    const result = resolveMessageCitations([
      source('a'),
      source('b', 'https://a.example/x'),
      source('a', 'https://later.example/x'),
      text('[cite:a] [cite:b]'),
    ]);
    expect(result.sources.map(({ url, number }) => [url, number])).toEqual([
      ['https://a.example/x', 2],
      ['https://later.example/x', 1],
    ]);
  });

  test('unreferenced sources keep original order without consuming numbers', () => {
    const result = resolveMessageCitations([
      source('unused'),
      source('b'),
      source('a'),
      text('Process [cite:b]'),
      text('Final [cite:a]'),
    ]);
    expect(result.sources.map(({ id, number }) => [id, number])).toEqual([
      ['unused', undefined],
      ['b', 1],
      ['a', 2],
    ]);
    expect(result.sourceNumberById.has('unused')).toBe(false);
  });

  test('uses an explicit snapshot, including an empty one, without collecting', () => {
    const parts = [source('a'), text('[cite:a]')];
    expect(resolveMessageCitations(parts, []).sources).toEqual([]);
    expect(resolveMessageCitations(parts, []).textByPartIndex.get(1)?.plainText).toBe('[cite:a]');
    const snapshot = [{ id: 'a', title: 'Snapshot' }];
    expect(resolveMessageCitations(parts, snapshot).textByPartIndex.get(1)?.markdown).toBe('❶');
    expect(resolveMessageCitations(parts, snapshot)).toEqual(
      resolveMessageCitations(parts, snapshot),
    );
    expect(snapshot).toEqual([{ id: 'a', title: 'Snapshot' }]);
  });

  test('collects completed dynamic tools with exact names and builtin fallback', () => {
    expect(collectMessageCitationSources([tool({ results: [item] })])).toEqual([item]);
    expect(
      collectMessageCitationSources([
        tool([item], {
          toolName: undefined,
          toolRef: { source: 'builtin', capabilityId: 'web_search' },
        }),
      ]),
    ).toEqual([item]);
    for (const overrides of [
      { toolName: 'web_search_extra' },
      { state: 'output-error' },
      { state: 'input-available' },
      { toolName: '', toolRef: { source: 'builtin', capabilityId: 'web_search' } },
      { toolName: undefined, toolRef: { source: 'mcp', capabilityId: 'web_search' } },
    ])
      expect(collectMessageCitationSources([tool({ results: [item] }, overrides)])).toEqual([]);
  });

  test('unwraps schema-valid envelopes and rejects malformed envelopes without recursion', () => {
    for (const value of [[item], { results: [item] }, { details: { results: [item] } }]) {
      expect(collectMessageCitationSources([tool({ value, artifacts: [] })])).toEqual([item]);
    }
    for (const output of [
      { value: { results: [item] } },
      { value: [item], artifacts: 'invalid', results: [item] },
      { data: { results: [item] } },
      { content: [item] },
      { text: JSON.stringify([item]) },
      JSON.stringify([item]),
      'prose',
    ])
      expect(collectMessageCitationSources([tool(output)])).toEqual([]);
  });

  test('accepts exact static tool_invoke names and rejects unknown tools', () => {
    expect(
      collectMessageCitationSources([
        tool([item], {
          type: 'tool-tool_invoke',
          input: { name: 'web_search' },
        }),
      ]),
    ).toEqual([item]);
    expect(
      collectMessageCitationSources([
        tool([item], {
          type: 'tool-tool_invoke',
          input: { name: 'prefix_web_search' },
        }),
      ]),
    ).toEqual([]);
  });

  test('kb_read accepts one object without a URL and renders an unlinked number', () => {
    const result = resolveMessageCitations([
      tool({ id: 'kb', conceptId: 'Concept', pageContent: 'Body' }, { toolName: 'kb_read' }),
      text('[cite:kb]'),
    ]);
    expect(result.sources).toEqual([{ id: 'kb', title: 'Concept', content: 'Body', number: 1 }]);
    expect(result.textByPartIndex.get(1)).toEqual({ markdown: '❶', plainText: '[1]' });
  });

  test('validates IDs and rejects entries carrying invalid URLs', () => {
    expect(
      collectMessageCitationSources([
        tool([
          { id: '', title: 'empty' },
          { id: Infinity },
          { id: NaN },
          { id: 'bad', url: 'javascript:alert(1)' },
          { id: 'bad2', url: null },
          { id: 0, pageContent: 'zero' },
        ]),
        source('', 'https://valid.example'),
        source('bad', 'httpBAD'),
      ]),
    ).toEqual([{ id: '0', title: '', content: 'zero' }]);
  });

  test('keeps URL query and hash differences distinct', () => {
    const result = resolveMessageCitations([
      source('a', 'https://host/x?q=1#x'),
      source('b', 'https://host/x?q=2#x'),
      source('c', 'https://host/x?q=1#y'),
      text('[cite:a][cite:b][cite:c]'),
    ]);
    expect(result.sources).toHaveLength(3);
    expect([...result.sourceNumberById.values()]).toEqual([1, 2, 3]);
  });

  test('preserves walker code and escape boundaries in both formats', () => {
    const protectedText = [
      '~~~js\n[cite:x]\n~~~\n',
      '````\n```\n[cite:x]\n````\n',
      '    [cite:x]\n\t[cite:x]\n',
      '\\[cite:x]\n',
      '`first\n[cite:x]\nlast`\n',
      '``first `[cite:x]` last``\n',
      '> ~~~\n> [cite:x]\n> ~~~\n',
    ].join('');
    const sources = new Map([['x', { id: 'x', title: 'X', url: 'https://host/a(b)' }]]);
    const numbers = new Map([['x', 1]]);
    expect(
      replaceCitationMarkers(protectedText + '[cite:x] [cite:unknown]', {
        format: 'plain',
        numbers,
        sources,
      }),
    ).toBe(protectedText + '[1] [cite:unknown]');
    expect(
      replaceCitationMarkers(protectedText + '[cite:x]', {
        format: 'markdown',
        numbers,
        sources,
      }),
    ).toBe(protectedText + '[❶](cite:https%3A%2F%2Fhost%2Fa%28b%29)');
    const result = resolveMessageCitations([
      source('x'),
      text(protectedText),
      source('y'),
      text('[cite:y][cite:x]'),
    ]);
    expect([...result.sourceNumberById.entries()]).toEqual([
      ['x', 2],
      ['y', 1],
    ]);
  });
});

test('export format keeps URLs literal, unlinked numbers readable and code untouched', () => {
  const text = '[cite:a] [cite:kb] `[cite:a]`\n\n```md\n[cite:a]\n```';
  const url = 'https://example.com/a(b)?q=%28#x';
  const citations = resolveMessageCitations(
    [{ type: 'text', text }],
    [
      { id: 'a', title: 'A', url },
      { id: 'kb', title: 'Knowledge' },
    ],
  );
  expect(
    replaceCitationMarkers(text, {
      format: 'export',
      numbers: citations.sourceNumberById,
      sources: citations.sourceById,
    }),
  ).toBe(`[1](<${url}>) [2] \`[cite:a]\`\n\n\`\`\`md\n[cite:a]\n\`\`\``);
});

it.each(['\n', '\r\n'])('ends unclosed quote fences at the container boundary (%j)', (newline) => {
  const text = ['> ```', '> [cite:a]', '', 'Outside [cite:b]'].join(newline);
  const nested = ['> > ```', '> > [cite:a]', '> Outside [cite:b]'].join(newline);
  for (const value of [text, nested]) {
    const resolved = resolveMessageCitations(
      [{ type: 'text', text: value }],
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
    );
    expect(resolved.sourceNumberById.has('a')).toBe(false);
    expect(resolved.sourceNumberById.get('b')).toBe(1);
    expect(resolved.textByPartIndex.get(0)?.plainText).toBe(value.replace('[cite:b]', '[1]'));
  }
});

it.each([
  ['`[cite:a]` and ``[cite:a]`` [cite:b]', '`[cite:a]` and ``[cite:a]`` [1]'],
  ['`unclosed [cite:a]\n\nOutside [cite:b] `', '`unclosed [1]\n\nOutside [2] `'],
  ['- ```\n  [cite:a]\n\nOutside [cite:b]', '- ```\n  [cite:a]\n\nOutside [1]'],
])('respects inline and list code boundaries: %s', (text, expected) => {
  const resolved = resolveMessageCitations(
    [{ type: 'text', text }],
    [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ],
  );
  expect(resolved.textByPartIndex.get(0)?.plainText).toBe(expected);
});

it('keeps CRLF closed fences literal and numbers the following paragraph', () => {
  const text = '> ```\r\n> [cite:a]\r\n> ```\r\n\r\nOutside [cite:b]';
  const resolved = resolveMessageCitations(
    [{ type: 'text', text }],
    [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ],
  );
  expect(resolved.sourceNumberById.has('a')).toBe(false);
  expect(resolved.textByPartIndex.get(0)?.plainText).toBe(text.replace('[cite:b]', '[1]'));
});
