import { hasMultimodalContent, mcpResultToTextSummary } from '../mcpResult';

describe('mcpResultToTextSummary', () => {
  it('returns text content verbatim', () => {
    expect(mcpResultToTextSummary({ content: [{ text: 'hello', type: 'text' }] })).toBe('hello');
  });

  it('replaces image/audio with placeholders', () => {
    expect(mcpResultToTextSummary({ content: [{ mimeType: 'image/png', type: 'image' }] })).toBe(
      '[Image: image/png, delivered to user]',
    );
    expect(mcpResultToTextSummary({ content: [{ mimeType: 'audio/mp3', type: 'audio' }] })).toBe(
      '[Audio: audio/mp3, delivered to user]',
    );
  });

  it('uses resource text but placeholders blobs', () => {
    expect(
      mcpResultToTextSummary({
        content: [{ resource: { text: 'doc body', uri: 'file://a' }, type: 'resource' }],
      }),
    ).toBe('doc body');
    expect(
      mcpResultToTextSummary({
        content: [{ resource: { blob: 'AAAA', mimeType: 'application/pdf' }, type: 'resource' }],
      }),
    ).toContain('[Resource: application/pdf');
  });

  it('joins multiple parts with newlines', () => {
    expect(
      mcpResultToTextSummary({
        content: [
          { text: 'line1', type: 'text' },
          { text: 'line2', type: 'text' },
        ],
      }),
    ).toBe('line1\nline2');
  });

  it('JSON-stringifies content-less or unknown results', () => {
    expect(mcpResultToTextSummary({ isError: true })).toBe('{"isError":true}');
    expect(mcpResultToTextSummary({ content: [{ type: 'weird' }] })).toBe('{"type":"weird"}');
  });
});

describe('hasMultimodalContent', () => {
  it('detects images, audio, and blob resources', () => {
    expect(hasMultimodalContent({ content: [{ type: 'image' }] })).toBe(true);
    expect(hasMultimodalContent({ content: [{ resource: { blob: 'x' }, type: 'resource' }] })).toBe(
      true,
    );
  });

  it('is false for text-only content', () => {
    expect(hasMultimodalContent({ content: [{ text: 'a', type: 'text' }] })).toBe(false);
  });
});
