import { McpServerSchema, StreamableHttpMcpServerSchema } from '@/shared/domain/mcpServer';

const id = '00000000-0000-4000-8000-000000000000';

describe('McpServerSchema desktop contract', () => {
  it('keeps the complete desktop field set and order', () => {
    expect(Object.keys(McpServerSchema.shape)).toEqual([
      'id',
      'name',
      'type',
      'description',
      'baseUrl',
      'command',
      'registryUrl',
      'args',
      'env',
      'headers',
      'provider',
      'providerUrl',
      'logoUrl',
      'tags',
      'longRunning',
      'timeout',
      'dxtVersion',
      'dxtPath',
      'reference',
      'searchKey',
      'configSample',
      'disabledTools',
      'disabledAutoApproveTools',
      'shouldConfig',
      'sortOrder',
      'isActive',
      'installSource',
      'isTrusted',
      'trustedAt',
      'installedAt',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('parses a complete desktop MCP entity without dropping metadata', () => {
    const entity = {
      args: ['--stdio'],
      baseUrl: 'https://example.com/mcp',
      command: 'node',
      configSample: { args: ['server.js'], command: 'node', env: { TOKEN: 'value' } },
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Desktop metadata',
      disabledAutoApproveTools: ['write'],
      disabledTools: ['delete'],
      dxtPath: '/packages/example',
      dxtVersion: '1.2.3',
      env: { NODE_ENV: 'production' },
      headers: { Authorization: 'Bearer token' },
      id,
      installSource: 'protocol' as const,
      installedAt: 1_700_000_000_000,
      isActive: true,
      isTrusted: true,
      logoUrl: 'https://example.com/logo.png',
      longRunning: true,
      name: 'Example',
      provider: 'Provider',
      providerUrl: 'https://provider.example',
      reference: 'https://example.com/docs',
      registryUrl: 'https://registry.example',
      searchKey: 'example',
      shouldConfig: true,
      sortOrder: 7,
      tags: ['search'],
      timeout: 30,
      trustedAt: 1_700_000_000_001,
      type: 'streamableHttp' as const,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(McpServerSchema.parse(entity)).toEqual(entity);
  });

  it('uses optional undefined for nullable DB columns and remains strict', () => {
    expect(McpServerSchema.parse({ id, isActive: false, name: 'Minimal' })).toEqual({
      id,
      isActive: false,
      name: 'Minimal',
    });
    expect(() =>
      McpServerSchema.parse({ description: null, id, isActive: false, name: 'Invalid' }),
    ).toThrow();
    expect(() =>
      McpServerSchema.parse({ id, isActive: false, name: 'Invalid', unknown: true }),
    ).toThrow();
  });
});

describe('StreamableHttpMcpServerSchema', () => {
  it('requires the normalized fields consumed by mobile', () => {
    const server = {
      baseUrl: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: '',
      disabledAutoApproveTools: [],
      disabledTools: [],
      headers: {},
      id,
      isActive: false,
      name: 'Incomplete synchronized row',
      type: 'streamableHttp' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(StreamableHttpMcpServerSchema.parse(server)).toEqual(server);
    expect(() => StreamableHttpMcpServerSchema.parse({ ...server, baseUrl: undefined })).toThrow();
    expect(() => StreamableHttpMcpServerSchema.parse({ ...server, type: 'stdio' })).toThrow();
  });
});
