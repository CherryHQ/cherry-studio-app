import { validateToolArguments } from '@earendil-works/pi-ai/utils/validation';

const { ToolCallArgumentsStream } = jest.requireActual<
  typeof import('@earendil-works/pi-ai/utils/streaming-json')
>(`${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/utils/streaming-json.js`);

describe('Pi streaming tool arguments', () => {
  test('previews a large file prefix containing serialized JSON', () => {
    const content = JSON.stringify({ items: Array.from({ length: 8_000 }, (_, i) => `item-${i}`) });
    const input = JSON.stringify({ filename: 'large.json', content }).slice(0, -2);
    const stream = new ToolCallArgumentsStream();

    expect(stream.append(input)).toEqual({ filename: 'large.json', content });
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
    ['array', '{"items":[{"content":"body', { items: [{ content: 'body' }] }],
    ['trailing whitespace', ' {"content":"body  ', { content: 'body  ' }],
  ])('preserves partial parsing for %s', (_name, input, expected) => {
    const stream = new ToolCallArgumentsStream();
    expect(stream.append(input as string)).toEqual(expected);
  });

  test.each([
    { filename: 'file.json', content: '正文😀\n  "quoted"\nC:\\path\\file  ' },
    { file_entry_id: 'file', old_string: 'before', new_string: 'after\n' },
    { nested: [{ count: 3, flag: true }], value: null },
  ])('keeps complete tool arguments authoritative: %p', (input) => {
    const encoded = JSON.stringify(input);
    const stream = new ToolCallArgumentsStream();
    expect(stream.append(encoded)).toEqual(input);
    expect(stream.finish()).toEqual({ arguments: input });
  });

  test.each([
    ['{"content":"line\nnext"}', { content: 'line\nnext' }],
    [String.raw`{"content":"C:\path\q"}`, { content: 'C:\\path\\q' }],
    [
      String.raw`{"content":"\usepackage{amsmath}","filename":"document.tex"}`,
      { content: '\\usepackage{amsmath}', filename: 'document.tex' },
    ],
  ])('retains repair of malformed complete strings: %p', (input, expected) => {
    const stream = new ToolCallArgumentsStream();
    expect(stream.append(input as string)).toEqual(expected);
    expect(stream.finish()).toEqual({ arguments: expected });
  });

  test('keeps the streamed preview but refuses a truncated completed tool call', () => {
    const input = '{"filename":"notes.txt","content":"unfinished';
    const stream = new ToolCallArgumentsStream();
    expect(stream.append(input)).toEqual({ filename: 'notes.txt', content: 'unfinished' });
    const call = {
      type: 'toolCall' as const,
      id: 'write-file',
      name: 'write_file',
      ...stream.finish(),
    };
    expect(call.arguments).toEqual({});
    expect(call.argumentsError).toContain(input);
    expect(() =>
      validateToolArguments(
        { name: call.name, description: 'Write a file.', parameters: { type: 'object' } },
        call,
      ),
    ).toThrow('Invalid arguments for tool "write_file"');
  });
});

describe('Pi provider incremental tool arguments', () => {
  test('streams a 500 KB file and keeps earlier previews immutable', () => {
    const stream = new ToolCallArgumentsStream();
    const prefix = stream.append('{"filename":"large.txt","content":"first');
    const content = `first${'正文 😀 '.repeat(45_000)}`;
    const encoded = JSON.stringify({ filename: 'large.txt', content });
    expect(Buffer.byteLength(encoded)).toBeGreaterThan(500_000);
    for (let offset = stream.text.length; offset < encoded.length; offset += 1024)
      stream.append(encoded.slice(offset, offset + 1024));
    expect(prefix).toEqual({ filename: 'large.txt', content: 'first' });
    expect(stream.finish()).toEqual({ arguments: { filename: 'large.txt', content } });
  });

  test.each([
    [String.raw`{"content":"say \"hi\"`, 'say "hi"'],
    [String.raw`{"content":"code\u12`, 'code'],
    [String.raw`{"content":"\uD83D\uDE00`, '😀'],
    ['{"content":"body  ', 'body  '],
  ])('shows tolerant partial strings but rejects truncated final input: %s', (input, content) => {
    const stream = new ToolCallArgumentsStream();
    expect(stream.append(input)).toEqual({ content });
    expect(stream.finish()).toMatchObject({ arguments: {}, argumentsError: expect.any(String) });
  });

  test('accepts repaired complete strings and provider replacements without retaining old keys', () => {
    const stream = new ToolCallArgumentsStream();
    stream.append('{"old":"prefix');
    const input = String.raw`{"filename":"notes.tex","content":"\usepackage{amsmath}"}`;
    const replacement = stream.replace(input);
    expect(replacement.delta).toBeUndefined();
    expect(stream.finish()).toEqual({
      arguments: { filename: 'notes.tex', content: '\\usepackage{amsmath}' },
    });
    expect(stream.finish().arguments).not.toHaveProperty('old');
  });
});
