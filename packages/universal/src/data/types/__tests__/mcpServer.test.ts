import { McpServerSchema } from '@shared/data/types/mcpServer';

const id = '00000000-0000-4000-8000-000000000000';

const server = {
  createdAt: '2026-01-01T00:00:00.000Z',
  endpointUrl: 'https://example.com/mcp',
  id,
  isEnabled: true,
  name: 'Example',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('McpServerSchema', () => {
  it('stores the connection and nothing else', () => {
    expect(Object.keys(McpServerSchema.shape)).toEqual([
      'id',
      'name',
      'endpointUrl',
      'isEnabled',
      'createdAt',
      'updatedAt',
    ]);
    expect(McpServerSchema.parse(server)).toEqual(server);
  });

  it('requires every field, so no consumer has to handle a half-written row', () => {
    for (const field of Object.keys(server)) {
      expect(() => McpServerSchema.parse({ ...server, [field]: undefined })).toThrow();
    }
  });

  it('rejects desktop transport and registry fields rather than storing them', () => {
    for (const field of ['type', 'command', 'headers', 'timeout', 'disabledTools', 'sortOrder']) {
      expect(() => McpServerSchema.parse({ ...server, [field]: 'desktop-value' })).toThrow();
    }
  });

  it('rejects an endpoint that is not a URL', () => {
    expect(() => McpServerSchema.parse({ ...server, endpointUrl: 'example.com/mcp' })).toThrow();
  });
});
