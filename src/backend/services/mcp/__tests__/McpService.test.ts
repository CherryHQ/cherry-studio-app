import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';

import { McpService, type McpServiceDependencies } from '../McpService';

function server(overrides: Partial<StreamableHttpMcpServer> = {}): StreamableHttpMcpServer {
  return {
    baseUrl: 'https://example.com/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'Server',
    timeout: 30,
    type: 'streamableHttp',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createSubject() {
  const current = server();
  const dependencies: McpServiceDependencies = {
    runtime: {
      getRuntimeSummaries: jest.fn(async () => ({})),
      getServerInfo: jest.fn(async () => ({ name: 'Server', version: '1' })),
      invalidate: jest.fn(),
      listTools: jest.fn(async () => [{ name: 'search' }]),
      test: jest.fn(async () => [{ name: 'search' }]),
      warm: jest.fn(async () => undefined),
    },
    servers: {
      create: jest.fn(async () => current),
      get: jest.fn(async () => current),
      list: jest.fn(async () => ({ items: [current], page: 1, total: 1 })),
      remove: jest.fn(async () => undefined),
      update: jest.fn(async (_id, input) =>
        server({ ...input, timeout: input.timeout ?? undefined }),
      ),
    },
  };
  const backend = new McpService(dependencies);
  return { backend, dependencies };
}

describe('McpService', () => {
  it('warms an active server after creation', async () => {
    const { backend, dependencies } = createSubject();

    const created = await backend.createServer({
      baseUrl: 'https://example.com/mcp',
      isActive: true,
      name: 'Server',
    });

    expect(dependencies.runtime.warm).toHaveBeenCalledWith(created);
  });

  it('invalidates the transport and warms after a URL change', async () => {
    const { backend, dependencies } = createSubject();

    const result = await backend.updateServer('server-1', {
      baseUrl: 'https://example.com/new-mcp',
    });

    expect(result.toolsChanged).toBe(true);
    expect(dependencies.runtime.invalidate).toHaveBeenCalledWith('server-1');
    expect(dependencies.runtime.warm).toHaveBeenCalledWith(result.server);
  });

  it('preserves the last runtime snapshot when a server is disabled', async () => {
    const { backend, dependencies } = createSubject();

    await backend.updateServer('server-1', { isActive: false });

    expect(dependencies.runtime.invalidate).toHaveBeenCalledWith('server-1', {
      preserveSnapshot: true,
    });
    expect(dependencies.runtime.warm).not.toHaveBeenCalled();
  });

  it('reports unchanged tools when a policy-only update skips the runtime', async () => {
    const { backend, dependencies } = createSubject();

    await expect(
      backend.updateServer('server-1', { disabledTools: ['search'] }),
    ).resolves.toMatchObject({ toolsChanged: false });
    expect(dependencies.servers.get).not.toHaveBeenCalled();
    expect(dependencies.runtime.invalidate).not.toHaveBeenCalled();
    expect(dependencies.runtime.warm).not.toHaveBeenCalled();
  });

  it('loads the stored server before listing tools', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.listTools('server-1')).resolves.toEqual([{ name: 'search' }]);
    expect(dependencies.servers.get).toHaveBeenCalledWith('server-1');
    expect(dependencies.runtime.listTools).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'server-1',
      }),
    );
  });
});
