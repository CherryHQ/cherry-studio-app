import { mcpResultToTextSummary, normalizeMcpResult } from '../mcpResult';

describe('mcpResultToTextSummary', () => {
  it('returns text content verbatim', () => {
    expect(mcpResultToTextSummary({ content: [{ text: 'hello', type: 'text' }] })).toBe('hello');
  });

  it('describes image delivery and unavailable audio previews accurately', () => {
    expect(
      mcpResultToTextSummary({
        content: [{ data: 'AAAA', mimeType: 'image/png', type: 'image' }],
      }),
    ).toBe('[Image: image/png, delivered to user]');
    expect(mcpResultToTextSummary({ content: [{ mimeType: 'audio/mp3', type: 'audio' }] })).toBe(
      '[Audio: audio/mp3, preview unavailable in app]',
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
        content: [
          {
            resource: {
              blob: 'AAAA',
              mimeType: 'application/pdf',
              uri: 'file://document.pdf',
            },
            type: 'resource',
          },
        ],
      }),
    ).toBe('[Resource: application/pdf, uri=file://document.pdf, preview unavailable in app]');
  });

  it('describes resource links', () => {
    expect(
      mcpResultToTextSummary({
        content: [{ mimeType: 'text/html', type: 'resource_link', uri: 'https://example.com' }],
      }),
    ).toBe('[Resource link: text/html, uri=https://example.com]');
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

  it('says so when there is no result at all', () => {
    // `JSON.stringify(undefined)` is undefined, and an empty string would read
    // to the model as a successful empty answer.
    expect(mcpResultToTextSummary(undefined)).toBe('[MCP tool returned no result]');
  });
});

describe('normalizeMcpResult', () => {
  it('normalizes every supported content type', () => {
    expect(
      normalizeMcpResult({
        content: [
          { text: 'plain text', type: 'text' },
          { data: 'AAAA', mimeType: 'image/png', type: 'image' },
          { data: 'BBBB', mimeType: 'audio/mp3', type: 'audio' },
          { resource: { text: 'resource body', uri: 'file://text' }, type: 'resource' },
          {
            resource: { blob: 'CCCC', mimeType: 'application/pdf', uri: 'file://blob' },
            type: 'resource',
          },
          { mimeType: 'text/html', type: 'resource_link', uri: 'https://example.com' },
        ],
      }),
    ).toEqual({
      content: [
        { kind: 'text', text: 'plain text' },
        { data: 'AAAA', kind: 'image', mimeType: 'image/png' },
        { kind: 'audio', mimeType: 'audio/mp3' },
        { kind: 'text', text: 'resource body' },
        { kind: 'resource', mimeType: 'application/pdf', uri: 'file://blob' },
        { kind: 'resource-link', mimeType: 'text/html', uri: 'https://example.com' },
      ],
      isMissing: false,
    });
  });

  it('keeps unknown content visible as JSON', () => {
    expect(normalizeMcpResult({ content: [{ payload: { value: 1 }, type: 'future' }] })).toEqual({
      content: [{ kind: 'text', text: '{"payload":{"value":1},"type":"future"}' }],
      isMissing: false,
    });
  });
});
