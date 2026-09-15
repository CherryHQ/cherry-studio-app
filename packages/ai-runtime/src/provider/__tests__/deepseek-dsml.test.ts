import {
  createDeepseekDsmlParser,
  DeepseekDsmlError,
  type DeepseekDsmlPart,
} from '../deepseek-dsml';

// Full single-bar response shape observed in Desktop #19312/#19921.
const CALL =
  '<｜DSML｜tool_calls><｜DSML｜invoke name="mcp__notes__save"><｜DSML｜parameter name="text" string="true">第一行\nsecond line</｜DSML｜parameter><｜DSML｜parameter name="options" string="false">{"overwrite":false,"count":2,"tags":["a"],"parent":null}</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>';

function parse(chunks: string[], tools: { name: string }[] = []) {
  const parser = createDeepseekDsmlParser(tools);
  return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.finish()];
}

function text(parts: DeepseekDsmlPart[]) {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

describe('DeepSeek DSML protocol', () => {
  test.each([
    ['single bar', CALL],
    ['double bar', CALL.replaceAll('｜', '｜｜')],
    ['tool invoke', CALL.replaceAll('DSML｜invoke', 'DSML｜tool_invoke')],
    ['tool', CALL.replaceAll('DSML｜invoke', 'DSML｜tool')],
  ])('recovers %s calls across every character boundary', (_variant, source) => {
    const parts = parse([...`before ${source} after`]);
    expect(text(parts)).toBe('before  after');
    expect(parts.filter((part) => part.type === 'tool-call')).toEqual([
      {
        type: 'tool-call',
        toolCallId: expect.stringMatching(/^dsml_/),
        toolName: 'mcp__notes__save',
        input: {
          text: '第一行\nsecond line',
          options: { overwrite: false, count: 2, tags: ['a'], parent: null },
        },
      },
    ]);
  });

  test('recovers repeated blocks with distinct identities and preserves ordinary punctuation', () => {
    const parts = parse([`a ${CALL} b ${CALL} c <`]);
    const calls = parts.filter((part) => part.type === 'tool-call');
    expect(text(parts)).toBe('a  b  c <');
    expect(calls).toHaveLength(2);
    expect(calls[0].toolCallId).not.toBe(calls[1].toolCallId);
    expect(parse(['Compare < 5; DSML is a protocol.'])).toEqual([
      { type: 'text', text: 'Compare < 5; DSML is a protocol.' },
    ]);
  });

  test.each(['ToolSearch', 'tool_search'])(
    'maps the search-loop variant to the available %s',
    (name) => {
      const parts = parse(
        [...'<｜DSML｜Tool loop><search>notes save</search></｜DSML｜Tool>'],
        [{ name }],
      );
      expect(parts).toEqual([
        expect.objectContaining({ toolName: name, input: { query: 'notes save' } }),
      ]);
      expect(() => parse(['<｜DSML｜Tool loop><search>notes</search></｜DSML｜Tool>'])).toThrow(
        DeepseekDsmlError,
      );
    },
  );

  test('resolves only unambiguous request-scoped tool names', () => {
    const source = CALL.replace('mcp__notes__save', 'MCP__NOTES__SAVE');
    expect(parse([source], [{ name: 'mcp__notes__save' }])).toEqual([
      expect.objectContaining({ toolName: 'mcp__notes__save' }),
    ]);
    expect(parse([source], [{ name: 'OtherTool' }])).toEqual([
      expect.objectContaining({ toolName: 'MCP__NOTES__SAVE' }),
    ]);
    expect(parse([source], [{ name: 'mcp__notes__save' }, { name: 'Mcp__Notes__Save' }])).toEqual([
      expect.objectContaining({ toolName: 'MCP__NOTES__SAVE' }),
    ]);
  });

  test.each([
    '</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>',
    '<｜DSML｜tool_calls>not an invoke</｜DSML｜tool_calls>',
    '<｜DSML｜tool_calls><｜DSML｜invoke name="save">',
    '<｜DSML｜tool_calls',
    '<|dsml|>',
    CALL.replace(
      '</｜DSML｜tool_calls>',
      '<｜DSML｜invoke name="lost">missing</｜DSML｜tool_calls>',
    ),
    CALL.replace('{"overwrite":false,"count":2,"tags":["a"],"parent":null}', '{"broken":'),
    CALL.replace(
      '</｜DSML｜invoke>',
      '<｜DSML｜parameter name="lost" string="true">missing</｜DSML｜invoke>',
    ),
  ])('rejects unrecoverable markup without inventing arguments: %s', (source) => {
    expect(() => parse([...source])).toThrow(DeepseekDsmlError);
  });

  test('bounds an unterminated block and rejects duplicate parameter names', () => {
    expect(() => parse(['<｜DSML｜tool_calls>', 'x'.repeat(64 * 1024 + 1)])).toThrow(
      DeepseekDsmlError,
    );
    expect(() => parse([CALL.replace('name="options"', 'name="text"')])).toThrow(DeepseekDsmlError);
  });

  test('preserves special JSON keys as own properties without changing the object prototype', () => {
    const parts = parse([
      '<｜DSML｜tool_calls><｜DSML｜invoke name="save"><｜DSML｜parameter name="__proto__" string="false">{"value":1}</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>',
    ]);
    const call = parts.find((part) => part.type === 'tool-call')!;
    expect(Object.hasOwn(call.input, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(call.input)).toBe(Object.prototype);
    expect(JSON.stringify(call.input)).toBe('{"__proto__":{"value":1}}');
  });
});
