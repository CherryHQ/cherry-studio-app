import type { McpServerService } from '@/backend/data/services/McpServerService';

import { createMcpServerHandlers, type McpServerMutations } from '../mcpServers';

describe('MCP server Data API handlers', () => {
  test('read through McpServerService and coordinate mutations through McpModule', async () => {
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
