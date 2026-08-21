import type { McpServer } from '@/shared/data/types/mcpServer';

import { createMcpModule, type McpModuleDependencies } from '../createMcpModule';

function server(overrides: Partial<McpServer> = {}): McpServer {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    disabledTools: [],
    endpointUrl: 'https://example.com/mcp',
    id: 'server-1',
    isEnabled: true,
    name: 'Server',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createSubject() {
  const current = server();
  const dependencies: McpModuleDependencies = {
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
      remove: jest.fn(async () => undefined),
      update: jest.fn(async (_id, input) => server(input)),
    },
  };
  const backend = createMcpModule(dependencies);
  return { backend, dependencies };
}

describe('createMcpModule', () => {
  it('warms an enabled server after creation', async () => {
    const { backend, dependencies } = createSubject();

    const created = await backend.createServer({
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      name: 'Server',
    });

    expect(dependencies.runtime.warm).toHaveBeenCalledWith(created);
  });

  it('invalidates the transport and warms after a URL change', async () => {
    const { backend, dependencies } = createSubject();

    const result = await backend.updateServer('server-1', {
      endpointUrl: 'https://example.com/new-mcp',
    });

    expect(result.toolsChanged).toBe(true);
    expect(dependencies.runtime.invalidate).toHaveBeenCalledWith('server-1');
    expect(dependencies.runtime.warm).toHaveBeenCalledWith(result.server);
  });

  it('preserves the last runtime snapshot when a server is disabled', async () => {
    const { backend, dependencies } = createSubject();

    await backend.updateServer('server-1', { isEnabled: false });

    expect(dependencies.runtime.invalidate).toHaveBeenCalledWith('server-1', {
      preserveSnapshot: true,
    });
    expect(dependencies.runtime.warm).not.toHaveBeenCalled();
  });

  it('reports unchanged tools when a rename skips the runtime', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.updateServer('server-1', { name: 'Renamed' })).resolves.toMatchObject({
      toolsChanged: false,
    });
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

  it('invalidates runtime state after removing a server', async () => {
    const { backend, dependencies } = createSubject();

    await backend.removeServer('server-1');

    expect(dependencies.servers.remove).toHaveBeenCalledWith('server-1');
    expect(dependencies.runtime.invalidate).toHaveBeenCalledWith('server-1');
  });
});
