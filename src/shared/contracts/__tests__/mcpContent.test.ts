import { projectMcpModelContent } from '../mcpContent';

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
