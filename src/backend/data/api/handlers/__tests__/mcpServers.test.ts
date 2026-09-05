import type { McpServerService } from '@/backend/data/services/McpServerService';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  createMcpServerHandlers,
  createMcpServerMutations,
  type McpServerMutations,
} from '../mcpServers';

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

function createMutationsSubject() {
  const current = server();
  const runtime = { invalidateServer: jest.fn() };
  const servers = {
    create: jest.fn(async () => current),
    delete: jest.fn(async () => undefined),
    getById: jest.fn(async () => current),
    update: jest.fn(async (_id: string, input: Partial<McpServer>) => server(input)),
  };
  return { mutations: createMcpServerMutations({ runtime, servers }), runtime, servers };
}

describe('createMcpServerMutations', () => {
  it('creates without touching the runtime', async () => {
    const { mutations, runtime, servers } = createMutationsSubject();

    await mutations.createServer({
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      name: 'Server',
    });

    expect(servers.create).toHaveBeenCalled();
    expect(runtime.invalidateServer).not.toHaveBeenCalled();
  });

  it('invalidates the runtime and reports changed tools after a URL change', async () => {
    const { mutations, runtime } = createMutationsSubject();

    const result = await mutations.updateServer('server-1', {
      endpointUrl: 'https://example.com/new-mcp',
    });

    expect(result.toolsChanged).toBe(true);
    expect(runtime.invalidateServer).toHaveBeenCalledWith('server-1');
  });

  it('invalidates the authenticated runtime after a header change', async () => {
    const { mutations, runtime } = createMutationsSubject();

    const result = await mutations.updateServer('server-1', {
      headers: { Authorization: 'Bearer next-token' },
    });

    expect(result.toolsChanged).toBe(true);
    expect(runtime.invalidateServer).toHaveBeenCalledWith('server-1');
  });

  it('preserves the last runtime snapshot when a server is disabled', async () => {
    const { mutations, runtime } = createMutationsSubject();

    await mutations.updateServer('server-1', { isEnabled: false });

    expect(runtime.invalidateServer).toHaveBeenCalledWith('server-1', {
      preserveSnapshot: true,
    });
  });

  it('reports unchanged tools when a rename skips the runtime', async () => {
    const { mutations, runtime, servers } = createMutationsSubject();

    await expect(mutations.updateServer('server-1', { name: 'Renamed' })).resolves.toMatchObject({
      toolsChanged: false,
    });
    expect(servers.getById).not.toHaveBeenCalled();
    expect(runtime.invalidateServer).not.toHaveBeenCalled();
  });

  it('invalidates runtime state after removing a server', async () => {
    const { mutations, runtime, servers } = createMutationsSubject();

    await mutations.removeServer('server-1');

    expect(servers.delete).toHaveBeenCalledWith('server-1');
    expect(runtime.invalidateServer).toHaveBeenCalledWith('server-1');
  });
});

describe('MCP server Data API handlers', () => {
  test('read through McpServerService and coordinate mutations with their side effects', async () => {
    const service = {
      getById: jest.fn(async () => ({ id: 'server-1' })),
      list: jest.fn(async () => ({ items: [], page: 1, total: 0 })),
    };
    const mutations = {
      createServer: jest.fn(async () => ({ id: 'server-1' })),
      removeServer: jest.fn(async () => undefined),
      updateServer: jest.fn(async () => ({ server: { id: 'server-1' }, toolsChanged: true })),
    };
    const handlers = createMcpServerHandlers(
      service as unknown as McpServerService,
      mutations as unknown as McpServerMutations,
    );

    await handlers['/mcp-servers'].GET({ query: { isEnabled: true } });
    await handlers['/mcp-servers'].POST({
      body: { endpointUrl: 'https://example.com/mcp', name: 'Server' },
    });
    await handlers['/mcp-servers/:id'].GET({ params: { id: 'server-1' } });
    await handlers['/mcp-servers/:id'].PATCH({
      body: { endpointUrl: 'https://example.com/next' },
      params: { id: 'server-1' },
    });
    await handlers['/mcp-servers/:id'].DELETE({ params: { id: 'server-1' } });

    expect(service.list).toHaveBeenCalledWith({ isEnabled: true });
    expect(service.getById).toHaveBeenCalledWith('server-1');
    expect(mutations.createServer).toHaveBeenCalledWith({
      endpointUrl: 'https://example.com/mcp',
      name: 'Server',
    });
    expect(mutations.updateServer).toHaveBeenCalledWith('server-1', {
      endpointUrl: 'https://example.com/next',
    });
    expect(mutations.removeServer).toHaveBeenCalledWith('server-1');
  });
});
