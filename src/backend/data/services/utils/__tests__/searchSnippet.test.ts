import { buildSearchSnippet, stripMarkdownFormatting, toSearchableText } from '../searchSnippet';

describe('searchable message text', () => {
  test.each([
    ['```tsx\n<View>hello</View>\n```', '<View>hello</View>\n'],
    ['~~~ts\nList<T>\n~~~', 'List<T>\n'],
    ['Use `List<T>` with **care**', 'Use List<T> with care'],
    ['``value `with` <T>``', 'value `with` <T>'],
    ['```tsx\n<View>unfinished', '<View>unfinished'],
    ['## C# examples\n`a * b * c`', 'C# examples\na * b * c'],
  ])('preserves code while stripping prose: %s', (source, expected) => {
    expect(stripMarkdownFormatting(source)).toBe(expected);
  });

  test('puts a late keyword into a compact single-line preview', () => {
    const source = `${'Unrelated introduction.\n'.repeat(20)}\nThe needle is here.\nMore detail.`;
    const snippet = buildSearchSnippet(source, ['needle'], 'substring');
    expect(snippet).toContain('needle');
    expect(snippet).not.toMatch(/[\r\n]/);
    expect(snippet.indexOf('needle')).toBeLessThanOrEqual(25);
    expect(snippet.length).toBeLessThanOrEqual(162);
  });

  test('indexes the visible text of text parts only', () => {
    expect(
      toSearchableText([
        { id: 'r', type: 'reasoning', text: 'hidden **reasoning**', state: 'done' },
        { id: 'a', type: 'text', text: '支持**多模态**', state: 'done' },
        { id: 'blank', type: 'text', text: '  ', state: 'done' },
        { id: 'b', type: 'text', text: '`List<T>` [docs](https://example.com)', state: 'done' },
      ]),
    ).toBe('支持多模态\nList<T> docs');
  });

  test('keeps matching code visible in the preview', () => {
    const text = toSearchableText([
      { id: 'code', type: 'text', text: '```tsx\n<View>hello</View>\n```', state: 'done' },
    ]);
    expect(buildSearchSnippet(text, ['<view>'], 'substring')).toBe('<View>hello</View>');
  });
});
