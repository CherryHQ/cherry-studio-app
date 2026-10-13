import { mcpModelTextOverflow, projectMcpModelContent } from '../mcpContent';

describe('MCP model projection', () => {
  it('keeps images in the image channel and excludes UI metadata and user-only content', () => {
    const projection = projectMcpModelContent({
      content: [
        { type: 'text', text: 'model-visible' },
        { type: 'text', text: 'user-only', annotations: { audience: ['user'] } },
        { type: 'image', data: 'AAAA', mimeType: 'image/png', _meta: { secret: 'image-ui-only' } },
      ],
      structuredContent: { count: 2, _meta: { secret: 'nested-ui-only' } },
      _meta: { secret: 'root-ui-only' },
    });
    expect(projection).toEqual([
      { type: 'text', text: 'model-visible' },
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      { type: 'text', text: '{"count":2}' },
    ]);
  });

  it('does not reintroduce user-only content through the empty-result fallback', () => {
    expect(
      JSON.stringify(
        projectMcpModelContent({
          content: [
            { type: 'text', text: 'private user view', annotations: { audience: ['user'] } },
          ],
          _meta: { html: 'private app' },
        }),
      ),
    ).not.toContain('private');
  });

  it('sends structured output once when the server also serialized it as text', () => {
    const structuredContent = { count: 2, items: [{ id: 'a' }] };
    expect(
      projectMcpModelContent({
        content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 'a' }], count: 2 }) }],
        structuredContent,
      }),
    ).toEqual([{ type: 'text', text: '{"items":[{"id":"a"}],"count":2}' }]);
    expect(
      projectMcpModelContent({
        content: [{ type: 'text', text: 'Found 2 items' }],
        structuredContent,
      }),
    ).toEqual([
      { type: 'text', text: 'Found 2 items' },
      { type: 'text', text: '{"count":2,"items":[{"id":"a"}]}' },
    ]);
  });

  it('states how much text was cut and offers the whole text for retention', () => {
    const result = {
      content: [
        { type: 'text', text: 'a'.repeat(60_000) },
        { type: 'text', text: 'b'.repeat(40_000) },
      ],
    };
    const projection = projectMcpModelContent(result, 'Read the rest elsewhere.');
    expect(projection.at(-1)).toEqual({
      type: 'text',
      text: '[MCP text truncated: the first 65536 of 100000 characters are shown. Read the rest elsewhere.]',
    });
    expect(mcpModelTextOverflow(result)).toBe(`${'a'.repeat(60_000)}\n${'b'.repeat(40_000)}`);
    expect(mcpModelTextOverflow({ content: [{ type: 'text', text: 'short' }] })).toBeUndefined();
  });

  it('bounds text and omits binary resource bytes from the text channel', () => {
    const projection = projectMcpModelContent({
      content: [
        {
          type: 'resource',
          resource: { uri: 'mcp://file', blob: 'SECRETBASE64', mimeType: 'application/pdf' },
        },
        { type: 'text', text: 'x'.repeat(256 * 1024) },
      ],
    });
    expect(JSON.stringify(projection)).not.toContain('SECRETBASE64');
    expect(JSON.stringify(projection).length).toBeLessThan(65 * 1024);
  });
});
