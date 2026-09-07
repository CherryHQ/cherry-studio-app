import {
  createToolResultPreview,
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

  it('shares a 4,000-character preview budget across text and JSON while keeping full copy text', () => {
    const contents: ToolResultContent[] = [
      { kind: 'text', content: 'a'.repeat(3_990) },
      { kind: 'json', value: { answer: 'b'.repeat(100), tail: 'original tail' } },
      { kind: 'text', content: 'hidden final block' },
    ];
    const preview = createToolResultPreview(contents);
    const previewText = getToolResultCopyText(preview.contents);

    expect(preview.isTruncated).toBe(true);
    expect(preview.contents).toHaveLength(2);
    expect(preview.contents[1]).toMatchObject({ kind: 'code', language: 'json' });
    expect(previewText).toHaveLength(4_002); // Two-character separator is added only for copying.
    expect(previewText).not.toContain('original tail');
    expect(previewText).not.toContain('hidden final block');
    expect(getToolResultCopyText(contents)).toContain('original tail');
    expect(getToolResultCopyText(contents)).toContain('hidden final block');
  });

  it('leaves short and exact-limit output complete', () => {
    for (const text of ['Short result', 'x'.repeat(4_000)]) {
      const contents: ToolResultContent[] = [{ kind: 'text', content: text }];
      expect(createToolResultPreview(contents)).toEqual({ contents, isTruncated: false });
    }
  });

  it('does not split an emoji at the preview boundary or include image data in text copies', () => {
    const image = { kind: 'image', data: 'image-payload', mimeType: 'image/png' } as const;
    const contents: ToolResultContent[] = [
      { kind: 'text', content: `${'a'.repeat(3_999)}😀tail` },
      image,
    ];
    const preview = createToolResultPreview(contents);

    expect(preview.contents).toEqual([{ kind: 'text', content: 'a'.repeat(3_999) }, image]);
    expect(preview.isTruncated).toBe(true);
    expect(getToolResultCopyText(contents)).toBe(`${'a'.repeat(3_999)}😀tail`);
  });

  it('does not serialize JSON blocks once the preview budget is exhausted', () => {
    const toJSON = jest.fn(() => 'hidden output');
    const contents: ToolResultContent[] = [
      { kind: 'text', content: 'a'.repeat(4_000) },
      { kind: 'json', value: { toJSON } },
    ];
    const preview = createToolResultPreview(contents);

    expect(preview.contents).toHaveLength(1);
    expect(preview.isTruncated).toBe(true);
    expect(toJSON).not.toHaveBeenCalled();
    expect(getToolResultCopyText(contents)).toContain('hidden output');
  });
});
