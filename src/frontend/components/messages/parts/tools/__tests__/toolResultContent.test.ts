import {
  formatToolResultJson,
  parseJsonToolResultText,
  truncateToolResultText,
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

  it('truncates one content item with its original character count', () => {
    expect(truncateToolResultText('abcdef', 3, (count) => `cut ${count}`)).toBe('abc\n... cut 6');
  });
});
