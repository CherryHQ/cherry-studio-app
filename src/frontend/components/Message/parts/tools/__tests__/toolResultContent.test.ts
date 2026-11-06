import {
  formatToolResultJson,
  getToolResultCopyText,
  parseJsonToolResultText,
  type ToolResultContent,
} from '../toolResultContent';

describe('tool result content helpers', () => {
  it('distinguishes JSON text from ordinary text, including JSON null', () => {
    expect(parseJsonToolResultText('plain text')).toBeNull();
    expect(parseJsonToolResultText('null')).toEqual({ value: null });
    expect(parseJsonToolResultText('{"answer":42}')).toEqual({ value: { answer: 42 } });
  });

  it('formats structured values and falls back for circular objects', () => {
    expect(formatToolResultJson({ answer: 42 })).toBe('{\n  "answer": 42\n}');

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(formatToolResultJson(circular)).toBe('[object Object]');
  });

  it('copies every result block without a length budget', () => {
    const first = 'a'.repeat(5_000);
    const json = { answer: 'b'.repeat(5_000), tail: 'original tail' };
    const contents: ToolResultContent[] = [
      { kind: 'text', content: first },
      { kind: 'json', value: json },
      { kind: 'text', content: 'final block' },
    ];
    expect(getToolResultCopyText(contents)).toBe(
      [first, JSON.stringify(json, null, 2), 'final block'].join('\n\n'),
    );
  });

  it('preserves emoji and trailing newlines without copying image data', () => {
    const text = `${'a'.repeat(3_999)}😀tail\n\n`;
    expect(
      getToolResultCopyText([
        { kind: 'text', content: text },
        { kind: 'image', data: 'image-payload', mimeType: 'image/png' },
      ]),
    ).toBe(text);
  });
});
