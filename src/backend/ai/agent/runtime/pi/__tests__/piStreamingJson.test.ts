const { parseStreamingJson, parseJsonWithRepair } = jest.requireActual<{
  parseStreamingJson: (input: string) => unknown;
  parseJsonWithRepair: (input: string) => unknown;
}>(`${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/utils/json-parse.js`);

afterEach(() => jest.restoreAllMocks());

describe('Pi streaming JSON patch', () => {
  test('parses a large file prefix without per-character escape repair in JavaScript', () => {
    const content = JSON.stringify({ items: Array.from({ length: 8_000 }, (_, i) => `item-${i}`) });
    const input = JSON.stringify({ filename: 'large.json', content }).slice(0, -2);
    // The old repair pass calls codePointAt for every unescaped string character,
    // even though repairing escapes cannot close this unfinished object.
    const characterReads = jest.spyOn(String.prototype, 'codePointAt');

    expect(parseStreamingJson(input)).toEqual({ filename: 'large.json', content });
    expect(characterReads).not.toHaveBeenCalled();
  });

  test.each([
    ['escaped quotes', String.raw`{"content":"say \"hi\"`, { content: 'say "hi"' }],
    ['complete backslash', String.raw`{"content":"C:\\`, { content: 'C:\\' }],
    ['unfinished escape', '{"content":"code\\', { content: 'code' }],
    ['unfinished unicode', String.raw`{"content":"code\u12`, { content: 'code' }],
    ['complete unicode', String.raw`{"content":"\u263A`, { content: '☺' }],
    ['surrogate pair', String.raw`{"content":"\uD83D\uDE00`, { content: '😀' }],
    ['filename prefix', '{"filename":"dem', { filename: 'dem' }],
    ['unfinished property', '{"filena', {}],
    ['nested object', '{"nested":{"content":"body', { nested: { content: 'body' } }],
    ['array', '[{"content":"body', [{ content: 'body' }]],
    ['trailing whitespace', ' {"content":"body  ', { content: 'body' }],
  ])('preserves partial parsing for %s', (_name, input, expected) => {
    expect(parseStreamingJson(input as string)).toEqual(expected);
  });

  test.each([
    { filename: 'file.json', content: '正文😀\n  "quoted"\nC:\\path\\file  ' },
    { file_entry_id: 'file', old_string: 'before', new_string: 'after\n' },
    { nested: [{ count: 3, flag: true }], value: null },
  ])('keeps complete tool arguments authoritative: %p', (input) => {
    const encoded = JSON.stringify(input);
    expect(parseStreamingJson(encoded)).toEqual(input);
    expect(parseJsonWithRepair(encoded)).toEqual(input);
  });

  test.each([
    ['{"content":"line\nnext"}', { content: 'line\nnext' }],
    [String.raw`{"content":"C:\path\q"}`, { content: 'C:\\path\\q' }],
  ])('retains repair of malformed complete strings: %p', (input, expected) => {
    expect(parseStreamingJson(input as string)).toEqual(expected);
    expect(parseJsonWithRepair(input as string)).toEqual(expected);
  });
});
