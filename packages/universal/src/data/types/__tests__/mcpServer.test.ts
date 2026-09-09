import { McpServerSchema } from '@shared/data/types/mcpServer';

const id = '00000000-0000-4000-8000-000000000000';

const server = {
  createdAt: '2026-01-01T00:00:00.000Z',
  disabledTools: ['search'],
  endpointUrl: 'https://example.com/mcp',
  id,
  isEnabled: true,
  name: 'Example',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('McpServerSchema', () => {
  it('stores the connection, the tool rules, and nothing else', () => {
    expect(McpServerSchema.parse(server)).toEqual(server);
  });

  it('requires every base field, so no consumer has to handle a half-written row', () => {
    for (const field of Object.keys(server)) {
      expect(() => McpServerSchema.parse({ ...server, [field]: undefined })).toThrow();
    }
  });

  it('rejects desktop transport and registry fields rather than storing them', () => {
    for (const field of ['type', 'command', 'timeout', 'sortOrder']) {
      expect(() => McpServerSchema.parse({ ...server, [field]: 'desktop-value' })).toThrow();
    }
  });

  it('stores string HTTP headers when the endpoint needs authentication or routing metadata', () => {
    const headers = { Authorization: 'Bearer token', 'X-Tenant': 'tenant-1' };

    expect(McpServerSchema.parse({ ...server, headers }).headers).toEqual(headers);
  });

  it('takes tool rules as a list of names, and rejects a bare one', () => {
    expect(McpServerSchema.parse({ ...server, disabledTools: [] }).disabledTools).toEqual([]);
    expect(() => McpServerSchema.parse({ ...server, disabledTools: 'search' })).toThrow();
  });

  it('rejects an endpoint that is not a URL', () => {
    expect(() => McpServerSchema.parse({ ...server, endpointUrl: 'example.com/mcp' })).toThrow();
  });

  it('requires a built-in grant identity and forbids remote credentials on it', () => {
    const builtin = {
      ...server,
      origin: 'builtin',
      builtinId: 'github',
      authorizationId: id,
      endpointUrl: null,
    };
    expect(McpServerSchema.parse(builtin)).toEqual(builtin);
    for (const patch of [
      { authorizationId: undefined },
      { builtinId: 'unknown' },
      { endpointUrl: 'https://example.com/mcp' },
      { headers: { Authorization: 'secret' } },
      { origin: 'remote' },
    ])
      expect(McpServerSchema.safeParse({ ...builtin, ...patch }).success).toBe(false);
    expect(McpServerSchema.safeParse({ ...server, authorizationId: id }).success).toBe(false);
  });
});
